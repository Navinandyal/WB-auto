import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import ts from 'typescript';

test('the generated Coexistence bridge contains valid JavaScript and the required SDK options',()=>{
  const source=ts.createSourceFile('server.ts',readFileSync(new URL('../server.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  let html='';
  const visit=(node:ts.Node)=>{
    if(ts.isTemplateExpression(node)&&node.head.text.toLowerCase().includes('<!doctype html>')&&node.getText(source).includes('whatsapp_business_app_onboarding')){
      html=node.head.text;
      for(const span of node.templateSpans)html+='"test-config"'+span.literal.text;
    }
    ts.forEachChild(node,visit);
  };
  visit(source);
  assert.ok(html,'Missing signup bridge');
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  assert.ok(scripts.length);
  for(const script of scripts)new Script(script);
  assert.match(html,/FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING/);
  assert.match(html,/featureType:'whatsapp_business_app_onboarding'/);
  assert.match(html,/response_type:'code'/);
  assert.match(html,/window\.fbAsyncInit/);
  assert.match(html,/history\.replaceState/);
});
