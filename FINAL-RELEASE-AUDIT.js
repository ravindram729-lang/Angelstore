const fs=require('fs');
const path=require('path');
const http=require('http');
const {spawn}=require('child_process');
const root=__dirname;
const checks=[];
const check=(name,ok,detail='')=>checks.push({name,ok:!!ok,detail});
const mustFiles=['server.js','storage.js','service-catalog.js','index.html','customer.html','admin.html','staff.html','app.js','style.css','.env.example','render.yaml','PRODUCTION-PREFLIGHT.js','PHASE-34-SECURITY-ABUSE-AUDIT.md','PHASE-33-BACKUP-RESTORE-CONCURRENCY.md'];
for(const f of mustFiles)check(`File: ${f}`,fs.existsSync(path.join(root,f)),'Required release artifact');
let pkg={}; try{pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));check('package.json parse',true)}catch(e){check('package.json parse',false,e.message)}
check('Start command',pkg.scripts?.start==='node server.js',JSON.stringify(pkg.scripts||{}));
check('Preflight script',pkg.scripts?.preflight==='node PRODUCTION-PREFLIGHT.js','Production preflight available');
check('Release audit script',pkg.scripts?.['release-audit']==='node FINAL-RELEASE-AUDIT.js','Final audit available');
let server='';try{server=fs.readFileSync(path.join(root,'server.js'),'utf8')}catch{}
let app='';try{app=fs.readFileSync(path.join(root,'app.js'),'utf8')}catch{}
let catalog='';try{catalog=fs.readFileSync(path.join(root,'service-catalog.js'),'utf8')}catch{}
check('Production config gate',/PRODUCTION_CONFIG_ERROR/.test(server)&&/server\.listen\(/.test(server),'Invalid production configuration blocks startup');
check('Strong production auth secret gate',/CONFIGURED_AUTH_SECRET\.length>=32/.test(server)&&/SECRET_HAS_ENTROPY/.test(server),'Minimum length and character diversity enforced');
check('Explicit production CORS gate',/VALID_PRODUCTION_ORIGIN/.test(server)&&/FRONTEND_ORIGINS\.every/.test(server)&&/https:/.test(server),'Explicit HTTPS origin(s) required; wildcard CORS is forbidden');
check('Session expiry/revocation',/revoked_at/.test(server)&&/expires_at/.test(server),'Session records checked');
check('Payload limit',/15\*1024\*1024/.test(server),'15 MB request body guard');
check('Security headers',/X-Content-Type-Options/.test(server)&&/X-Frame-Options/.test(server)&&/Strict-Transport-Security/.test(server),'Security response headers present');
check('Static sensitive-file blocking',/data\.json.*uploads.*\.env.*server\.js/.test(server),'Sensitive static paths blocked');
check('UTR validation',/function validUtr/.test(server)&&/duplicate/i.test(server),'UTR validation/duplicate protection present');
check('Token/payment duplicate protection',/payment_id/.test(server)&&/409/.test(server),'Conflict responses and payment-token linkage present');
check('Monitoring/incident system',/api\/admin\/monitoring/.test(server)&&/reconcileIncidents/.test(server),'Monitoring and incident reconciliation present');
check('Backup restore',/createManagedBackup/.test(server)&&/restore/i.test(server),'Managed backup/restore logic present');
check('Frontend backend URL handling',/backendUrl/.test(app),'Frontend backend URL configuration present');
const serviceMatches=[...catalog.matchAll(/services\s*:\s*\[/g)].length;
check('Service catalog present',serviceMatches>0,`service catalog sections=${serviceMatches}`);
let render='';try{render=fs.readFileSync(path.join(root,'render.yaml'),'utf8')}catch{}
check('Render health check',/healthCheckPath:\s*\/api\/health/.test(render),'Render health endpoint configured');
check('Render persistent disk',/mountPath:\s*\/var\/data\/angelstore/.test(render),'Persistent disk configured');
check('Render production mode',/NODE_ENV\n\s+value: production/.test(render),'Production environment configured');
check('No node_modules in release',!fs.existsSync(path.join(root,'node_modules')),'Dependencies installed by deployment build');

function request(port,pathname,opts={}){return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:pathname,method:opts.method||'GET',headers:opts.headers||{}},res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:b}))});req.on('error',reject);if(opts.body)req.write(opts.body);req.end()})}
async function runtime(){
 const tmp=fs.mkdtempSync(path.join(require('os').tmpdir(),'angelstore-release-'));
 const port=18000+Math.floor(Math.random()*1000);
 const env={...process.env,PORT:String(port),NODE_ENV:'',ANGELSTORE_STORAGE_DIR:tmp,ANGELSTORE_UPLOAD_DIR:path.join(tmp,'uploads','payments'),ANGELSTORE_BACKUP_DIR:path.join(tmp,'backups'),ANGELSTORE_SCHEDULED_BACKUP:'false',ANGELSTORE_ALERT_WEBHOOK_URL:''};
 const child=spawn(process.execPath,['server.js'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',d=>stderr+=d.toString());
 try{
   let health=null; for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,100));try{health=await request(port,'/api/health');if(health.status)break}catch{}}
   check('Runtime health',health?.status===200,`status=${health?.status||'no response'}`);
   const services=await request(port,'/api/services');
   check('Runtime public services',services.status===200,`status=${services.status}`);
   const admin=await request(port,'/api/admin/monitoring');
   check('Runtime admin protected',admin.status===401,`status=${admin.status}`);
   const traversal=await request(port,'/../../server.js');
   check('Runtime static traversal blocked',traversal.status===403||traversal.status===404,`status=${traversal.status}`);
 }catch(e){check('Runtime smoke',false,e.message)}
 finally{child.kill('SIGTERM');await new Promise(r=>setTimeout(r,100));try{fs.rmSync(tmp,{recursive:true,force:true})}catch{} }
 if(stderr.includes('Production startup blocked'))check('Unexpected production startup block',false,stderr.trim());
}

(async()=>{
 await runtime();
 const result={ok:checks.every(x=>x.ok),generated_at:new Date().toISOString(),checks};
 console.log(JSON.stringify(result,null,2));
 fs.writeFileSync(path.join(root,'PHASE-35-FINAL-RELEASE-AUDIT-RESULT.json'),JSON.stringify(result,null,2));
 process.exit(result.ok?0:1);
})().catch(e=>{console.error(e);process.exit(1)});
