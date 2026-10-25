const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);const escapeHtml=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');let currentMobile=localStorage.getItem('angelCustomerMobile')||'';let lastRecords={};let services=['आधार सेवाएँ','पैन सेवाएँ','प्रमाण पत्र सेवाएँ','बैंकिंग सेवाएँ','किसान सेवाएँ','बीमा सेवाएँ','टैक्स एवं GST','शिक्षा एवं छात्र','यातायात सेवाएँ','वाहन सेवाएँ','संपत्ति एवं भूमि','कानूनी सेवाएँ','स्वास्थ्य सेवाएँ','डिजिटल सेवाएँ','अन्य नागरिक सेवाएँ','मोबाइल रिचार्ज','बिजली बिल भुगतान','पानी बिल भुगतान','यात्रा टिकट','सरकारी योजना','ई-गवर्नेंस सेवाएँ','डाक एवं कुरियर','पेंशन सेवाएँ','परिवार रजिस्टर'];
const serviceMeta={
'आधार सेवाएँ':['icon-01.png','popular'],'पैन सेवाएँ':['icon-07.png','popular'],'प्रमाण पत्र सेवाएँ':['icon-12.png','gov'],'बैंकिंग सेवाएँ':['icon-08.png','popular'],'किसान सेवाएँ':['icon-11.png','gov'],'बीमा सेवाएँ':['icon-17.png','digital'],'टैक्स एवं GST':['icon-24.png','gov'],'शिक्षा एवं छात्र':['icon-28.png','digital'],'यातायात सेवाएँ':['icon-16.png','digital'],'वाहन सेवाएँ':['icon-16.png','digital'],'संपत्ति एवं भूमि':['icon-10.png','gov'],'कानूनी सेवाएँ':['icon-33.png','gov'],'स्वास्थ्य सेवाएँ':['icon-15.png','gov'],'डिजिटल सेवाएँ':['icon-32.png','digital'],'अन्य नागरिक सेवाएँ':['icon-36.png','new'],'मोबाइल रिचार्ज':['icon-19.png','digital'],'बिजली बिल भुगतान':['icon-21.png','digital'],'पानी बिल भुगतान':['icon-23.png','digital'],'यात्रा टिकट':['icon-31.png','digital'],'सरकारी योजना':['icon-11.png','gov'],'ई-गवर्नेंस सेवाएँ':['icon-32.png','new'],'डाक एवं कुरियर':['icon-35.png','digital'],'पेंशन सेवाएँ':['icon-18.png','gov'],'परिवार रजिस्टर':['icon-03.png','gov']};function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
const BACKEND_KEY='angelBackendUrl';
const BACKEND_PRODUCTION_URL='https://angelstore-csc-project4.onrender.com';
const host=location.hostname;
const isProductionFrontend=host.endsWith('angelcsc.in')||host.endsWith('netlify.app');
const BACKEND_DEFAULT=(location.protocol==='file:'||host==='127.0.0.1'||host==='localhost')?'http://127.0.0.1:8000':(isProductionFrontend?BACKEND_PRODUCTION_URL:location.origin);
const SAVED_BACKEND=(localStorage.getItem('angelBackendUrl')||'').trim();
let backendUrl=(location.protocol==='file:'||location.hostname==='127.0.0.1'||location.hostname==='localhost')?BACKEND_DEFAULT:(SAVED_BACKEND||BACKEND_DEFAULT);
async function api(path,opts={}){
 const headers={...(opts.headers||{})};const cs=localStorage.getItem('angelCustomerSession')||localStorage.getItem('angelGuestSession');if(cs)headers['X-Customer-Session']=cs;if(!(opts.body instanceof FormData))headers['Content-Type']='application/json';
 let r;try{r=await fetch(backendUrl.replace(/\/$/,'')+path,{...opts,headers})}catch(e){throw Error('Backend से connection नहीं हो रहा। START-CUSTOMER.bat से server चलाएँ।')}
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||('Request failed ('+r.status+')'));return d
}
let authBusy=false;
function setAuthMessage(msg,ok=false){const el=$('#authMessage');if(el){el.textContent=msg;el.style.color=ok?'#16834b':'#b42318'}}
function setAuthMode(mode){const login=mode==='login';$('#authTitle').textContent=login?'Customer Login':'New Customer Registration';$('#authSubtitle').textContent=login?'Customer ID या mobile number और PIN से login करें।':'नाम, mobile और 4–6 digit PIN से account बनाएं। SMS OTP की जरूरत नहीं है।';$('#authLoginTab').classList.toggle('active',login);$('#authRegisterTab').classList.toggle('active',!login);$('#authLoginForm').classList.toggle('hidden',!login);$('#authRegisterForm').classList.toggle('hidden',login);$('#customerQrCard').classList.add('hidden');setAuthMessage('')}
function hasCustomerLogin(){return !!localStorage.getItem('angelCustomerSession')}
function hasGuestSession(){return !!localStorage.getItem('angelGuestSession')}
function openCustomerLogin(message=''){setAuthMode('login');if(message)setAuthMessage(message);$('#customerAuthOverlay').classList.remove('hidden');$('#customerAuthOverlay').setAttribute('aria-hidden','false');$('#authIdentifier')?.focus();}
function closeCustomerLogin(){$('#customerAuthOverlay').classList.add('hidden');$('#customerAuthOverlay').setAttribute('aria-hidden','true');setAuthMessage('')}
function saveCustomerAuth(d){localStorage.removeItem('angelGuestSession');localStorage.setItem('angelCustomerSession',d.session_token);localStorage.setItem('angelCustomerProfile',JSON.stringify(d.customer));localStorage.setItem('angelCustomerMobile',d.customer.mobile);localStorage.setItem('angelCustomerQrPayload',d.qr_payload||('ANGELSTORE|CUSTOMER|'+d.customer.customer_id));currentMobile=d.customer.mobile;updateCustomerHeader(d.customer);drawCustomerQr(d.qr_payload||('ANGELSTORE|CUSTOMER|'+d.customer.customer_id));closeCustomerLogin();}
function updateCustomerHeader(c){const n=$('#customerHeaderName'),login=$('#customerHeaderLogin'),logout=$('#customerHeaderLogout');if(hasCustomerLogin()&&c){if(n)n.textContent='👤 '+(c.name||'Customer')+' · '+(c.customer_id||'');if(login)login.classList.add('hidden');if(logout)logout.classList.remove('hidden');}else{if(n)n.textContent='👤 Guest Customer';if(login)login.classList.remove('hidden');if(logout)logout.classList.add('hidden');}}
async function drawCustomerQr(payload){const card=$('#customerQrCard'),canvas=$('#customerQrCanvas');if(!card||!canvas)return;card.classList.remove('hidden');if(window.QRCode?.toCanvas){try{await QRCode.toCanvas(canvas,payload,{width:110,margin:1,errorCorrectionLevel:'M'});return}catch(e){}}const ctx=canvas.getContext('2d');ctx.clearRect(0,0,110,110);ctx.fillText('QR unavailable',8,55)}
async function ensureCustomerAuth(){const token=localStorage.getItem('angelCustomerSession');if(!token){updateCustomerHeader(null);return false}try{const d=await api('/api/customer/me');localStorage.setItem('angelCustomerProfile',JSON.stringify(d.customer));localStorage.setItem('angelCustomerMobile',d.customer.mobile);currentMobile=d.customer.mobile;updateCustomerHeader(d.customer);return true}catch(e){localStorage.removeItem('angelCustomerSession');localStorage.removeItem('angelCustomerProfile');updateCustomerHeader(null);return false}}
$('#authLoginTab').onclick=()=>setAuthMode('login');$('#authRegisterTab').onclick=()=>setAuthMode('register');$('#customerHeaderLogin').onclick=()=>openCustomerLogin();
$('#customerAuthClose').onclick=closeCustomerLogin;$('#customerAuthOverlay').addEventListener('click',e=>{if(e.target.id==='customerAuthOverlay')closeCustomerLogin()});document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('#customerAuthOverlay').classList.contains('hidden'))closeCustomerLogin();closeCustomerSidebar();}});function openCustomerSidebar(){const app=$('#customerApp');if(app){app.classList.add('sidebar-open');$('#customerMobileMenu')?.setAttribute('aria-expanded','true')}}function closeCustomerSidebar(){const app=$('#customerApp');if(app){app.classList.remove('sidebar-open');$('#customerMobileMenu')?.setAttribute('aria-expanded','false')}}$('#customerMobileMenu').onclick=openCustomerSidebar;$('#customerSidebarClose').onclick=closeCustomerSidebar;$('#customerSidebarBackdrop').onclick=closeCustomerSidebar;
$('#authLoginForm').onsubmit=async e=>{e.preventDefault();if(authBusy)return;authBusy=true;try{const d=await api('/api/customer/login',{method:'POST',body:JSON.stringify({identifier:$('#authIdentifier').value.trim(),pin:$('#authLoginPin').value})});saveCustomerAuth(d);toast('Customer login सफल हुआ');refreshAll()}catch(err){setAuthMessage(err.message)}finally{authBusy=false}};
$('#authRegisterForm').onsubmit=async e=>{e.preventDefault();if(authBusy)return;const pin=$('#authRegisterPin').value,pin2=$('#authRegisterPin2').value;if(pin!==pin2)return setAuthMessage('दोनों PIN समान होने चाहिए');if(!/^[0-9]{4,6}$/.test(pin))return setAuthMessage('PIN 4–6 digit का होना चाहिए');authBusy=true;try{const d=await api('/api/customer/register',{method:'POST',body:JSON.stringify({name:$('#authName').value.trim(),mobile:$('#authMobile').value.trim(),pin,claim_token:localStorage.getItem('angelGuestSession')||''})});saveCustomerAuth(d);toast('Customer account बन गया');refreshAll()}catch(err){setAuthMessage(err.message)}finally{authBusy=false}};
$('#customerHeaderLogout').onclick=async()=>{try{if(localStorage.getItem('angelCustomerSession'))await api('/api/customer/logout',{method:'POST'})}catch{}localStorage.removeItem('angelCustomerSession');localStorage.removeItem('angelCustomerProfile');localStorage.removeItem('angelCustomerMobile');localStorage.removeItem('angelCustomerQrPayload');currentMobile='';updateCustomerHeader(null);toast('Logout सफल हुआ')};
function go(page){const protectedPages=new Set(['customer-history','customer-receipts','customer-applications','customer-appointments','customer-home-service','customer-documents','customer-notifications','customer-tracking']);if(protectedPages.has(page)&&!hasCustomerLogin()){openCustomerLogin('यह section देखने के लिए Customer Login जरूरी है। Guest mode में आप service, payment और token workflow चला सकते हैं।');return}closeCustomerSidebar();$$('.page').forEach(x=>x.classList.remove('active-page'));$('#page-'+page)?.classList.add('active-page');$$('[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===page));$('#customerCrumb').textContent={ 'customer-home':'Customer Home','customer-services':'सभी सेवाएँ','customer-token':'Token Generate','customer-status':'Live Token Status','customer-history':'My Token History','customer-receipts':'Receipt & Records','customer-applications':'My Applications','customer-appointments':'Appointments','customer-home-service':'Home Service','customer-documents':'Documents','customer-notifications':'Notifications','customer-tracking':'Application Tracking','customer-tracking':'Application Tracking'}[page]||page;if(page.startsWith('customer-'))refreshAll();if(page==='customer-token'){const a=localStorage.getItem('angelSelectedAmount');if(a)$('#cAmount').value=a;checkPaymentStatus()}if(page==='customer-services')renderCustomerServices();if(page==='customer-documents')loadDocuments();if(page==='customer-home-service'){populateHomeServiceSelect();loadHomeServices()}}
$$('[data-page]').forEach(b=>b.onclick=()=>go(b.dataset.page));
$$('[data-home-service]').forEach(b=>b.onclick=()=>{
  const key=b.dataset.homeService;
  populateCustomerPaymentServices();
  if(key==='mobile-recharge'){
    const sel=$('#cService');
    const value='मोबाइल रिचार्ज — Prepaid mobile recharge';
    if(sel&&[...sel.options].some(o=>o.value===value)){sel.value=value;sel.dispatchEvent(new Event('change'));localStorage.setItem('angelSelectedService',value);go('customer-token');toast('📱 Mobile Recharge चुना गया');}
    else {go('customer-services');toast('📱 Mobile Recharge service खोली गई');}
  }else if(key==='uppcl-bill'){
    const sel=$('#cService');
    const value='बिजली बिल भुगतान — Electricity bill payment assistance';
    if(sel&&[...sel.options].some(o=>o.value===value)){sel.value=value;sel.dispatchEvent(new Event('change'));localStorage.setItem('angelSelectedService',value);go('customer-token');toast('⚡ UPPCL Bill Payment चुना गया');}
    else {go('customer-services');toast('⚡ UPPCL Bill Payment service खोली गई');}
  }
});
function populateCustomerPaymentServices(){const sel=$('#cService');if(!sel)return;const current=localStorage.getItem('angelSelectedService')||sel.value||'';const opts=[];Object.entries(SERVICE_INFO||{}).forEach(([cat,info])=>(info.services||[]).forEach(sub=>{const value=cat+' — '+sub.name;opts.push(`<option value="${escapeHtml(value)}">${escapeHtml(cat)} → ${escapeHtml(sub.name)}</option>`)}));sel.innerHTML='<option value="">Service / Sub-category चुनें</option>'+opts.join('');if(current&&[...sel.options].some(o=>o.value===current))sel.value=current;}
let customServiceRows=[];let serviceChargeRows=[];let selectedCategory='';let selectedSub=null;
populateCustomerPaymentServices();renderCustomerServices();loadPublishedServices().then(()=>renderCustomerServices()).catch(()=>renderCustomerServices());
function money(v){return Number(v||0).toFixed(2)}
function localGovt(v){
  if(v===null||v===undefined)return 0;
  const s=String(v).trim().replace(/,/g,'');
  const m=s.match(/-?\d+(?:\.\d+)?/);
  return m?Number(m[0]):0;
}

async function loadPublishedServices(){try{const [svc,chg]=await Promise.all([api('/api/services'),api('/api/service-charges')]);serviceChargeRows=Array.isArray(chg.charges)?chg.charges:[];customServiceRows=[];if(Array.isArray(svc.services)){svc.services.forEach(x=>{SERVICE_INFO[x.category]={...(SERVICE_INFO[x.category]||{}),services:x.services||[]}});services=svc.services.map(x=>x.category);services=[...new Set(services)];}populateCustomerPaymentServices();populateHomeServiceSelect();populateAppointmentService();renderCustomerServices()}catch(e){serviceChargeRows=[];customServiceRows=[]}}
function categoryInfo(name){return SERVICE_INFO[name]||null}
function categoryDescription(name){const i=categoryInfo(name);return i?.note||`${name} की उपलब्ध services, eligibility, documents, charges और process देखें।`}
function categoryServices(name){const base=(categoryInfo(name)?.services||[]).map(x=>{const saved=serviceChargeRows.find(r=>r.category===name&&r.service===x.name);return {...x,csc:saved?Number(saved.csc_fee||0):Number(x.csc||0),govt:saved?('₹'+Number(saved.govt_fee||0).toFixed(2)):(x.govt||'Portal/department अनुसार'),_source:'catalog'}});const custom=customServiceRows.filter(x=>(x.category||'').trim()===name).map(x=>({name:x.Name||x.name,csc:Number(x.fee||0),govt:x.govt||'Portal/department अनुसार',docs:x.documents||x.Documents||x.documents_required||[],process:x.process||[],description:x.description||x.details||'',time:x.time||0,appointment:!!x.appointment,priority:!!x.priority,_source:'admin',_id:x.id}));return [...base,...custom]}
function renderCustomerServices(filter='all',q=''){const grid=$('#customerServiceGrid');if(!grid)return;const term=(q||'').toLowerCase();const rows=services.filter(s=>(filter==='all'||serviceMeta[s]?.[1]===filter)&&s.toLowerCase().includes(term));grid.innerHTML=rows.map(s=>{const [icon,cat]=serviceMeta[s]||['icon-32.png','digital'];const subs=categoryServices(s);const label=cat==='popular'?'लोकप्रिय':cat==='new'?'नया':cat==='gov'?'सरकारी':'डिजिटल';return `<article class="service" data-customer-service="${escapeHtml(s)}"><div class="service-icon-wrap"><img class="service-icon-img" src="assets/service-icons/${icon}" alt="${s} icon" loading="lazy" onerror="this.onerror=null;this.src='assets/service-icons/icon-32.png'"></div><h3>${escapeHtml(s)}</h3><small class="service-count">${subs.length} sub-services</small><span class="tag">${label}</span><span class="public-apply">Services और पूरी Details देखें →</span></article>`}).join('')||'<div class="panel">कोई सेवा नहीं मिली।</div>';$$('#customerServiceGrid .service').forEach(el=>el.onclick=()=>openCustomerServiceDetails(el.dataset.customerService))}
function openCustomerServiceDetails(name){selectedCategory=name;selectedSub=null;const info=categoryInfo(name)||{};const subs=categoryServices(name);$('#sdCategory').textContent='SERVICE CATEGORY';$('#sdTitle').textContent=name;$('#sdDescription').textContent=categoryDescription(name);$('#sdStats').innerHTML=[['Sub-services',subs.length],['CSC charge','Service-wise'],['Government fee','As applicable'],['Token',subs.some(x=>x.workflow?.tokenRequired)?'Applicable where configured':'Not applicable']].map(x=>`<div class="service-detail-stat"><span class="muted">${x[0]}</span><b>${x[1]}</b></div>`).join('');$('#sdSubservices').innerHTML=subs.map((x,i)=>`<article class="subservice-card"><h3>${i+1}. ${escapeHtml(x.name)}</h3><p>${escapeHtml(x.description||'इस service की eligibility, documents, charges और process देखें।')}</p><div class="fee-line"><span class="fee-chip">💰 CSC: ₹${money(x.csc)}</span><span class="fee-chip">🎫 Token: ${x.workflow?.tokenRequired?'Yes':'No'}</span><span class="fee-chip">🧾 Receipt: ${x.workflow?.receiptRequired?'Yes':'No'}</span><span class="fee-chip">🏛️ Govt: ${escapeHtml(x.govt||'As applicable')}</span>${x.time?`<span class="fee-chip">⏱️ ${money(x.time)} min</span>`:''}</div><p><b>📄 Documents:</b> ${(x.docs||[]).length?(x.docs||[]).map(escapeHtml).join(' · '):'Service-specific documents'}</p><button class="subservice-btn" data-sub="${i}">पूरी Details देखें →</button></article>`).join('')||'<div class="panel">इस category में अभी कोई sub-service configured नहीं है।</div>';const proc=info.process||subs[0]?.process||[];$('#sdProcess').innerHTML=proc.map(x=>`<li>${escapeHtml(x)}</li>`).join('')||'<li>Service-specific process centre पर confirm करें।</li>';const docs=[...new Set(subs.flatMap(x=>x.docs||[]))];$('#sdDocs').innerHTML=docs.map(x=>`<li>${escapeHtml(x)}</li>`).join('')||'<li>Service-specific documents</li>';$('#sdNote').textContent=info.note||'Government/portal charges समय, राज्य और department के अनुसार बदल सकते हैं। Final amount customer से confirm करें।';$('#sdOverview').style.display='block';$('#sdSelected').classList.remove('show');$('#serviceDetailModal').classList.remove('hidden');$('#serviceDetailModal').setAttribute('aria-hidden','false');$$('#sdSubservices .subservice-btn').forEach(b=>b.onclick=()=>showSubserviceDetails(subs[Number(b.dataset.sub)]))}
function showSubserviceDetails(sub){
 if(!sub)return;
 selectedSub=sub;
 $('#sdOverview').style.display='none';
 $('#sdSelected').classList.add('show');
 $('#sdSelectedTitle').textContent=sub.name;
 $('#sdSelectedDescription').textContent=sub.description||'इस service की पूरी जानकारी नीचे दी गई है।';
 $('#sdTokenBtn').style.display=sub.workflow?.tokenRequired?'':'none';
 $('#sdSelectedStats').innerHTML=[['CSC Charge','₹'+money(sub.csc)],['Government/Portal',sub.govt||'As applicable'],['Processing',sub.time?sub.time+' min':'As applicable'],['Appointment',sub.workflow?.appointmentRequired?'Required':'Not required'],['Token',sub.workflow?.tokenRequired?'Required':'Not required'],['Receipt',sub.workflow?.receiptRequired?'Automatic':'Not applicable'],['Tracking',sub.workflow?.applicationTracking?'Enabled':'Not applicable']].map(x=>`<div class="service-detail-stat"><span class="muted">${escapeHtml(x[0])}</span><b>${escapeHtml(x[1])}</b></div>`).join('');
 $('#sdSelectedDocs').innerHTML=(sub.docs||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')||'<li>Service-specific documents</li>';
 $('#sdSelectedProcess').innerHTML=(sub.process||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')||'<li>Centre/official portal process as applicable.</li>';
 $('#sdSelectedNote').textContent=categoryInfo(selectedCategory)?.note||'Government/portal charges may vary. Confirm the final payable amount before payment.';
}

async function applySelectedServiceCharge(category,serviceName,defaultCsc,defaultGovt){
 try{
  const d=await api('/api/service-charges?category='+encodeURIComponent(category)+'&service='+encodeURIComponent(serviceName));
  const saved=d.charge||null;
  const info=categoryInfo(category),sub=(info?.services||[]).find(x=>x.name===serviceName);
  const govt=saved?Number(saved.govt_fee||0):Number(defaultGovt??localGovt(sub?.govt));
  const csc=saved?Number(saved.csc_fee??defaultCsc??0):Number(defaultCsc??sub?.csc??0);
  const other=saved?Number(saved.other_fee||0):0;
  const total=Number((govt+csc+other).toFixed(2));
  $('#cAmount').value=total;
  localStorage.setItem('angelSelectedAmount',String(total));
  const box=document.getElementById('customerChargeBreakdown');
  if(box)box.innerHTML=`Govt / Portal: ₹${govt.toFixed(2)} &nbsp; + &nbsp; CSC: ₹${csc.toFixed(2)} &nbsp; + &nbsp; Other: ₹${other.toFixed(2)} &nbsp; = &nbsp; <b>₹${total.toFixed(2)}</b>`;
  updateUpiPaymentLink();
  return total;
 }catch(e){
  const total=Number((Number(defaultGovt??0)+Number(defaultCsc??0)).toFixed(2));
  $('#cAmount').value=total;
  localStorage.setItem('angelSelectedAmount',String(total));
  updateUpiPaymentLink();
  throw e;
 }
}

$('#cService').onchange=async()=>{
 const v=$('#cService').value||'';
 if(!v)return;
 const parts=v.split(' — '),cat=parts.shift(),sub=parts.join(' — '),svc=(categoryInfo(cat)?.services||[]).find(x=>x.name===sub); const wf=svc?.workflow||{}; const payForm=$('#customerPaymentForm'),gen=$('#generateToken'); if(payForm)payForm.style.display=wf.paymentRequired?'':'none'; if(gen){gen.style.display=wf.tokenRequired?'':'none';gen.disabled=!wf.tokenRequired || wf.paymentRequired;} const msg=document.querySelector('#page-customer-token .page-title p'); if(msg)msg.textContent=wf.paymentRequired?(wf.tokenRequired?'पूरी service details के बाद payment करें। Admin verification के बाद Live Token मिलेगा।':'यह service payment workflow से अलग है; उपलब्ध service workflow के अनुसार आगे बढ़ें।'):(wf.tokenRequired?'इस service में payment नहीं है; Token queue उपलब्ध है।':'इस service के लिए payment/token workflow लागू नहीं है।');
 try{await applySelectedServiceCharge(cat,sub,Number(svc?.csc||0),localGovt(svc?.govt));}
 catch(e){toast(e.message||'Service charge load नहीं हुआ');}
 localStorage.setItem('angelSelectedService',v);
 localStorage.removeItem('angelPaymentId');
 $('#paymentStatus').textContent=wf.paymentRequired?'Payment verification pending है।':(wf.tokenRequired?'इस service में payment required नहीं है। Application के बाद Token generate करें।':'इस service के लिए payment/token workflow लागू नहीं है।');
 $('#generateToken').disabled=!wf.tokenRequired || wf.paymentRequired;
};

$('#sdTokenBtn').onclick=async()=>{
 const sub=selectedSub;
 if(!selectedCategory||!sub)return toast('पहले service/sub-service चुनें'); if(!sub.workflow?.tokenRequired)return toast('इस service के लिए Token लागू नहीं है।');
 const value=selectedCategory+' — '+sub.name;
 populateCustomerPaymentServices();
 $('#cService').value=value;
 try{await applySelectedServiceCharge(selectedCategory,sub.name,Number(sub.csc||0),localGovt(sub.govt));}
 catch(e){toast(e.message||'Service charge load नहीं हुआ');return;}
 localStorage.setItem('angelSelectedService',value);
 $('#serviceDetailModal').classList.add('hidden');
 $('#serviceDetailModal').setAttribute('aria-hidden','true');
 go('customer-token');
 toast(sub.name+' चुनी गई');
};
$('#sdClose').onclick=()=>{$('#serviceDetailModal').classList.add('hidden');$('#serviceDetailModal').setAttribute('aria-hidden','true')};
// Escape closes service details modal and clicking the backdrop closes it.
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#serviceDetailModal').classList.contains('hidden')){$('#serviceDetailModal').classList.add('hidden');$('#serviceDetailModal').setAttribute('aria-hidden','true')}});
$('#serviceDetailModal').addEventListener('click',e=>{if(e.target.id==='serviceDetailModal'){$('#serviceDetailModal').classList.add('hidden');$('#serviceDetailModal').setAttribute('aria-hidden','true')}});
$('#sdBack').onclick=()=>{$('#sdSelected').classList.remove('show');$('#sdOverview').style.display='block'};$('#serviceDetailModal').onclick=e=>{if(e.target.id==='serviceDetailModal')$('#sdClose').click()};
$('#customerServiceSearch').oninput=e=>renderCustomerServices('all',e.target.value);$$('[data-cfilter]').forEach(b=>b.onclick=()=>{$$('[data-cfilter]').forEach(x=>x.classList.remove('sel'));b.classList.add('sel');renderCustomerServices(b.dataset.cfilter,$('#customerServiceSearch').value)});
function saveCustomer(){const n=$('#cName').value.trim(),m=$('#cMobile').value.trim();if(!n)return toast('नाम भरें');if(!/^\d{10}$/.test(m))return toast('सही 10 digit mobile भरें');currentMobile=m;localStorage.setItem('angelCustomerMobile',m);localStorage.setItem('angelCustomerName',n);return {name:n,mobile:m,service:$('#cService').value}}
let paymentConfig={upi_id:'',payee_name:'',payment_qr_path:'assets/payment-qr.jpg'};
async function loadPaymentConfig(){
  try{
    const c=await api('/api/public-config');
    paymentConfig={...paymentConfig,...c};
    const upi=$('#cUpiId'); if(upi) upi.textContent=paymentConfig.upi_id||'UPI configuration unavailable';
    const qr=$('#paymentQrImage'); if(qr&&paymentConfig.payment_qr_path) qr.src=paymentConfig.payment_qr_path;
    updateUpiPaymentLink();
  }catch(e){
    const upi=$('#cUpiId'); if(upi) upi.textContent='UPI configuration unavailable';
  }
}
function updateUpiPaymentLink(){
  const amount=Number($('#cAmount').value||0);
  const service=($('#cService').value||'AngelStore CSC Service').slice(0,60);
  const upi=String(paymentConfig.upi_id||'').trim(), payee=String(paymentConfig.payee_name||'').trim();
  const params=new URLSearchParams({pa:upi,pn:payee,cu:'INR'});
  if(Number.isFinite(amount)&&amount>0) params.set('am',amount.toFixed(2));
  params.set('tn',service);
  const b=$('#upiPayButton'); if(b){b.href=upi?'upi://pay?'+params.toString():'#';b.setAttribute('aria-disabled',upi?'false':'true');}
  const d=$('#paymentAmountDisplay'); if(d) d.textContent=(Number.isFinite(amount)?amount:0).toFixed(2);
}
$('#copyUpiButton').onclick=async()=>{const upi=String(paymentConfig.upi_id||'').trim();if(!upi)return toast('UPI configuration उपलब्ध नहीं है');try{await navigator.clipboard.writeText(upi);toast('UPI ID copy हो गया')}catch(e){toast('UPI ID: '+upi)}};
$('#cService').addEventListener('change',updateUpiPaymentLink);
$('#cAmount').addEventListener('input',updateUpiPaymentLink);
updateUpiPaymentLink();
loadPaymentConfig();
async function submitPayment(){
  const c=saveCustomer();
  if(!c)return;
  const utr=$('#cUtr').value.trim();
  const file=$('#cPaymentScreenshot').files?.[0];
  const amount=Number($('#cAmount').value||localStorage.getItem('angelSelectedAmount')||0);
  if(!c.service||!amount)return toast('Service और payable amount जरूरी है');
  if(!utr||!file)return toast('UTR number और Payment screenshot दोनों दें');
  if(file){
    if(!['image/png','image/jpeg','image/webp'].includes(file.type))return toast('केवल PNG/JPG/WEBP screenshot दें');
    if(file.size>5*1024*1024)return toast('Screenshot 5MB से छोटा रखें');
  }
  try{
    let aid=Number(localStorage.getItem('angelApplicationId')||0),session=localStorage.getItem('angelCustomerSession')||localStorage.getItem('angelGuestSession')||'';
    let a=null,meta=null;
    try{meta=JSON.parse(localStorage.getItem('angelApplicationMeta')||'null')}catch{}
    const sameMeta=meta&&meta.name===c.name&&meta.mobile===c.mobile&&meta.service===c.service;
    if(aid&&session&&sameMeta){a={id:aid,customer_token:session};}
    else{
      a=await api('/api/customer/application',{method:'POST',body:JSON.stringify({name:c.name,mobile:c.mobile,service:c.service,category:c.service.split(' — ')[0]||'',note:'Payment + token request'})});
      localStorage.setItem('angelApplicationId',String(a.id));
      localStorage.setItem('angelApplicationMeta',JSON.stringify({id:a.id,name:c.name,mobile:c.mobile,service:c.service}));
      if(a.customer_token){localStorage.setItem('angelGuestSession',a.customer_token);updateCustomerHeader(null);}
    }
    let screenshot=null;
    if(file){screenshot=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Payment screenshot read नहीं हो सका'));reader.readAsDataURL(file)})}
    const d=await api('/api/customer/payment',{method:'POST',body:JSON.stringify({name:c.name,mobile:c.mobile,service:c.service,amount,utr,screenshot,application_id:a.id})});
    localStorage.setItem('angelPaymentId',String(d.id));
    $('#paymentStatus').textContent='⏳ Admin payment proof verification pending है.';
    $('#paymentStatus').className='payment-status';
    $('#generateToken').disabled=true;
    toast('Payment verification के लिए UTR + screenshot दोनों भेजे गए');
  }catch(e){toast(e.message)}
}
async function checkPaymentStatus(){const id=Number(localStorage.getItem('angelPaymentId')||0);if(!id){$('#generateToken').disabled=true;return null}try{const m=$('#cMobile').value.trim()||localStorage.getItem('angelCustomerMobile')||'';const d=await api('/api/customer/payment/status?id='+encodeURIComponent(id)+'&mobile='+encodeURIComponent(m));const p=d.payment;if(p.status==='Verified'){$('#paymentStatus').textContent='✅ Payment verified by Admin. अब Live Token generate कर सकते हैं।';$('#paymentStatus').className='payment-status verified';$('#generateToken').disabled=!!p.token_id;return p}if(p.status==='Rejected'){$('#paymentStatus').textContent='❌ Payment rejected: '+(p.reject_reason||'Proof rejected');$('#paymentStatus').className='payment-status rejected';$('#generateToken').disabled=true;return p}$('#paymentStatus').textContent='⏳ UTR + payment screenshot Admin verification के लिए pending है।';$('#paymentStatus').className='payment-status';$('#generateToken').disabled=true;return p}catch(e){$('#generateToken').disabled=true;return null}}
async function generate(){const c=saveCustomer();if(!c)return;const selected=categoryServices(c.service.split(' — ')[0]||'').find(x=>x.name===c.service.split(' — ').slice(1).join(' — ')),wf=selected?.workflow||{};let applicationId=Number(localStorage.getItem('angelApplicationId')||0);if(wf.paymentRequired){const payment_id=Number(localStorage.getItem('angelPaymentId')||0);if(!payment_id)return toast('पहले UTR और payment screenshot submit करें');const d=await api('/api/customer/tokens',{method:'POST',body:JSON.stringify({payment_id,name:c.name,mobile:c.mobile,service:c.service})});$('#generatedToken').textContent=d.token;$('#generatedService').textContent='सेवा: '+d.service;$('#generatedStatus').textContent='Payment Verified · Token Generated';localStorage.setItem('angelCurrentTokenId',String(d.id));toast('Live Token '+d.token+' generate हो गया');await refreshAll();return;}if(!wf.tokenRequired)return toast('इस service के लिए Token लागू नहीं है।');if(!applicationId){const a=await api('/api/customer/application',{method:'POST',body:JSON.stringify({name:c.name,mobile:c.mobile,service:c.service,category:c.service.split(' — ')[0]||'',note:'Token request'})});applicationId=Number(a.id);localStorage.setItem('angelApplicationId',String(applicationId));localStorage.setItem('angelApplicationMeta',JSON.stringify({id:applicationId,name:c.name,mobile:c.mobile,service:c.service}));if(a.customer_token)localStorage.setItem('angelGuestSession',a.customer_token);}const d=await api('/api/customer/tokens',{method:'POST',body:JSON.stringify({application_id:applicationId,name:c.name,mobile:c.mobile,service:c.service})});$('#generatedToken').textContent=d.token;$('#generatedService').textContent='सेवा: '+d.service;$('#generatedStatus').textContent='Application Submitted · Token Generated';localStorage.setItem('angelCurrentTokenId',String(d.id));toast('Live Token '+d.token+' generate हो गया');await refreshAll();}
function renderCustomerRecords(d){
  const tokens=d?.tokens||[], payments=d?.payments||[], receipts=d?.receipts||[], apps=d?.applications||[], appts=d?.appointments||[]; lastRecords={...lastRecords,...d,applications:apps,appointments:appts};
  const ht=$('#historyTable'); if(ht) ht.innerHTML=tokens.length?tokens.slice().sort((a,b)=>Number(b.id||0)-Number(a.id||0)).map(x=>`<tr><td><b>${escapeHtml(x.token||'—')}</b></td><td>${escapeHtml(x.service||'—')}</td><td>${x.created_at?new Date(x.created_at).toLocaleString('hi-IN'):'—'}</td><td>${escapeHtml(x.status||'—')}</td></tr>`).join(''):'<tr><td colspan="4">अभी कोई token नहीं है।</td></tr>';
  const rt=$('#recordsTable'); if(rt) rt.innerHTML=tokens.length?tokens.slice().sort((a,b)=>Number(b.id||0)-Number(a.id||0)).map(x=>{const pay=payments.find(p=>Number(p.id)===Number(x.payment_id));return `<tr><td><b>${escapeHtml(x.token||'—')}</b></td><td>${escapeHtml(x.service||'—')}</td><td>${x.created_at?new Date(x.created_at).toLocaleString('hi-IN'):'—'}</td><td>${escapeHtml(x.status||'—')}</td><td>${escapeHtml(pay?.receipt_no||'—')}</td></tr>`}).join(''):'<tr><td colspan="5">अभी कोई record नहीं है।</td></tr>';
  const rl=$('#receiptList'); if(rl) rl.innerHTML=receipts.length?receipts.slice().sort((a,b)=>Number(b.id||0)-Number(a.id||0)).map(p=>`<div class="customer-list-item"><b>🧾 ${escapeHtml(p.receipt_no||'Receipt')}</b><span>₹ ${Number(p.amount||0).toFixed(2)} · ${escapeHtml(p.service||'Service')} · Completed <button type="button" class="receipt-pdf" data-id="${p.id}">Download PDF</button></span></div>`).join(''):'<div class="muted">अभी कोई completed service receipt नहीं है।</div>';
  const at=$('#applicationsTable'); if(at) at.innerHTML=apps.length?apps.slice().sort((a,b)=>Number(b.id||0)-Number(a.id||0)).map(a=>`<tr><td><b>${escapeHtml(a.application_id||'—')}</b></td><td>${escapeHtml(a.service||'—')}</td><td>${a.created_at?new Date(a.created_at).toLocaleString('hi-IN'):'—'}</td><td>${escapeHtml(a.status||'—')}</td><td><button type="button" class="application-view" data-id="${a.id}">View</button></td></tr>`).join(''):'<tr><td colspan="4">अभी कोई application नहीं है।</td></tr>';
  const apt=$('#appointmentsTable'); if(apt) apt.innerHTML=appts.length?appts.slice().sort((a,b)=>Number(b.id||0)-Number(a.id||0)).map(a=>`<tr><td><b>${escapeHtml(a.appointment_id||'—')}</b></td><td>${escapeHtml(a.service||'—')}</td><td>${escapeHtml(a.date||'—')} ${escapeHtml(a.time||'')}</td><td>${escapeHtml(a.status||'—')}</td></tr>`).join(''):'<tr><td colspan="4">अभी कोई appointment नहीं है।</td></tr>';
  document.querySelectorAll('.receipt-pdf').forEach(b=>b.onclick=()=>downloadReceiptPdf(Number(b.dataset.id)));document.querySelectorAll('.application-view').forEach(b=>b.onclick=()=>showApplication(Number(b.dataset.id),lastRecords));
}
async function downloadReceiptPdf(id){
  try{
    const cs=localStorage.getItem('angelCustomerSession');
    if(!cs)return openCustomerLogin('Receipt download के लिए Customer Login जरूरी है।');
    const r=await fetch(backendUrl.replace(/\/$/,'')+'/api/customer/receipts/'+encodeURIComponent(id)+'.pdf',{headers:{'X-Customer-Session':cs}});
    if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||'Receipt PDF download failed');}
    const blob=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='angelstore-receipt-'+id+'.pdf';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(a.href);toast('🧾 Receipt PDF download हो गई');
  }catch(e){toast(e.message)}
}
function printReceipt(id,d){const p=(d.payments||[]).find(x=>Number(x.id)===id);if(!p)return toast('Receipt record नहीं मिला');const w=window.open('','_blank','width=760,height=760');if(!w)return toast('Popup blocked');const esc=escapeHtml;w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.receipt_no||'Receipt')}</title><style>body{font-family:Arial;padding:30px}.box{max-width:620px;margin:auto;border:1px solid #ddd;border-radius:16px;padding:24px}button{padding:10px 14px;background:#0b73e0;color:#fff;border:0;border-radius:8px}</style></head><body><div class="box"><h1>AngelStore CSC</h1><h2>Service Completion Receipt</h2><p><b>Receipt:</b> ${esc(p.receipt_no||'—')}</p><p><b>Service:</b> ${esc(p.service||'—')}</p><p><b>Amount:</b> ₹${Number(p.amount||0).toFixed(2)}</p><p><b>UTR:</b> ${esc(p.utr||'—')}</p><p><b>Payment Status:</b> ${esc(p.status||'Verified')}</p><p><b>Service Status:</b> Completed</p><p><b>Date:</b> ${esc(p.verified_at||p.created_at||'—')}</p><button onclick="window.print()">Print / Save PDF</button></div></body></html>`);w.document.close()}
async function showApplication(id,d){const a=(d.applications||[]).find(x=>Number(x.id)===id);if(!a)return toast('Application नहीं मिला');let detail=null;try{detail=(await api('/api/customer/application?id='+encodeURIComponent(id))).application}catch{}const docs=(await api('/api/customer/documents?application_id='+encodeURIComponent(id)).catch(()=>({documents:[]}))).documents||[];const w=window.open('','_blank','width=720,height=640');if(!w)return toast('Popup blocked');const docsHtml=docs.length?docs.map(x=>`<li>${escapeHtml(x.name)} — ${escapeHtml(x.ocr_status||'not_run')}</li>`).join(''):'<li>No documents</li>';w.document.write(`<html><head><meta charset="utf-8"><title>Application ${escapeHtml(a.application_id)}</title></head><body style="font-family:Arial;padding:30px"><h2>Application ${escapeHtml(a.application_id)}</h2><p><b>Service:</b> ${escapeHtml(detail?.service||a.service)}</p><p><b>Status:</b> ${escapeHtml(detail?.status||a.status)}</p><p><b>Created:</b> ${escapeHtml(detail?.created_at||a.created_at||'—')}</p><p><b>Address:</b> ${escapeHtml(detail?.address||a.address||'—')}</p><h3>Documents</h3><ul>${docsHtml}</ul><button onclick="window.print()">Print</button></body></html>`);w.document.close()}
async function loadHistory(){if(!hasCustomerLogin())return openCustomerLogin('Token History देखने के लिए Customer Login जरूरी है।');try{const d=await api('/api/customer/records');renderCustomerRecords(d);refreshAll();toast('Token History refresh हो गया')}catch(e){toast(e.message)}}
async function loadRecords(){if(!hasCustomerLogin())return openCustomerLogin('Receipt & Records देखने के लिए Customer Login जरूरी है।');try{const d=await api('/api/customer/records');renderCustomerRecords(d);toast('Records refresh हो गए')}catch(e){toast(e.message)}}
async function loadApplications(){if(!hasCustomerLogin())return openCustomerLogin('Applications देखने के लिए Customer Login जरूरी है।');try{const d=await api('/api/customer/applications');lastRecords.applications=d.applications||[];renderCustomerRecords({...lastRecords,applications:lastRecords.applications});toast('Applications refresh हो गए')}catch(e){toast(e.message)}}
function populateHomeServiceSelect(){const sel=$('#homeServiceSelect');if(!sel)return;const opts=[];Object.entries(SERVICE_INFO||{}).forEach(([cat,info])=>(info.services||[]).forEach(sub=>{const value=cat+' — '+sub.name;opts.push(`<option value="${escapeHtml(value)}">${escapeHtml(cat)} → ${escapeHtml(sub.name)}</option>`)}));sel.innerHTML='<option value="">Service चुनें</option>'+opts.join('');}
async function loadHomeServices(){if(!hasCustomerLogin())return openCustomerLogin('Home Service request के लिए Customer Login जरूरी है।');try{const d=await api('/api/customer/home-services');const rows=d.home_services||[];$('#homeServiceList').innerHTML=rows.length?rows.map(x=>`<div class="panel" style="margin-bottom:10px"><b>${escapeHtml(x.service||'Service')}</b><div class="muted">${escapeHtml(x.address||'—')}</div><small>${escapeHtml(x.preferred_date||'Date not set')} · ${escapeHtml(x.preferred_time||'Time not set')} · ${escapeHtml(x.status||'Requested')}</small></div>`).join(''):'<div class="muted">अभी कोई request नहीं है।</div>';}catch(e){toast(e.message)}}
async function submitHomeService(){if(!hasCustomerLogin())return openCustomerLogin('Home Service request के लिए Customer Login जरूरी है।');const service=$('#homeServiceSelect').value.trim(),address=$('#homeServiceAddress').value.trim(),date=$('#homeServiceDate').value,time=$('#homeServiceTime').value;if(!service||!address)return toast('Service और पूरा address जरूरी है');try{const d=await api('/api/customer/home-services',{method:'POST',body:JSON.stringify({service,address,preferred_date:date,preferred_time:time})});$('#homeServiceStatus').textContent='✅ Request '+(d.home_service_id||'submitted')+' successfully';$('#homeServiceAddress').value='';$('#homeServiceDate').value='';$('#homeServiceTime').value='';await loadHomeServices();toast('Home Service request भेज दी गई');}catch(e){toast(e.message)}}
populateHomeServiceSelect();
async function loadAppointments(){if(!hasCustomerLogin())return openCustomerLogin('Appointments देखने के लिए Customer Login जरूरी है।');try{const d=await api('/api/customer/appointments');lastRecords.appointments=d.appointments||[];renderCustomerRecords({...lastRecords,appointments:lastRecords.appointments});toast('Appointments refresh हो गए')}catch(e){toast(e.message)}}

function populateAppointmentService(){const sel=$('#appointmentService');if(!sel)return;const opts=[];Object.entries(SERVICE_INFO||{}).forEach(([cat,info])=>(info.services||[]).forEach(sub=>{const value=cat+' — '+sub.name;opts.push(`<option value="${escapeHtml(value)}">${escapeHtml(cat)} → ${escapeHtml(sub.name)}</option>`)}));sel.innerHTML='<option value="">Service चुनें</option>'+opts.join('');}
function setMinDates(){const today=new Date();const iso=new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);['appointmentDate','homeServiceDate'].forEach(id=>{const el=$('#'+id);if(el)el.min=iso});}
async function submitAppointment(){if(!hasCustomerLogin())return openCustomerLogin('Appointment book करने के लिए Customer Login जरूरी है।');const service=$('#appointmentService').value.trim(),date=$('#appointmentDate').value,time=$('#appointmentTime').value;if(!service||!date)return toast('Service और date जरूरी हैं');const selected=new Date(date+'T'+(time||'00:00'));if(selected<new Date(new Date().setSeconds(0,0)))return toast('Past date/time चुनना allowed नहीं है');try{const d=await api('/api/customer/appointments',{method:'POST',body:JSON.stringify({service,date,time})});$('#appointmentStatus').textContent='✅ '+(d.appointment_id||'Appointment')+' request भेज दी गई';$('#appointmentForm').reset();setMinDates();await loadAppointments();toast('Appointment request भेज दी गई')}catch(e){toast(e.message)}}
async function loadDocuments(){
  if(!hasCustomerLogin())return openCustomerLogin('Documents देखने के लिए Customer Login जरूरी है।');
  try{
    let apps=Array.isArray(lastRecords.applications)?lastRecords.applications:[];
    if(!apps.length){const ad=await api('/api/customer/applications');apps=ad.applications||[];lastRecords.applications=apps;}
    const sorted=apps.slice().sort((a,b)=>Number(b.id||0)-Number(a.id||0));
    const active=sorted.find(a=>!['Token Generated','पूर्ण','रद्द','स्किप'].includes(String(a.status||'')))||sorted[0]||null;
    const sel=$('#documentApplication');
    if(sel){
      sel.innerHTML=sorted.length?sorted.map(a=>`<option value="${a.id}">${escapeHtml(a.application_id)} — ${escapeHtml(a.service)}${a.id===active?.id?' (Current)':''}</option>`).join(''):'<option value="">कोई application नहीं</option>';
      if(active)sel.value=String(active.id);
      sel.onchange=()=>loadDocumentApplication(Number(sel.value||0));
    }
    if(active)await loadDocumentApplication(Number(active.id));
    else renderDocumentApplication(null,[],null);
  }catch(e){toast(e.message)}
}
async function loadDocumentApplication(applicationId){
  if(!applicationId)return renderDocumentApplication(null,[],null);
  try{
    const app=(lastRecords.applications||[]).find(a=>Number(a.id)===Number(applicationId));
    const [docsData,progressData]=await Promise.all([
      api('/api/customer/documents?application_id='+encodeURIComponent(applicationId)),
      api('/api/customer/progress?application_id='+encodeURIComponent(applicationId))
    ]);
    renderDocumentApplication(app,docsData.documents||[],progressData.progress||null);
  }catch(e){toast(e.message)}
}
function renderDocumentApplication(app,rows,p){
  const pct=Math.max(0,Math.min(100,Number(p?.percent||0)));
  const pctEl=$('#documentProgressPercent');if(pctEl)pctEl.textContent=pct+'%';
  const fill=$('#documentProgressFill');if(fill)fill.style.width=pct+'%';
  const aid=$('#documentProgressApplication');if(aid)aid.textContent=app?.application_id?('Application '+app.application_id):'Application —';
  const st=$('#documentProgressStatus');if(st)st.textContent=app?.status||p?.application?.status||'Status —';
  const summary=$('#documentProgressSummary');if(summary)summary.textContent=p?`Required documents: ${(p.required_documents||[]).length} · Uploaded: ${rows.length}`:'Application के required documents की live स्थिति';
  const box=$('#documentProgressSteps');
  if(box){
    const items=Array.isArray(p?.items)?p.items.filter(x=>x.id==='documents'):[];
    const required=p?.required_documents||[];
    const docItem=items[0];
    const parts=[];
    if(docItem){parts.push(`<div class="progress-step ${docItem.done?'done':'pending'}"><div style="display:flex;gap:8px;align-items:flex-start"><span class="step-icon">${docItem.done?'✅':'⏳'}</span><div><b>Document Upload</b><small>${escapeHtml(docItem.detail||'pending')}</small></div></div><span>${docItem.done?'Complete':'Pending'}</span></div>`)}
    if(required.length){required.forEach(name=>parts.push(`<div class="progress-step pending"><div style="display:flex;gap:8px;align-items:flex-start"><span class="step-icon">📄</span><div><b>${escapeHtml(name)}</b><small>Required document</small></div></div><span>Required</span></div>`))}
    box.innerHTML=parts.join('')||'<div class="progress-empty">इस application के लिए कोई required document configured नहीं है।</div>';
  }
  $('#customerDocumentList').innerHTML=rows.length?rows.map(x=>`<div class="customer-list-item"><div><b>📄 ${escapeHtml(x.name||x.document_id)}</b><span>${escapeHtml(x.status||'uploaded')} · ${Math.ceil(Number(x.size||0)/1024)} KB</span></div><div class="actions"><button class="primary" type="button" data-customer-doc-download="${x.id}" data-customer-doc-name="${escapeHtml(x.name||'document')}">⬇ Download</button><button class="btn danger" type="button" data-customer-doc-delete="${x.id}" ${x.status==='verified'?'disabled title="Verified document delete नहीं किया जा सकता"':''}>🗑 Delete</button></div></div>`).join(''):'<div class="muted">इस application के लिए अभी कोई document upload नहीं है।</div>';
  document.querySelectorAll('[data-customer-doc-download]').forEach(b=>b.onclick=()=>downloadCustomerDocument(b.dataset.customerDocDownload,b.dataset.customerDocName));
  document.querySelectorAll('[data-customer-doc-delete]').forEach(b=>b.onclick=()=>deleteCustomerDocument(b.dataset.customerDocDelete));
}

async function downloadCustomerDocument(id,name){if(!hasCustomerLogin())return openCustomerLogin('Document download करने के लिए Customer Login जरूरी है।');try{const session=localStorage.getItem('angelCustomerSession')||'';const r=await fetch((backendUrl||'').replace(/\/$/,'')+'/api/documents/'+encodeURIComponent(id)+'/download',{headers:{'X-Customer-Session':session}});if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||'Document download failed')}const blob=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name||'document';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);toast('Document download शुरू हो गया')}catch(e){toast(e.message)}}

