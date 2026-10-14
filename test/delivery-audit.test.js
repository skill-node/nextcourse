'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {inspectStatic,resolveRequest,contentHash,writeReceipt,verifyReceipt,runAudit,evidenceName}=require('../delivery-audit');
const {writeCatalog}=require('../delivery-navigation');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nc-audit-tests-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const root=path.join(dir,'bundle');fs.mkdirSync(root);return {root,dir};}
test('portable delivery checker detects broken links, escaping paths and student answer leaks',t=>{
 const {root}=fixture(t);fs.writeFileSync(path.join(root,'index.html'),'<a href="missing.html">Missing</a>');assert.throws(()=>inspectStatic(root),/Broken/);
 fs.writeFileSync(path.join(root,'index.html'),'<a href="../outside">Escape</a>');assert.throws(()=>inspectStatic(root),/escapes/);
 fs.writeFileSync(path.join(root,'index.html'),'<blockquote><strong>待补</strong>：活动指令</blockquote>');assert.throws(()=>inspectStatic(root),/Unfinished/);
 fs.writeFileSync(path.join(root,'index.html'),'<h1>Test</h1>');fs.mkdirSync(path.join(root,'student/facilitator'),{recursive:true});fs.writeFileSync(path.join(root,'student/facilitator/answer.md'),'hidden answer');assert.throws(()=>inspectStatic(root),/restricted/);
});
test('isolated browser route can only read files under the supplied delivery root',t=>{
 assert.notEqual(evidenceName('student/产品说明.html'),evidenceName('student/客户画像.html'));
 assert(evidenceName('x/'.repeat(200)+'input.html').length<200);
 const {root}=fixture(t);fs.writeFileSync(path.join(root,'index.html'),'Test');assert.equal(resolveRequest(root,'https://nextcourse.invalid/index.html'),path.join(root,'index.html'));
 assert.throws(()=>resolveRequest(root,'https://example.com/index.html'),/External/);
 assert.throws(()=>resolveRequest(root,'https://nextcourse.invalid/%2e%2e%2fprivate'),/escapes/);
});
test('acceptance receipts bind to the exact output bytes and cannot certify a failed or stale run',t=>{
 const {root}=fixture(t);fs.writeFileSync(path.join(root,'index.html'),'Original');const report={status:'passed',contentHash:contentHash(root),checks:[{passed:true}],finishedAt:'2026-10-14'};
 assert.throws(()=>writeReceipt(root,{...report,status:'failed'}),/failed/);writeReceipt(root,report);assert(verifyReceipt(root));
 fs.writeFileSync(path.join(root,'index.html'),'Modified');assert(!verifyReceipt(root));assert.throws(()=>writeReceipt(root,report),/stale/);
});
test('formal export fails closed without acceptance tools, preserves previous delivery and makes draft output distinct',t=>{
 const {dir}=fixture(t);const workspace=path.join(dir,'work');fs.cpSync(path.join(__dirname,'fixtures/independent-workspace'),workspace,{recursive:true});
 const root=path.resolve(__dirname,'..'),name='independent-s';const env={...process.env,NEXTCOURSE_HOME:workspace,NEXTCOURSE_PLAYWRIGHT_MODULE:path.join(dir,'missing-playwright')};
 const cli=(...args)=>spawnSync(process.execPath,[path.join(root,'nextcourse.js'),...args],{cwd:workspace,env,encoding:'utf8'});
 fs.appendFileSync(path.join(workspace,'courses',name,'course.meta.md'),'\n```yaml\nscale: M\n```\n');
 assert.equal(cli('build',name).status,0);const prior=path.join(workspace,'courses',name,'export');fs.mkdirSync(prior);fs.writeFileSync(path.join(prior,'index.html'),'previous accepted output');
 const result=cli('export',name);assert.equal(result.status,1);assert.match(result.stderr,/not published/);assert.equal(fs.readFileSync(path.join(prior,'index.html'),'utf8'),'previous accepted output');
 const delivered=cli('deliver',name);assert.equal(delivered.status,1);assert.match(delivered.stderr,/not published/);
 assert.equal(cli('export',name,'--draft').status,0);assert(fs.existsSync(path.join(workspace,'courses',name,'export-draft/delivery.draft.json')));assert(!verifyReceipt(path.join(workspace,'courses',name,'export-draft')));
});
test('real Playwright gate exercises disclosure, narrow layout and native printing, and rejects a broken interaction',{skip:!process.env.NEXTCOURSE_BROWSER_TESTS},async t=>{
 const {root,dir}=fixture(t);const css=fs.readFileSync(path.join(__dirname,'../shared_styles/package-doc.css'),'utf8');
 writeCatalog({file:path.join(root,'index.html'),title:'自动验收测试',subtitle:'合成测试数据',css,sections:[{title:'资料',open:true,rows:[{title:'测试文档',href:'document.html'}]}]});
 fs.writeFileSync(path.join(root,'document.html'),'<!doctype html><html><meta charset="utf-8"><style>@page{size:A4;margin:20mm}body{font:16px sans-serif}</style><h1>测试文档</h1><p>这是一份合成资料，用于验证浏览器及打印。</p><p>参考 <a href="https://example.com/guidance">官方说明</a> 完成检查。</p><style>@media print{a[href^="http"]::after{content:" (" attr(href) ")"}}</style></html>');
 const result=await runAudit(root,path.join(dir,'passed'));assert.equal(result.status,'passed',result.errors.join('\n'));assert.equal(result.documents.length,2);writeReceipt(root,result);assert(verifyReceipt(root));
 fs.appendFileSync(path.join(root,'document.html'),'<style>@media print{p{display:none}}</style>');
 const clipped=await runAudit(root,path.join(dir,'clipped'));assert.equal(clipped.status,'failed');assert.match(clipped.errors.join('\n'),/Text missing or clipped/);
 fs.writeFileSync(path.join(root,'document.html'),fs.readFileSync(path.join(root,'document.html'),'utf8').replace('<style>@media print{p{display:none}}</style>',''));
 const index=path.join(root,'index.html');fs.writeFileSync(index,fs.readFileSync(index,'utf8').replace('d.open=b.dataset.expand', 'd.open=false&&b.dataset.expand'));
 const broken=await runAudit(root,path.join(dir,'failed'));assert.equal(broken.status,'failed');assert.match(broken.errors.join('\n'),/Expand failed/);
});

test('Markdown pagination never creates a trailing blank sheet but retains real section breaks',()=>{
 const {mdToHtml}=require('../render-md');
 assert(!mdToHtml('# Feedback\n\nLast question.\n\n<!-- pagebreak -->\n<!-- author note -->').includes('page-break-before'));
 assert(mdToHtml('# Section one\n\n<!-- pagebreak -->\n\n## Section two').includes('page-break-before'));
 assert(mdToHtml('# Form\n\n<!-- pagebreak -->\n<!-- fill:4 -->').includes('page-break-before'));
});
