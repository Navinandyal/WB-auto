import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertDatabaseTarget, applyLocalDatabaseEnvironment } from '../src/server/database-target.ts';

const target = { DATABASE_TARGET_HOST: 'desired.example.invalid', DATABASE_TARGET_PORT: '48009', DATABASE_TARGET_NAME: 'railway' };
test('the chosen database accepts password rotation without changing the target', () => {
  assert.doesNotThrow(() => assertDatabaseTarget('postgresql://postgres:fixture@desired.example.invalid:48009/railway', target));
  assert.doesNotThrow(() => assertDatabaseTarget('postgresql://postgres:rotated@desired.example.invalid:48009/railway?sslmode=require', target));
});
test('a stale deployment URL cannot connect to a different database silently', () => {
  for (const url of [
    'postgresql://postgres:private-fixture@other.example.invalid:12215/railway',
    'postgresql://postgres:private-fixture@desired.example.invalid:12215/railway',
    'postgresql://postgres:private-fixture@desired.example.invalid:48009/other',
    'postgresql://postgres:private-fixture@desired.example.invalid:48009/railway?%68ost=other.example.invalid',
    'postgresql://postgres:private-fixture@desired.example.invalid:48009/railway?dbname=other',
    undefined,
  ]) {
    assert.throws(() => assertDatabaseTarget(url, target), error => {
      assert.ok(!(error as Error).message.includes('private-fixture'));
      return true;
    });
  }
});
test('unpinned existing deployments and explicitly pinned private networking remain supported', () => {
  assert.doesNotThrow(() => assertDatabaseTarget('postgresql://fixture@db.railway.internal/app', {}));
  assert.doesNotThrow(() => assertDatabaseTarget('postgresql://fixture@db.railway.internal/app', {
    DATABASE_TARGET_HOST:'db.railway.internal', DATABASE_TARGET_PORT:'5432', DATABASE_TARGET_NAME:'app',
  }));
});

test('local .env database wins over stale shell variables without changing other secrets', () => {
  const env: Record<string,string> = {NODE_ENV:'development', DATABASE_URL:'postgresql://fixture@old.example.invalid/railway', AUTH_TOKEN_SECRET:'shell-auth'};
  applyLocalDatabaseEnvironment(env, {DATABASE_URL:'postgresql://fixture@desired.example.invalid/railway',AUTH_TOKEN_SECRET:'file-auth',DATABASE_SSL:'true'});
  assert.equal(env.DATABASE_URL,'postgresql://fixture@desired.example.invalid/railway');
  assert.equal(env.AUTH_TOKEN_SECRET,'shell-auth');
});
test('production service variables remain authoritative and empty local values do not erase a connection', () => {
  const env = {NODE_ENV:'production', DATABASE_URL:'postgresql://fixture@desired.example.invalid/railway'};
  applyLocalDatabaseEnvironment(env, {DATABASE_URL:'postgresql://fixture@old.example.invalid/railway'});
  assert.equal(env.DATABASE_URL,'postgresql://fixture@desired.example.invalid/railway');
  const local = {DATABASE_URL:'postgresql://fixture@desired.example.invalid/railway'};
  applyLocalDatabaseEnvironment(local, {DATABASE_URL:''});
  assert.equal(local.DATABASE_URL,'postgresql://fixture@desired.example.invalid/railway');
});