async function deleteCustomerDocument(id){if(!hasCustomerLogin())return openCustomerLogin('Document delete करने के लिए Customer Login जरूरी है।');if(!confirm('क्या आप यह document delete करना चाहते हैं? यह action वापस नहीं होगा।'))return;try{await api('/api/documents/'+encodeURIComponent(id),{method:'DELETE'});toast('Document delete हो गया');await loadDocuments()}catch(e){toast(e.message)}}

async function uploadCustomerDocuments(){if(!hasCustomerLogin())return openCustomerLogin('Documents upload करने के लिए Customer Login जरूरी है।');const applicationId=Number($('#documentApplication').value||0),files=[...($('#customerDocuments').files||[])];if(!applicationId)return toast('Application चुनें');if(!files.length)return toast('कम-से-कम एक document चुनें');if(files.length>5)return toast('एक बार में अधिकतम 5 documents');const allowed=['application/pdf','image/jpeg','image/png','image/webp'];let total=0;const encoded=[];for(const f of files){if(!allowed.includes(f.type))return toast('केवल PDF/JPG/PNG/WEBP allowed है');if(f.size>5*1024*1024)return toast('हर document 5MB से छोटा रखें');total+=f.size;if(total>10*1024*1024)return toast('कुल documents 10MB से छोटे रखें');encoded.push(await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({name:f.name,mime_type:f.type,data:r.result});r.onerror=()=>reject(new Error('File read failed'));r.readAsDataURL(f)}))}try{const d=await api('/api/customer/documents',{method:'POST',body:JSON.stringify({application_id:applicationId,files:encoded})});$('#documentStatus').textContent='✅ '+(d.documents?.length||0)+' document upload हुए';$('#customerDocuments').value='';await loadDocuments();toast('Documents upload हो गए')}catch(e){toast(e.message)}}
populateAppointmentService();setMinDates();$('#appointmentForm').onsubmit=e=>{e.preventDefault();submitAppointment()};$('#uploadCustomerDocuments').onclick=()=>uploadCustomerDocuments();$('#generateToken').onclick=()=>generate().catch(e=>toast(e.message));$('#customerPaymentForm').onsubmit=e=>{e.preventDefault();submitPayment()};$('#cPaymentScreenshot').onchange=e=>{const f=e.target.files?.[0],box=$('#paymentPreview');if(!box)return;if(!f){box.textContent='';return}if(!['image/png','image/jpeg','image/webp'].includes(f.type))return toast('केवल PNG/JPG/WEBP screenshot दें');if(f.size>5*1024*1024)return toast('Screenshot 5MB से छोटा रखें');const r=new FileReader();r.onload=()=>{box.innerHTML='';const wrap=document.createElement('div');wrap.className='payment-preview';const img=document.createElement('img');img.src=r.result;img.alt='Payment screenshot preview';wrap.appendChild(img);const sm=document.createElement('small');sm.textContent=f.name;box.appendChild(wrap);box.appendChild(sm)};r.readAsDataURL(f)};checkPaymentStatus();$('#clearCustomer').onclick=()=>{const keepService=$('#cService').value;$('#cName').value=hasCustomerLogin()?($('#dashCustomerName').textContent==='Guest'?'':$('#dashCustomerName').textContent):'';$('#cMobile').value=hasCustomerLogin()?($('#dashCustomerMobile').textContent==='—'?'':$('#dashCustomerMobile').textContent):'';$('#cService').value=keepService||'';$('#cAmount').value=keepService?$('#cAmount').value:'0';$('#paymentPreview').textContent='';$('#cUtr').value='';$('#cPaymentScreenshot').value='';$('#paymentStatus').textContent='Payment verification pending है।';$('#paymentStatus').className='payment-status';$('#generateToken').disabled=true;updateUpiPaymentLink();toast('Form साफ हो गया; login/session सुरक्षित है')};$('#refreshMyToken').onclick=()=>refreshAll();$('#goLive').onclick=()=>go('customer-status');$('#refreshStatus').onclick=refreshAll;$('#refreshHistory').onclick=loadHistory;$('#refreshRecords').onclick=loadRecords;$('#refreshApplications').onclick=loadApplications;$('#refreshAppointments').onclick=loadAppointments;$('#refreshHomeServices').onclick=loadHomeServices;$('#submitHomeService').onclick=submitHomeService;$('#customerAccountRefresh').onclick=()=>hasCustomerLogin()?refreshAll():openCustomerLogin('Account details देखने के लिए Customer Login जरूरी है।');$('#liveOfferAction').onclick=()=>{const items=getLiveOffers();const o=items[liveOfferIndex];if(o?.type==='OFFER'&&o.service){populateCustomerPaymentServices();const sel=$('#cService');if(sel&&[...sel.options].some(x=>x.value===o.service)){sel.value=o.service;$('#cService').dispatchEvent(new Event('change'));go('customer-token');toast('Offer service selected — amount verify करके payment करें')}else{go('customer-services');toast('Offer में configured service नहीं मिली; service details खोलें')}}else{go('customer-services');toast('Services section खोला गया')}};
function statusClass(status){const s=String(status||'').trim();if(s==='पूर्ण')return 'done';if(s==='बुलाया'||s==='प्रगति')return 'active';if(s==='रद्द'||s==='स्किप')return 'hold';return 'pending'}
function queueHtml(rows,mine){if(!rows.length)return '<div class="muted">आज कोई token नहीं है</div>';return rows.map(r=>`<div class="queue-row"><div class="live-number">${escapeHtml(r.token||'—')}</div><div><b>Token ${escapeHtml(r.token||'—')}</b><br><span class="muted">${escapeHtml(r.service||'')}</span></div><div><span class="status-pill ${statusClass(r.status)}">${escapeHtml(r.status||'—')}</span></div></div>`).join('')}
function loadCustomerUpdates(rows=[]){const box=$('#customerUpdates');const items=getLiveOffers().filter(x=>x&&x.type!=='OFFER').slice(0,5);if(!box)return;box.innerHTML=items.length?items.map(x=>`<div class="customer-update-item"><div class="update-icon">📢</div><div><b>${escapeHtml(x.title||'Latest Update')}</b><span>${escapeHtml(x.subtitle||x.description||'')}</span><small>${escapeHtml(x.date||'Latest')}</small></div></div>`).join(''):'<div class="update-empty">अभी कोई नया update नहीं है।</div>';const count=$('#customerUpdateCount');if(count)count.textContent=String(items.length)}
function renderCustomerProgress(p, prefix){
  if(!p)return;
  const pct=Math.max(0,Math.min(100,Number(p.percent||0)));
  const root=document.getElementById(prefix+'ProgressPercent'); if(!root)return;
  root.textContent=pct+'%';
  const fill=document.getElementById(prefix+'ProgressFill'); if(fill)fill.style.width=pct+'%';
  const app=document.getElementById(prefix+'ProgressApplication'); if(app)app.textContent=p.application?.application_id?('Application '+p.application.application_id):'Application —';
  const st=document.getElementById(prefix+'ProgressStatus'); if(st)st.textContent=p.application?.status||p.token?.status||'Status —';
  const updated=document.getElementById(prefix+'ProgressUpdated'); if(updated)updated.textContent='Live';
  const box=document.getElementById(prefix+'ProgressSteps'); if(!box)return;
  const labels={payment:'Payment Verified',photo:'Photo',signature:'Signature',documents:'Documents',data:'Data Cross-check',submission:'Submission',quality:'Quality Review',final:'Final Completion'};
  const items=Array.isArray(p.items)?p.items:[];
  box.innerHTML=items.map(x=>{const done=!!x.done;let detail=String(x.detail||'pending');if(x.id==='documents'&&detail==='0/0 uploaded')detail='Not required';return `<div class="progress-step ${done?'done':'pending'}"><div style="display:flex;gap:8px;align-items:flex-start"><span class="step-icon">${done?'✅':'⏳'}</span><div><b>${escapeHtml(labels[x.id]||x.label||x.id)}</b><small>${escapeHtml(detail)}</small></div></div><span>${done?'Done':'Pending'}</span></div>`}).join('')||'<div class="progress-empty">No active application yet.</div>';
}
async function refreshCustomerProgress(){
  const session=localStorage.getItem('angelCustomerSession')||localStorage.getItem('angelGuestSession')||'';
  if(!session){['home','status'].forEach(k=>{const b=document.getElementById(k+'ProgressSteps');if(b)b.innerHTML='<div class="progress-empty">Login or start a service application to see progress.</div>'});return null}
  try{const d=await api('/api/customer/progress');const p=d.progress;['home','status'].forEach(k=>renderCustomerProgress(p,k));return p}catch(e){return null}
}
function renderMine(x){
  const mine=x.mine||null, status=String(mine?.status||'');
  const friendly={
    'लंबित':'Waiting',
    'बुलाया':'Called',
    'प्रगति':'In Progress',
    'होल्ड':'On Hold',
    'पूर्ण':'Completed',
    'स्किप':'Skipped',
    'रद्द':'Cancelled'
  };
  let ahead=Number(x.ahead||0), wait='—', message='अपना mobile number देकर token देखें';
  if(mine){
    if(status==='बुलाया'){ahead=0;wait='अब आपकी बारी';message='🎉 आपकी बारी है। Counter पर जाएँ।'}
    else if(status==='प्रगति'){ahead=0;wait='काम चल रहा है';message='▶ आपका काम अभी चल रहा है। कृपया Counter पर बने रहें।'}
    else if(status==='होल्ड'){ahead=0;wait='काम रुका है';message='⏸ आपका काम फिलहाल pending/hold पर है। नीचे progress और timer देखें।'}
    else if(status==='पूर्ण'){ahead=0;wait='पूर्ण';message='✅ आपका काम पूरा हो गया है।'}
    else if(status==='स्किप'||status==='रद्द'){ahead=0;wait=friendly[status]||status;message=(status==='स्किप'?'⏭ Token skip किया गया है।':'❌ Token cancel किया गया है।')}
    else {wait=(ahead>0?`${ahead} आगे · ${Number(x.avgMinutes||5)*ahead} मिनट`: 'जल्द बुलाया जाएगा');message=`Token ${mine.token} · Waiting queue में है।`}
  }
  $('#chTotal').textContent=x.globalTotal==null?'—':String(x.globalTotal);
  $('#chCurrent').textContent=x.active?.token||'—';
  $('#chAhead').textContent=String(ahead);
  $('#chWait').textContent=wait;
  $('#homeMyToken').textContent=mine?.token||'—';
  $('#homeMyService').textContent=mine?'सेवा: '+mine.service:'Mobile number डालकर अपना token देखें';
  $('#homeMyStatus').textContent=mine?(friendly[status]||status):'—';
  $('#statusCurrent').textContent=x.active?.token||'—';
  $('#statusCurrentService').textContent=x.active?'सेवा: '+x.active.service:'कोई active token नहीं';
  $('#statusMine').textContent=mine?.token||'—';
  $('#statusAhead').textContent=String(ahead);
  $('#statusWait').textContent=wait;
  $('#statusState').textContent=mine?(friendly[status]||status):'—';
  $('#statusMessage').textContent=message;
  if(mine){$('#generatedToken').textContent=mine.token;$('#generatedService').textContent='सेवा: '+mine.service;$('#generatedStatus').textContent=friendly[status]||status}
}
const DEFAULT_LIVE_OFFERS=[
{type:'UPDATE',icon:'🎓',title:'Scholarship Form Updates',description:'नई scholarship applications और important last-date updates देखें।',date:'आज का अपडेट',valid:'Last date admin द्वारा publish होने तक',badge:'UPDATE',ticker:'🎓 Scholarship के नए forms और deadlines की जानकारी उपलब्ध है।'},
{type:'FORM',icon:'📝',title:'Online Forms Open',description:'नए government और education online forms के लिए application assistance उपलब्ध है।',date:'Applications Open',valid:'Form deadline के अनुसार',badge:'NEW',ticker:'📝 Online forms की नई जानकारी live screen पर देखें।'},
{type:'OFFER',icon:'🔥',title:'Special CSC Discount',description:'Selected form filling, print/scan और digital assistance services पर special offer।',date:'Today Offer',valid:'Offer availability के अनुसार',badge:'DISCOUNT',ticker:'🔥 Selected services पर special CSC discount available है।'},
{type:'UPDATE',icon:'🏛️',title:'Government Scheme Update',description:'नई सरकारी योजना, eligibility और application status की latest information।',date:'Latest',valid:'Official update के अनुसार',badge:'GOVT',ticker:'🏛️ Government scheme की latest information यहाँ मिलेगी।'},
{type:'UPDATE',icon:'🪪',title:'Aadhaar / PAN Service Update',description:'Aadhaar और PAN services से जुड़े नए process, documents और service updates।',date:'Latest',valid:'Latest service notice',badge:'SERVICE',ticker:'🪪 Aadhaar और PAN service updates live उपलब्ध हैं।'},
{type:'UPDATE',icon:'💼',title:'Job & Exam Notifications',description:'Government jobs, exam forms और admission notifications की जानकारी।',date:'Latest',valid:'Notification deadline के अनुसार',badge:'NEW',ticker:'💼 Government job और exam form notifications देखें।'}
];
let liveOfferIndex=0,liveOfferTimer=null;
let serverLiveOffers=[];function getLiveOffers(){return serverLiveOffers.filter(x=>x&&x.published!==false)}async function loadServerLiveOffers(){try{const d=await api('/api/offers');serverLiveOffers=(d.offers||[]).map(o=>({type:o.type||'UPDATE',category:o.update_category||'',icon:o.type==='OFFER'?'🔥':'📰',title:o.title,subtitle:o.subtitle||'',description:o.description||'',date:o.last_date?'Last Date: '+o.last_date:(o.valid?'Valid till '+o.valid:'Latest'),valid:o.expires_at?'Valid till '+new Date(o.expires_at).toLocaleString('hi-IN'):(o.valid||'LIVE'),badge:o.type==='OFFER'?'OFFER':(o.update_category||'UPDATE'),ticker:o.ticker||o.subtitle||o.description,image:o.image,original_price:o.original_price,offer_price:o.offer_price,discount:o.discount,save_amount:o.save_amount,priority:o.priority,service:o.service||''}));renderLiveOffers()}catch(e){}}
function renderLiveOffers(){const items=getLiveOffers();if(!items.length)return;liveOfferIndex=liveOfferIndex%items.length;const o=items[liveOfferIndex];const kind=$('#liveOfferKind'),ey=$('#liveOfferEyebrow'),title=$('#liveOfferTitle'),desc=$('#liveOfferDescription'),date=$('#liveOfferDate'),valid=$('#liveOfferValidity'),ticker=$('#offerTicker'),list=$('#liveOfferList'),dots=$('#liveOfferDots'),count=$('#customerUpdateCount');const safe=v=>escapeHtml(v??'');if(kind)kind.textContent=o.badge||o.type||'UPDATE';if(ey)ey.textContent=o.type==='OFFER'?"TODAY'S OFFER":(o.category||'LATEST UPDATE');if(title)title.textContent=(o.icon||'📢')+' '+(o.title||'Live Update');if(desc)desc.innerHTML=(o.subtitle?'<b>'+safe(o.subtitle)+'</b><br>':'')+safe(o.description)+(o.service?'<br><small>Service: '+safe(o.service)+'</small>':'')+(o.type==='OFFER'&&o.offer_price?'<br><strong>₹ '+safe(o.offer_price)+'</strong>'+(o.original_price?' <s>₹ '+safe(o.original_price)+'</s>':'')+(o.discount?' · '+safe(o.discount)+'% OFF':''):'');if(date)date.textContent=o.date||'Latest';if(valid)valid.textContent=o.valid||'Valid till update expires';const im=$('#liveOfferImage');if(im){im.hidden=!o.image;im.src=o.image||'';}if(ticker)ticker.textContent=o.ticker||o.description||'';if(count)count.textContent=String(items.length);if(dots)dots.innerHTML=items.map((_,i)=>`<i class="${i===liveOfferIndex?'active':''}"></i>`).join('');if(list)list.innerHTML=items.slice(0,5).map((x,i)=>`<div class="offer-item ${x.type==='OFFER'?'discount':''}"><div class="offer-icon">${safe(x.icon||'📢')}</div><div><b>${safe(x.title||'Live Update')}</b><small>${safe(x.subtitle||x.description||'')}${x.type==='OFFER'&&x.offer_price?' · ₹ '+safe(x.offer_price)+(x.discount?' · '+safe(x.discount)+'% OFF':''):''}</small></div><span class="offer-badge">${safe(x.badge||x.type||'LIVE')}</span></div>`).join('');}
function startLiveOffers(){renderLiveOffers();clearInterval(liveOfferTimer);liveOfferTimer=setInterval(()=>{const items=getLiveOffers();if(items.length>1){liveOfferIndex=(liveOfferIndex+1)%items.length;renderLiveOffers()}},6500)}
async function getGlobalQueue(){try{const d=await api('/api/customer/live-queue');return Array.isArray(d.tokens)?d.tokens:[]}catch(e){return []}}
function notificationIcon(n){return ({payment:'💰',document:'📄',correction:'✏️',token:'🎫',processing:'▶️',completion:'✅',receipt:'🧾'})[n.type]||'🔔'}
function notificationHtml(n){const cls=n.read?'':' unread';const dt=n.created_at?new Date(n.created_at).toLocaleString('hi-IN'):'—';return `<article class="notification-item${cls}"><div class="notification-icon">${notificationIcon(n)}</div><div><h4>${escapeHtml(n.title||'Notification')}</h4><p>${escapeHtml(n.message||'')}</p></div><small>${escapeHtml(dt)}</small></article>`}
async function loadCustomerNotifications(){if(!hasCustomerLogin()){openCustomerLogin('Notifications देखने के लिए Customer Login जरूरी है।');return}try{const d=await api('/api/customer/notifications');const el=$('#customerNotifications');if(el)el.innerHTML=d.notifications?.length?d.notifications.map(notificationHtml).join(''):'<div class="muted">अभी कोई notification नहीं है।</div>';if($('#notificationUnread'))$('#notificationUnread').textContent=`${d.unread||0} Unread`}catch(e){toast(e.message)}}
async function refreshAll(){try{let d=null;if(hasCustomerLogin()){d=await api('/api/customer/dashboard')}const globalData=await (async()=>{try{return await api('/api/customer/live-queue')}catch(e){return {tokens:[],total:0}}})();const globalRows=Array.isArray(globalData.tokens)?globalData.tokens:[];window._angelGlobalQueue=globalRows;let mineRows=[];if(d){const c=d.customer||{};currentMobile=c.mobile||'';localStorage.setItem('angelCustomerProfile',JSON.stringify(c));updateCustomerHeader(c);mineRows=d.tokens||[]}const mine=mineRows.find(r=>!['पूर्ण','रद्द','स्किप'].includes(r.status))||mineRows.slice().reverse()[0]||null;const active=globalRows.find(r=>['बुलाया','प्रगति'].includes(r.status))||globalRows.find(r=>r.status==='लंबित');const pending=globalRows.filter(r=>r.status==='लंबित');const ahead=mine&&!['पूर्ण','रद्द','स्किप'].includes(mine.status)?Math.max(0,pending.findIndex(r=>r.id===mine.id)):0;const avgMinutes=Number(localStorage.getItem('angelQueueAvgMinutes')||5);const wait=mine?(active?.id===mine.id?'अब आपकी बारी':(ahead*avgMinutes+avgMinutes)+' मिनट'):'—';const x={mine,ahead,wait,avgMinutes,active,total:d?.summary?.total_tokens??null,globalTotal:globalRows.length,rows:globalRows};renderMine(x);refreshCustomerProgress();$('#statusQueue').innerHTML=queueHtml(globalRows);loadCustomerUpdates(globalRows);renderLiveOffers();const summary=d?.summary||{};if($('#dashCustomerId'))$('#dashCustomerId').textContent=d?.customer?.customer_id||'Login करें';if($('#dashCustomerName'))$('#dashCustomerName').textContent=d?.customer?.name||'Guest';if($('#dashCustomerMobile'))$('#dashCustomerMobile').textContent=d?.customer?.mobile||'—';if($('#dashTotalServices'))$('#dashTotalServices').textContent=d?String(summary.total_tokens??0):'—';if($('#dashCompleted'))$('#dashCompleted').textContent=d?String(summary.completed_tokens??0):'—';if($('#dashVerifiedPayments'))$('#dashVerifiedPayments').textContent=d?String(summary.verified_payments??0):'—';if($('#historyCustomerId'))$('#historyCustomerId').textContent=d?.customer?.customer_id||'Login required';if($('#historyCustomerMobile'))$('#historyCustomerMobile').textContent=d?.customer?.mobile||currentMobile||'—';if($('#recordsCustomerId'))$('#recordsCustomerId').textContent=d?.customer?.customer_id||'Login required';if($('#recordsCustomerMobile'))$('#recordsCustomerMobile').textContent=d?.customer?.mobile||currentMobile||'—';if(d)renderCustomerRecords(d); if(d)loadCustomerNotifications(); if(localStorage.getItem('angelPaymentId')) await checkPaymentStatus()}catch(e){if(String(e.message||'').toLowerCase().includes('session')){localStorage.removeItem('angelCustomerSession');updateCustomerHeader(null)}else toast(e.message)}}
startLiveOffers();loadServerLiveOffers();setInterval(loadServerLiveOffers,15000);setInterval(()=>{if($('#page-customer-token')?.classList.contains('active-page'))checkPaymentStatus();refreshCustomerProgress()},5000);
async function lookupPublicTrack(ref){
  const panel=$('#trackResultPanel'),box=$('#trackResult');
  if(!panel||!box)return;
  panel.style.display='block'; box.innerHTML='<div class=\"muted\">Status खोजा जा रहा है…</div>';
  try{
    const d=await api('/api/customer/track?ref='+encodeURIComponent(String(ref||'').trim()));
    const x=d.result||{};
    const label=x.type==='token'?'Token':'Application';
    box.innerHTML='<div class=\"track-result-grid\"><div><small class=\"muted\">'+escapeHtml(label)+'</small><b>'+escapeHtml(x.reference||ref)+'</b></div><div><small class=\"muted\">Service</small><b>'+escapeHtml(x.service||'—')+'</b></div><div><small class=\"muted\">Status</small><b>'+escapeHtml(x.status||'—')+'</b></div><div><small class=\"muted\">Date</small><b>'+escapeHtml(x.created_at?new Date(x.created_at).toLocaleString('hi-IN'):'—')+'</b></div></div>';
  }catch(e){box.innerHTML='<div class=\"muted\">'+escapeHtml(e.message||'Reference नहीं मिला।')+'</div>';}
}

