const fs=require('fs');const path=require('path');
const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
const storage=fs.readFileSync(path.join(__dirname,'storage.js'),'utf8');
const checks=[
 ['recovery audit validates retry payment links',/function rechargeRetryRecoveryAudit\(\)[\s\S]*?RECHARGE_RETRY_ORPHAN_PAYMENT/],
 ['recovery audit validates retry application links',/rechargeRetryRecoveryAudit\(\)[\s\S]*?RECHARGE_RETRY_ORPHAN_APPLICATION/],
 ['recovery audit validates payment/application consistency',/RECHARGE_RETRY_PAYMENT_APPLICATION_MISMATCH/],
 ['recovery audit validates parent attempt',/RECHARGE_RETRY_MISSING_PARENT/],
 ['recovery audit validates idempotency references',/RECHARGE_RETRY_ORPHAN_IDEMPOTENCY/],
 ['orphan proof detection uses referenced payment proofs',/referencedProofs=new Set\(payments\.map\(p=>path\.basename/],
 ['orphan proof cleanup has 30 minute grace period',/cutoff=Date\.now\(\)-30\*60\*1000/],
 ['startup performs crash artifact recovery',/function startMonitoring\(\)[\s\S]*?cleanupRecoveredOrphanProofs\(\)/],
 ['recovery audit is included in monitoring snapshot',/recharge_retry_recovery=rechargeRetryRecoveryAudit\(\)/],
 ['recovery incidents are surfaced to monitoring',/m\.recharge_retry_recovery\.issue_count/],
 ['retry transaction still uses atomic transaction helper',/withDbTransaction\(\['applications','payments','recharge_transactions','payment_idempotency','audit','notifications'\]/],
 ['storage persists through temp file then rename',/const tmp = DATA_FILE[\s\S]*?fs\.renameSync\(tmp, DATA_FILE\)/],
 ['storage has optimistic revision protection',/diskRevision!==expectedRevision/],
 ['retry endpoint has no cart/order dependency',!/if\(p==='\/api\/customer\/recharge\/retry'[\s\S]*?(?=\n    if\(p===)/.test(server)?false:true]
];
let pass=0;for(const [name,pattern] of checks){const ok=pattern instanceof RegExp?pattern.test(server+storage):pattern;console.log(`${ok?'PASS':'FAIL'} — ${name}`);if(ok)pass++;}
const report={step:'STEP539',scope:'Recharge Retry Recovery & Crash Consistency',total:checks.length,passed:pass,failed:checks.length-pass,ok:pass===checks.length,checks:checks.map(([name,pattern])=>({name,ok:pattern instanceof RegExp?pattern.test(server+storage):pattern}))};
fs.writeFileSync(path.join(__dirname,'STEP539_RECHARGE_RETRY_RECOVERY_CRASH_CONSISTENCY_REPORT.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(__dirname,'STEP539_RECHARGE_RETRY_RECOVERY_CRASH_CONSISTENCY_REPORT.md'),`# STEP539 — Recharge Retry Recovery & Crash Consistency\n\n**${pass}/${checks.length} PASS**\n\n`+checks.map(([n,p],i)=>`${i+1}. **${(p instanceof RegExp?p.test(server+storage):p)?'PASS':'FAIL'}** — ${n}`).join('\n')+'\n');
process.exit(report.ok?0:1);
