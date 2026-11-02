/* AngelStore CSC — Global Token Timer (Admin / Customer / Staff) */
(function(){
'use strict';
const panel=document.body?.dataset?.panel||'';
const $=s=>document.querySelector(s);
let state=null, poll=null, tick=null, busy=false;
const langKey='angelstoreLanguage';
function isEn(){return localStorage.getItem(langKey)==='en'}
function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function fmt(ms){
  ms=Math.max(0,Number(ms)||0);
  const s=Math.floor(ms/1000), h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
  return h?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
function labels(){return isEn()?{timer:'Token Timer',work:'Work',hold:'Hold',waiting:'Waiting',called:'Called',complete:'Completed',none:'No active token',overdue:'Overdue',left:'left',elapsed:'elapsed',token:'Token'}:{timer:'टोकन टाइमर',work:'काम',hold:'पेंडिंग',waiting:'प्रतीक्षा',called:'बुलाया',complete:'पूर्ण',none:'कोई active token नहीं',overdue:'समय पार',left:'बाकी',elapsed:'बीत चुका',token:'टोकन'}}
function inject(){
  if($('#angelGlobalTimer'))return;
  const style=document.createElement('style');style.id='angel-global-timer-style';style.textContent=`
  #angelGlobalTimer{display:flex;align-items:center;gap:9px;width:100%;box-sizing:border-box;margin:10px 0 0;padding:9px 11px;border:1px solid #c8dcf3;border-radius:10px;background:#f7fbff;color:#16314d;box-shadow:0 2px 8px rgba(18,73,128,.06);font-size:11px;line-height:1.15}
  #angelGlobalTimer .agt-icon{font-size:16px}#angelGlobalTimer .agt-main{min-width:0;flex:1}#angelGlobalTimer .agt-top{display:flex;gap:7px;align-items:center;font-weight:800}#angelGlobalTimer .agt-token{font-weight:900;color:#0758aa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#angelGlobalTimer .agt-time{font-size:16px;font-weight:900;letter-spacing:.3px}#angelGlobalTimer .agt-sub{color:#6c7f94;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#angelGlobalTimer.agt-work .agt-time{color:#16834b}#angelGlobalTimer.agt-hold .agt-time{color:#c77900}#angelGlobalTimer.agt-overdue .agt-time{color:#b42318}#angelGlobalTimer.agt-idle .agt-time{color:#6c7f94}
  .staff-token-timer{margin:0 0 12px}.staff-token-timer #angelGlobalTimer{margin:0}
  @media(max-width:650px){#angelGlobalTimer{padding:8px 9px}.agt-sub{display:block!important}#angelGlobalTimer .agt-time{font-size:14px}}
  `;document.head.appendChild(style);
  const el=document.createElement('div');el.id='angelGlobalTimer';el.className='agt-idle';el.setAttribute('aria-live','polite');el.innerHTML='<span class="agt-icon">⏱</span><div class="agt-main"><div class="agt-top"><span class="agt-label"></span><span class="agt-token"></span></div><div class="agt-time">—</div><div class="agt-sub"></div></div>';
  let host=null;
  if(panel==='customer') host=$('.customer-ticket');
  else if(panel==='staff') host=$('.staff-token-timer');
  else if(panel==='admin') host=null; // Admin already has the contextual Work/Pending timer inside #tokenRuntimeMeta.
  if(host)host.appendChild(el);
}
function apiFetch(path,headers){return fetch(path,{headers:{...(headers||{})}}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Request failed');return d})}
function getAdmin(){const token=localStorage.getItem('angelAccessToken');return apiFetch('/api/tokens',token?{Authorization:'Bearer '+token}:{}).then(d=>({mode:'admin',token:d.control_current||d.current||null}))}
function getCustomer(){const s=localStorage.getItem('angelCustomerSession')||localStorage.getItem('angelGuestSession');if(!s)return Promise.resolve({mode:'customer',token:null});return apiFetch('/api/customer/progress',{ 'X-Customer-Session':s }).then(d=>({mode:'customer',progress:d.progress||null,token:d.progress?.token||null}))}
function getStaff(){const s=localStorage.getItem('angelStaffSession');if(!s)return Promise.resolve({mode:'staff',token:null});return apiFetch('/api/staff/dashboard',{'X-Staff-Session':s}).then(d=>{const rows=d.tasks||[];const token=rows.find(x=>['प्रगति','होल्ड','बुलाया'].includes(x.status))||rows.find(x=>!['पूर्ण','रद्द','स्किप'].includes(x.status))||null;return {mode:'staff',token}})}
async function pollState(){if(busy)return;busy=true;try{state=panel==='admin'?await getAdmin():panel==='customer'?await getCustomer():panel==='staff'?await getStaff():null;render()}catch(e){state=null;render()}finally{busy=false}}
function tokenTime(t){
  if(!t)return {cls:'agt-idle',time:'—',sub:labels().none};
  const l=labels(), status=String(t.status||'');
  if(status==='पूर्ण')return {cls:'agt-idle',time:l.complete,sub:`${l.token} ${t.token||'—'}`};
  if(status==='होल्ड'){
    const deadline=t.hold_deadline?new Date(t.hold_deadline).getTime():null;
    if(deadline){const diff=deadline-Date.now();return {cls:diff<0?'agt-overdue':'agt-hold',time:fmt(Math.abs(diff)),sub:diff<0?`${l.overdue} · ${t.hold_reason||''}`:`${l.hold} · ${fmt(Math.abs(diff))} ${l.left}`}}
    return {cls:'agt-hold',time:'—',sub:`${l.hold} · ${t.hold_reason||''}`};
  }
  if(status==='प्रगति'&&t.started_at)return {cls:'agt-work',time:fmt(Date.now()-new Date(t.started_at).getTime()),sub:`${l.work} · ${l.elapsed}`};
  if(status==='बुलाया'&&t.last_action_at)return {cls:'agt-work',time:fmt(Date.now()-new Date(t.last_action_at).getTime()),sub:`${l.called} · ${l.elapsed}`};
  return {cls:'agt-idle',time:l.waiting,sub:`${l.token} ${t.token||'—'} · ${l.waiting}`};
}
function render(){
  const el=$('#angelGlobalTimer');if(!el)return;const l=labels();const t=state?.token;const x=tokenTime(t);el.className=x.cls;el.querySelector('.agt-label').textContent=l.timer;el.querySelector('.agt-token').textContent=t?.token?`#${t.token}`:'';el.querySelector('.agt-time').textContent=x.time;el.querySelector('.agt-sub').textContent=x.sub;
}
function start(){inject();render();pollState();clearInterval(poll);poll=setInterval(pollState,5000);clearInterval(tick);tick=setInterval(render,1000);window.addEventListener('storage',e=>{if(e.key===langKey)render()});document.addEventListener('visibilitychange',()=>{if(!document.hidden)pollState()});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
