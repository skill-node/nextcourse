'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {planRecipeLock,applyLockPlan} = require('../composition/lock');
const {materializeRecipe}=require('../composition/materialize');
const {packageComposedCourse} = require('../composition/delivery');
const ROOT=path.resolve(__dirname,'..');
function workspace(t) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nc-delivery-catalog-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.cpSync(path.join(__dirname,'fixtures/composition-workspace'),dir,{recursive:true});
 const lock=planRecipeLock(dir,'office','workshop');assert(applyLockPlan(lock).applied);
 assert(materializeRecipe(dir,'office','workshop').materialized);
 const source=path.join(dir,'courses/office/package-src/workshop');fs.mkdirSync(source,{recursive:true});
 return {dir,source};
}
test('formal facilitator export has one catalog, readable answers, phased releases and an independent student package',t=>{
 const {dir,source}=workspace(t);
 const metadata={cases:{'prompt-engineering:case:rewrite-request':{stage:'课中',description:'先讨论后提供示例',releases:[{stage:1,when:'讨论后',paths:['student/data/sample.json']}]}}};
 fs.writeFileSync(path.join(source,'delivery.json'),JSON.stringify(metadata));
 const pkg=packageComposedCourse(dir,ROOT,'office','workshop',{render:true});assert(pkg.packaged,JSON.stringify(pkg.diagnostics));
 const original=fs.readFileSync(path.join(source,'delivery.json'));
 const cli=(...args)=>spawnSync(process.execPath,[path.join(ROOT,'nextcourse.js'),...args],{cwd:dir,env:{...process.env,NEXTCOURSE_HOME:dir},encoding:'utf8'});
 let r=cli('export','office','--recipe','workshop','--with-package','--audience','facilitator');assert.equal(r.status,0,r.stdout+r.stderr);
 const out=path.join(dir,'courses/office/.build/workshop/export');
 const index=fs.readFileSync(path.join(out,'index.html'),'utf8');
 for(const title of ['课件','课程蓝图','授课资料','学员资料','课件技术说明','逐页讲师备注','第1阶段发放'])assert(index.includes(title),title);
 assert(!/>facilitator-guide</.test(index));
 assert(fs.existsSync(path.join(out,'deck.html')));
 assert(fs.existsSync(path.join(out,'facilitator/handout.md')));
 assert(fs.existsSync(path.join(out,'facilitator/materials/prompt-engineering/rewrite-request/facilitator/answer.html')));
 assert(index.includes('facilitator/release/prompt-engineering/rewrite-request/stage-1/sample.json'));
 assert.equal(fs.readFileSync(path.join(out,'facilitator/release/prompt-engineering/rewrite-request/stage-1/sample.json'),'utf8'),fs.readFileSync(path.join(out,'student/materials/prompt-engineering/rewrite-request/student/data/sample.json'),'utf8'));
 assert(!fs.existsSync(path.join(out,'student/materials/prompt-engineering/rewrite-request/facilitator/answer.html')));
 assert(!fs.readFileSync(path.join(out,'student/index.html'),'utf8').includes('facilitator/answer'));
 const guide=fs.readFileSync(path.join(out,'facilitator/html/1_facilitator-guide.html'),'utf8');
 assert(guide.includes('facilitator/answer.html'));assert(!guide.includes('href="../materials/prompt-engineering/rewrite-request/facilitator/answer.md"'));
 r=cli('export','office','--recipe','workshop','--with-package');assert.equal(r.status,0,r.stdout+r.stderr);
 assert(!fs.existsSync(path.join(out,'facilitator')));
 assert(!fs.readFileSync(path.join(out,'index.html'),'utf8').includes('逐页讲师备注'));
 assert(!fs.existsSync(path.join(out,'package/materials/prompt-engineering/rewrite-request/facilitator/answer.html')));
 assert.deepEqual(fs.readFileSync(path.join(source,'delivery.json')),original);
});
test('release metadata cannot distribute an answer or escape the generated directory',t=>{
 const {dir,source}=workspace(t);
 for(const release of [{stage:'../../escape',paths:['student/data/sample.json']},{stage:1,paths:['facilitator/answer.md']}]){
  fs.writeFileSync(path.join(source,'delivery.json'),JSON.stringify({cases:{'prompt-engineering:case:rewrite-request':{releases:[release]}}}));
  const result=packageComposedCourse(dir,ROOT,'office','workshop',{render:true});assert.equal(result.packaged,false);assert(result.diagnostics.some(d=>/release|Release/.test(d.message)));
 }
 assert(!fs.existsSync(path.join(dir,'escape')));
});
