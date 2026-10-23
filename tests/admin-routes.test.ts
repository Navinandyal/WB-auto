import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import express from 'express';
import { transformSync } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq, desc, count, sql, and, inArray } from 'drizzle-orm';
import * as schema from '../src/db/schema.ts';
import { createAccessToken, verifySessionToken } from '../src/lib/password-auth.ts';
import { messageMonitor } from '../src/server/admin-message-monitor.ts';
import { savedMediaPreview } from '../src/server/saved-media-preview.ts';
import { publicPolicyPage, publicPolicyHeaders } from '../src/server/public-policies.ts';

const database = new PGlite();
const db = drizzle(database, { schema });
const app = express();
let server: ReturnType<typeof app.listen>;
let origin: string;
const tokens = Object.fromEntries([['admin', 1], ['business_user', 2]].map(([role, id]) =>
  [role, createAccessToken({ id: Number(id), role: String(role), uid: `route-${id}`, name: 'Fixture', phone: '', email: 'fixture@example.invalid' })]));

before(async () => {
  const bootstrap = await readFile(new URL('../src/db/index.ts', import.meta.url), 'utf8');
  await database.exec(bootstrap.match(/await client.query\(`([\s\S]*?)`\);/)![1]);
  await database.exec(`
    INSERT INTO users(id,uid,email,phone,name,role,is_active,approval_status,business_name,business_address,password_hash) VALUES
      (1,'route-1','admin@example.invalid','+919000000001','Admin','admin',TRUE,'ACTIVE',NULL,NULL,'fixture-password-hash'),
      (2,'route-2','owner@example.invalid','+919000000002','First Owner','business_user',TRUE,'ACTIVE','First Business','First Address','fixture-password-hash'),
      (3,'route-3','other@example.invalid','+919000000003','Other Owner','business_user',TRUE,'ACTIVE','Other Business','Other Address','fixture-password-hash');
    INSERT INTO contacts(id,owner_user_id,name,phone,opt_in) VALUES
      (1,2,'Asha','+919999999991',TRUE),(2,3,'Other','+919999999992',TRUE);
    INSERT INTO message_templates(id,owner_user_id,name,language,category,status,components) VALUES
      (1,2,'hello','en_US','MARKETING','APPROVED','[{"type":"BODY","text":"Hi {{1}}"}]');
    INSERT INTO subscription_packages(id,name,price_paise,duration_months) VALUES(1,'Review Plan',50000,1);
    INSERT INTO user_subscriptions(id,user_id,package_id,status,price_paise_snapshot,message_limit_snapshot) VALUES(1,2,1,'PENDING',50000,1000);
    INSERT INTO whatsapp_accounts(owner_user_id,meta_app_id,meta_app_secret,access_token,business_account_id,phone_number_id,business_phone,connection_status) VALUES
      (2,'app-fixture','fixture-private-secret','fixture-private-token','waba-fixture','phone-fixture','+919000000002','CONNECTED');
    INSERT INTO message_media(media_id,owner_user_id,mime_type,file_name,data_base64) VALUES('route-media',2,'application/pdf','sample.pdf','data:application/pdf;base64,dGVzdA==');
    INSERT INTO messages(owner_user_id,contact_id,direction,status,content) VALUES(2,1,'OUTBOUND','SENT','Hi Asha');
  `);
  // Execute the production authentication middleware with real JWTs and PGlite.
  const auth = await readFile(new URL('../src/middleware/auth.ts', import.meta.url), 'utf8');
  const module = { exports: {} as any };
  vm.runInNewContext(transformSync(auth.replace(/^import[^\n]*;\s*$/gm, ''), { loader: 'ts', format: 'cjs' }).code,
    { module, exports: module.exports, db, eq, users: schema.users, verifySessionToken });
  const source = await readFile(new URL('../server.ts', import.meta.url), 'utf8');
  const context = { app, ...schema, db, pool: database, eq, desc, count, sql, and, inArray,
    ...module.exports, messageMonitor, savedMediaPreview, publicPolicyPage, publicPolicyHeaders };
  for (const path of ['/api/admin/contacts','/api/admin/templates','/api/admin/subscriptions','/api/admin/businesses/:id','/api/admin/scheduled-messages','/api/admin/message-media/:id/preview']) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const route = source.match(new RegExp("app.get\\('" + escaped + "'[\\s\\S]*?\\n\\}\\);"));
    assert.ok(route, path);
    vm.runInNewContext(transformSync(route[0], { loader: 'ts' }).code, context);
  }
  const policies = source.match(/for \(const slug of \['privacy-policy', 'terms-and-conditions'\]\) \{[\s\S]*?\n\}/);
  assert.ok(policies);
  vm.runInNewContext(transformSync(policies[0], {loader:'ts'}).code, context);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await database.close();
});
async function get(path: string, role?: string) {
  return fetch(origin + path, {headers: role ? {Authorization:'Bearer '+tokens[role]} : {}});
}

test('new admin data and media endpoints require a real authenticated admin', async () => {
  for (const path of ['/api/admin/contacts','/api/admin/templates','/api/admin/subscriptions','/api/admin/businesses/2','/api/admin/scheduled-messages','/api/admin/message-media/route-media/preview']) {
    assert.equal((await get(path)).status, 401, path);
    assert.equal((await get(path,'business_user')).status, 403, path);
    assert.equal((await get(path,'admin')).status, 200, path);
  }
});
test('directories and request review expose the correct business owner metadata', async () => {
  const contacts = await (await get('/api/admin/contacts','admin')).json();
  assert.deepEqual(contacts.map((r:any)=>r.businessId).sort(), [2,3]);
  const templates = await (await get('/api/admin/templates','admin')).json();
  assert.equal(templates[0].ownerName,'First Owner');
  assert.equal(templates[0].ownerPhone,'+919000000002');
  assert.equal(templates[0].components[0].text,'Hi {{1}}');
  const requests = await (await get('/api/admin/subscriptions','admin')).json();
  assert.equal(requests[0].businessAddress,'First Address');
  assert.equal(requests[0].email,'owner@example.invalid');
  assert.equal(requests[0].businessStatus,'ACTIVE');
});
test('business inspection omits password hashes and WhatsApp secrets', async () => {
  const data = await (await get('/api/admin/businesses/2','admin')).json();
  assert.equal(data.business.businessName,'First Business');
  assert.equal(data.whatsapp.accessTokenStored,true);
  const serialized = JSON.stringify(data);
  assert.ok(!serialized.includes('fixture-private-'));
  assert.ok(!serialized.includes('passwordHash'));
  assert.equal((await get('/api/admin/businesses/999','admin')).status,404);
});
test('daily view honors owner filters and rejects invalid input over HTTP', async () => {
  const data = await (await get('/api/admin/scheduled-messages?businessId=2','admin')).json();
  assert.equal(data.summary.total,1);
  assert.equal(data.items[0].contactPhone,'+919999999991');
  assert.equal((await get('/api/admin/scheduled-messages?businessId=oops','admin')).status,400);
  assert.equal((await get('/api/admin/scheduled-messages?start=2026-02-30','admin')).status,400);
});
test('website policy URLs work publicly and return protected readable HTML', async () => {
  for (const path of ['/privacy-policy','/terms-and-conditions']) {
    const response = await get(path);
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type')!,/text\/html/);
    assert.match(response.headers.get('content-security-policy')!,/default-src 'none'/);
    const html = await response.text();
    assert.equal((html.match(/<section>/g)||[]).length,10);
    assert.ok(html.includes('GreetSync'));
    assert.ok(!html.includes('<script'));
  }
  assert.equal(publicPolicyPage('missing'),null);
});
