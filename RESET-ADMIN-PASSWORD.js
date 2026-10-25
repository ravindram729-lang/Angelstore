const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const readline=require('readline');
const STORAGE=require('./storage');
const rl=readline.createInterface({input:process.stdin,output:process.stdout});
const q=(s)=>new Promise(r=>rl.question(s,r));
// Must match server.js adminPasswordHash (N:16384,r:8,p:1) or login will fail after reset.
function hash(password){const salt=crypto.randomBytes(16).toString('hex');const h=crypto.scryptSync(String(password),salt,64,{N:16384,r:8,p:1}).toString('hex');return {salt,hash:h};}
(async()=>{try{
 console.log('\nAngelstore CSC — Local Admin Password Recovery');
 console.log('यह utility केवल उसी computer पर चलाएँ जहाँ Angelstore की files सुरक्षित हैं.');
 const confirm=String(await q('Type RESET ANGELSTORE ADMIN to continue: ')).trim();
 if(confirm!=='RESET ANGELSTORE ADMIN'){console.log('Cancelled.');return;}
 const username=String(await q('Admin User ID [ravindram143]: ')).trim()||'ravindram143';
 const p1=String(await q('New password (minimum 12 characters): '));
 const p2=String(await q('Confirm new password: '));
 if(p1.length<12)throw new Error('Password must be at least 12 characters.');
 if(p1!==p2)throw new Error('Passwords do not match.');
 const db=STORAGE.load();const h=hash(p1);db.admin_credentials=[{username,salt:h.salt,hash:h.hash,created_at:db.admin_credentials?.[0]?.created_at||new Date().toISOString(),updated_at:new Date().toISOString(),source:'local-recovery'}];
 (db.admin_sessions||[]).forEach(s=>s.revoked_at=new Date().toISOString());db.audit=db.audit||[];db.audit.unshift({id:Number(String(Date.now())+String(crypto.randomInt(100,999))),action:'ADMIN_PASSWORD_RECOVERY',by:username,at:new Date().toISOString()});STORAGE.save(db);
 console.log('Password updated successfully. Start/restart server and login with the new password.');
}catch(e){console.error('Reset failed:',e.message);process.exitCode=1}finally{rl.close()}})();