// Public front-page deep links: open the selected service/section instead of dropping the selection.
(function handlePublicDeepLink(){
  const q=new URLSearchParams(location.search);
  const service=q.get('service');
  const section=q.get('section');
  const track=q.get('track');
  setTimeout(()=>{
    try{
      if(service && services.includes(service)){ openCustomerServiceDetails(service); return; }
      if(section==='customer-status'){ go('customer-status'); return; }
      if(section==='customer-services'){ go('customer-services'); return; }
      if(section==='home-service'){ go('customer-home-service'); return; }
      if(section==='customer-appointments'){ go('customer-appointments'); return; }
      if(section==='customer-home-service'){ go('customer-home-service'); return; }
      if(track){ go('customer-status'); lookupPublicTrack(track); return; }
    }catch(e){toast(e.message||'Page open नहीं हो पाया।')}
  },0);
})();
ensureCustomerAuth().then(ok=>{if(ok)drawCustomerQr(localStorage.getItem('angelCustomerQrPayload')||'');else updateCustomerHeader(null);});
function clock(){const d=new Date();$('#customerClock').textContent=d.toLocaleString('hi-IN',{dateStyle:'medium',timeStyle:'short'});setTimeout(clock,1000)}clock();refreshAll();setInterval(refreshAll,3000);

