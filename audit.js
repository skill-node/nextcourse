#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {COURSES_DIR,courseDir,requireCourse}=require('./paths');
const {runAudit,writeReceipt}=require('./delivery-audit');
const args=process.argv.slice(2),name=args[0];
requireCourse(name,'audit');
function option(flag){const i=args.indexOf(flag);return i<0?null:args[i+1];}
const dir=courseDir(name),delivery=path.resolve(option('--delivery')||path.join(dir,'export'));
const evidence=path.join(COURSES_DIR,name,'.review',path.basename(dir),'delivery-audit-'+Date.now());
(async()=>{
 const report=await runAudit(delivery,evidence,{onProgress:message=>{if(!args.includes('--json'))console.log('  '+message);}});
 if(report.status==='passed')writeReceipt(delivery,report);
 if(args.includes('--json'))console.log(JSON.stringify({...report,evidence},null,2));
 else {console.log(`\nDelivery acceptance: ${report.status}\nEvidence: ${evidence}`);for(const error of report.errors)console.error(error);}
 process.exitCode=report.status==='passed'?0:1;
})().catch(error=>{console.error(error.message);process.exitCode=1;});