$('#refreshNotifications').onclick=()=>loadCustomerNotifications();$('#markAllNotifications').onclick=async()=>{try{await api('/api/customer/notifications/read',{method:'POST',body:JSON.stringify({})});loadCustomerNotifications()}catch(e){toast(e.message)}};

// STEP366: Application Tracking — Application ID only, no customer data exposed.
async function trackApplication(){
  const ref=String($('#trackingApplicationId')?.value||'').trim();
  const statusEl=$('#trackingStatus'),panel=$('#applicationTrackingResult');
  if(!ref){if(statusEl)statusEl.textContent='Application ID दर्ज करें।';return;}
  if(statusEl)statusEl.textContent='Application status खोजा जा रहा है…';
  try{
    const d=await api('/api/customer/track?ref='+encodeURIComponent(ref));
    const x=d.result||{};
    if(panel)panel.style.display='block';
    if($('#trackingRef'))$('#trackingRef').textContent=x.reference||ref;
    if($('#trackingService'))$('#trackingService').textContent=x.service||'—';
    if($('#trackingCurrentStatus'))$('#trackingCurrentStatus').textContent=x.status||'—';
    const steps=Array.isArray(x.steps)?x.steps:[];
    const idx=Math.max(0,steps.findIndex(s=>s.id===x.current_step));
    if($('#applicationTimeline'))$('#applicationTimeline').innerHTML=steps.map((st,i)=>{
      const done=!!st.done, active=i===idx&&!done;
      const cls=done?'done':(active?'active':'pending');
      const dt=st.date?new Date(st.date).toLocaleString('hi-IN'):'';
      return `<div class="application-step ${cls}"><div class="application-step-marker">${done?'✓':(i+1)}</div><div><b>${escapeHtml(st.label||'')}</b>${dt?`<small>${escapeHtml(dt)}</small>`:''}</div></div>`;
    }).join('');
    if(statusEl)statusEl.textContent='Application tracking updated.';
  }catch(e){
    if(panel)panel.style.display='none';
    if(statusEl)statusEl.textContent=e.message||'Application ID नहीं मिला।';
  }
}
$('#trackApplicationButton')?.addEventListener('click',trackApplication);
$('#trackingApplicationId')?.addEventListener('keydown',e=>{if(e.key==='Enter')trackApplication()});
