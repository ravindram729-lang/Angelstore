/* STEP645 — Angelstore Partner Referral Services
 * Additive module only: Bank Account Opening + Demat Account Opening.
 * No payment, token, receipt, approval or application workflow is introduced here.
 */
(function(){
  'use strict';
  const isAdmin=document.body?.dataset.panel==='admin';
  const isCustomer=document.body?.dataset.panel==='customer';
  if(!isAdmin&&!isCustomer)return;

  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const safeUrl=v=>{try{const u=new URL(String(v||''));return u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password&&!/[\s\u0000-\u001f]/.test(String(v))?u.href:''}catch{return ''}};
  const safeLogo=v=>{const raw=String(v||'').trim();if(safeUrl(raw))return raw;if(raw.startsWith('/')&&!raw.startsWith('//')&&!raw.includes('\\')&&!/[\s\u0000-\u001f]/.test(raw))return raw;return ''};
  const icon=(kind)=>kind==='bank'?'🏦':'📈';

  function addNav(){
    const nav=document.querySelector(isAdmin?'#nav':'.sidebar nav');
    if(!nav)return;
    if(isAdmin){
      const anchor=nav.querySelector('[data-page="uppcl-control"]');
      if(!nav.querySelector('[data-page="partner-banks"]')){
        const b=document.createElement('button');b.type='button';b.dataset.page='partner-banks';b.className='nav-control partner-nav-bank';
        b.innerHTML='<b class="nav-icon">🏦</b><span>Bank Account Opening</span>';
        (anchor?.parentNode||nav).insertBefore(b,anchor?.nextSibling||null);
      }
      if(!nav.querySelector('[data-page="demat-partners"]')){
        const b=document.createElement('button');b.type='button';b.dataset.page='demat-partners';b.className='nav-control partner-nav-demat';
        b.innerHTML='<b class="nav-icon">📈</b><span>Demat Partners</span>';
        const bank=nav.querySelector('[data-page="partner-banks"]');
        (bank?.parentNode||nav).insertBefore(b,bank?.nextSibling||null);
      }
    }else{
      const anchor=nav.querySelector('[data-page="customer-uppcl"]');
      const make=(page,label,ico)=>{
        if(nav.querySelector('[data-page="'+page+'"]'))return;
        const b=document.createElement('button');b.type='button';b.dataset.page=page;
        b.innerHTML='<i class="cs-nav-icon">'+ico+'</i><span>'+label+'</span>';
        (anchor?.parentNode||nav).insertBefore(b,anchor?.nextSibling||null);
        return b;
      };
      make('customer-bank-account','Bank Account Opening','🏦');
      const bank=nav.querySelector('[data-page="customer-bank-account"]');
      if(!nav.querySelector('[data-page="customer-demat-account"]')){
        const b=document.createElement('button');b.type='button';b.dataset.page='customer-demat-account';
        b.innerHTML='<i class="cs-nav-icon">📈</i><span>Demat Account Opening</span>';
        (bank?.parentNode||nav).insertBefore(b,bank?.nextSibling||null);
      }
    }
  }

  function addCustomerHomeCards(){
    const home=document.getElementById('page-customer-home');
    const quick=document.getElementById('customerQuickServices');
    if(!home||home.querySelector('#angelPartnerFinancialSection'))return;
    const sec=document.createElement('section');
    sec.id='angelPartnerFinancialSection';
    sec.className='panel angel-partner-home';
    sec.innerHTML=`
      <div class="angel-partner-head">
        <div><span class="eyebrow">FINANCIAL SERVICES</span><h3>🏦 Bank & Demat Account Opening</h3>
        <p>Partner referral link के माध्यम से सीधे bank या Demat partner की website पर जाएँ।</p></div>
        <span class="angel-partner-badge">PARTNER LINKS</span>
      </div>
      <div class="angel-partner-home-grid">
        <button type="button" class="angel-partner-home-card bank" data-page="customer-bank-account"><span>🏦</span><b>Bank Account Opening</b><small>Kotak Mahindra, IndusInd और Admin द्वारा जोड़े गए अन्य banks</small><strong>Open Bank Account →</strong></button>
        <button type="button" class="angel-partner-home-card demat" data-page="customer-demat-account"><span>📈</span><b>Demat Account Opening</b><small>5paisa, Lemonn, Ventura, Upstox और अन्य partners</small><strong>Open Demat Account →</strong></button>
      </div>`;
    const quickSection=quick?.closest('.c-home-quick-services');
    (quickSection?.parentNode||home).insertBefore(sec,quickSection?.nextSibling||null);
  }

  function addCustomerPages(){
    const app=document.getElementById('customerApp'); if(!app)return;
    const make=(page,title,kind,desc)=>{
      if(document.getElementById('page-'+page))return;
      const s=document.createElement('section');s.id='page-'+page;s.className='page angel-partner-page';
      s.innerHTML=`
        <div class="page-title angel-partner-title">
          <div><span class="eyebrow">PARTNER REFERRAL SERVICE</span><h2>${icon(kind)} ${title}</h2><p>${desc}</p></div>
        </div>
        <div class="panel angel-partner-note"><b>ℹ️ कैसे काम करेगा?</b><span>Partner चुनें → <b>Open</b> पर क्लिक करें → partner की referral link खुलेगी। Actual account opening partner की website/app पर होगा।</span></div>
        <div class="angel-partner-grid" data-partner-grid="${kind}"><div class="panel muted">Loading…</div></div>`;
      app.appendChild(s);
    };
    make('customer-bank-account','Bank Account Opening','bank','Bank account opening के लिए उपलब्ध partner banks');
    make('customer-demat-account','Demat Account Opening','demat','Demat account opening के लिए उपलब्ध partner links');
  }

  function addAdminPages(){
    const app=document.getElementById('app'); if(!app)return;
    const make=(page,title,kind)=>{
      if(document.getElementById('page-'+page))return;
      const s=document.createElement('section');s.id='page-'+page;s.className='page angel-admin-partner-page';
      s.innerHTML=`
        <div class="page-title angel-partner-title">
          <div><span class="eyebrow">PARTNER MANAGEMENT</span><h2>${icon(kind)} ${title}</h2><p>Referral links manage करें। Existing Angelstore workflows पर इसका कोई प्रभाव नहीं है।</p></div>
          <button type="button" class="primary" data-partner-add="${kind}">＋ ${kind==='bank'?'Add Bank':'Add Demat Partner'}</button>
        </div>
        <div class="panel angel-admin-partner-form hidden" data-partner-form="${kind}">
          <form novalidate data-partner-form-element="${kind}">
            <input type="hidden" name="id">
            <div class="form-row">
              <label>${kind==='bank'?'Bank Name':'Partner Name'}<input name="name" required placeholder="${kind==='bank'?'Kotak Mahindra Bank':'5paisa'}"></label>
              <label>${kind==='bank'?'Account Type':'Account Type / Plan'}<input name="account_type" value="${kind==='bank'?'Savings / Current':'Demat & Trading'}"></label>
            </div>
            <div class="form-row">
              <label>Referral Link <input name="referral_link" type="url" placeholder="https://partner.example/..."></label>
              <label>Logo URL (optional)<input name="logo" type="url" placeholder="https://.../logo.png"></label>
            </div>
            <label class="angel-admin-active"><input name="active" type="checkbox" checked> Customer Panel में Active</label>
            <div class="form-actions"><button type="submit" class="primary">Save</button><button type="button" data-partner-cancel="${kind}">Cancel</button></div>
            <div class="muted angel-form-status" data-partner-status="${kind}"></div>
          </form>
        </div>
        <div class="panel"><div class="angel-admin-table-wrap"><table class="angel-admin-partner-table">
          <thead><tr><th>#</th><th>${kind==='bank'?'Bank':'Partner'}</th><th>Logo</th><th>Account Type / Plan</th><th>Referral Link</th><th>Status</th><th>Action</th></tr></thead>
          <tbody data-partner-table="${kind}"><tr><td colspan="7" class="muted">Loading…</td></tr></tbody>
        </table></div></div>`;
      app.appendChild(s);
    };
    make('partner-banks','Bank Account Opening','bank');
    make('demat-partners','Demat Partner Management','demat');
  }

  function api(path,opts={}){
    if(window.angelApi)return window.angelApi(path,opts);
    const headers=new Headers(opts.headers||{});
    if(opts.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
    const m=document.cookie.match(/(?:^|;\s*)angel_csrf=([^;]+)/);
    if(m&&!headers.has('X-CSRF-Token'))headers.set('X-CSRF-Token',decodeURIComponent(m[1]));
    return fetch(path,{...opts,headers,credentials:'include'}).then(async r=>{
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'Request failed');
      return d;
    });
  }

  async function loadCustomer(kind){
    const endpoint=kind==='bank'?'/api/partner-banks':'/api/demat-partners';
    const grid=document.querySelector(`[data-partner-grid="${kind}"]`);if(!grid)return;
    try{
      const d=await api(endpoint);const rows=kind==='bank'?(d.banks||[]):(d.partners||[]);
      if(!rows.length){grid.innerHTML='<div class="panel angel-empty-partner">अभी कोई active partner उपलब्ध नहीं है। Admin referral link configure करेगा।</div>';return;}
      grid.innerHTML=rows.map((x,i)=>{
        const link=safeUrl(x.referral_link);
        const logo=safeLogo(x.logo);
        return `<article class="angel-partner-card ${kind}">
          <div class="angel-partner-logo">${logo?`<img src="${esc(logo)}" alt="${esc(x.name)} logo" loading="lazy" onerror="this.remove()">`:`<span>${icon(kind)}</span>`}</div>
          <h3>${esc(x.name)}</h3><small>${esc(x.account_type||'')}</small>
          ${link?`<a class="primary angel-open-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${kind==='bank'?'Open Account':'Open Demat'} ↗</a>`:`<button type="button" class="angel-open-link" disabled>Referral Link Pending</button>`}
          <p>Partner referral link के माध्यम से opening होगी।</p>
        </article>`;
      }).join('');
    }catch(e){grid.innerHTML=`<div class="panel angel-empty-partner">${esc(e.message||'Partner list load नहीं हुई।')}</div>`;}
  }

  let adminCache={bank:[],demat:[]};
  async function loadAdmin(kind){
    const endpoint=kind==='bank'?'/api/admin/partner-banks':'/api/admin/demat-partners';
    const tbody=document.querySelector(`[data-partner-table="${kind}"]`);if(!tbody)return;
    try{
      const d=await api(endpoint);const rows=kind==='bank'?(d.banks||[]):(d.partners||[]);adminCache[kind]=rows;
      if(!rows.length){tbody.innerHTML='<tr><td colspan="7" class="muted">कोई record नहीं है।</td></tr>';return;}
      tbody.innerHTML=rows.map((x,i)=>`<tr>
        <td>${i+1}</td><td><b>${esc(x.name)}</b></td>
        <td>${safeLogo(x.logo)?`<img class="angel-table-logo" src="${esc(safeLogo(x.logo))}" alt="" onerror="this.remove()">`:'—'}</td>
        <td>${esc(x.account_type||'')}</td>
        <td>${safeUrl(x.referral_link)?`<a href="${esc(safeUrl(x.referral_link))}" target="_blank" rel="noopener noreferrer" class="angel-link-chip">🔗 Open Link</a>`:'<span class="tag orange">Not configured</span>'}</td>
        <td><span class="tag ${x.active!==false?'green':'orange'}">${x.active!==false?'Active':'Inactive'}</span></td>
        <td><div class="angel-table-actions"><button type="button" data-partner-edit="${kind}" data-id="${x.id}">✎</button><button type="button" class="danger" data-partner-delete="${kind}" data-id="${x.id}">🗑</button></div></td>
      </tr>`).join('');
    }catch(e){tbody.innerHTML=`<tr><td colspan="7" class="muted">${esc(e.message||'Load failed')}</td></tr>`;}
  }

  function resetForm(kind){
    const form=document.querySelector(`[data-partner-form-element="${kind}"]`);if(!form)return;
    form.reset();form.elements.id.value='';form.elements.active.checked=true;
    form.elements.account_type.value=kind==='bank'?'Savings / Current':'Demat & Trading';
    const status=document.querySelector(`[data-partner-status="${kind}"]`);if(status)status.textContent='';
  }
  function showForm(kind,row){
    const box=document.querySelector(`[data-partner-form="${kind}"]`),form=document.querySelector(`[data-partner-form-element="${kind}"]`);if(!box||!form)return;
    if(row){
      form.elements.id.value=row.id;form.elements.name.value=row.name||'';form.elements.account_type.value=row.account_type||'';form.elements.referral_link.value=row.referral_link||'';form.elements.logo.value=row.logo||'';form.elements.active.checked=row.active!==false;
    }else resetForm(kind);
    box.classList.remove('hidden');box.scrollIntoView({behavior:'smooth',block:'start'});
    form.elements.name.focus();
  }

  async function saveAdmin(kind,form){
    const status=document.querySelector(`[data-partner-status="${kind}"]`);
    const data={id:Number(form.elements.id.value||0)||undefined,name:form.elements.name.value.trim(),account_type:form.elements.account_type.value.trim(),referral_link:form.elements.referral_link.value.trim(),logo:form.elements.logo.value.trim(),active:form.elements.active.checked};
    if(!data.name){status.textContent='Name जरूरी है';return;}
    if(data.referral_link&&!safeUrl(data.referral_link)){status.textContent='Referral link में valid HTTPS URL डालें';return;}
    if(data.logo&&!safeLogo(data.logo)){status.textContent='Logo के लिए HTTPS URL या / से शुरू होने वाला local path डालें';return;}
    try{
      status.textContent='Saving…';
      await api(kind==='bank'?'/api/admin/partner-banks':'/api/admin/demat-partners',{method:'POST',body:JSON.stringify(data)});
      status.textContent='Saved';
      document.querySelector(`[data-partner-form="${kind}"]`)?.classList.add('hidden');
      await loadAdmin(kind);
    }catch(e){status.textContent=e.message||'Save failed';}
  }

  async function deleteAdmin(kind,id){
    if(!confirm('इस partner को delete करना है?'))return;
    try{await api((kind==='bank'?'/api/admin/partner-banks/':'/api/admin/demat-partners/')+encodeURIComponent(id),{method:'DELETE'});await loadAdmin(kind);}
    catch(e){alert(e.message||'Delete failed');}
  }

  function bind(){
    addNav();
    if(isCustomer){
      addCustomerHomeCards();addCustomerPages();
      document.addEventListener('click',e=>{
        const home=e.target.closest?.('.angel-partner-home-card');
        if(home){e.preventDefault();const page=home.dataset.page;window.go?.(page);return;}
        const nav=e.target.closest?.('[data-page="customer-bank-account"],[data-page="customer-demat-account"]');
        if(nav){e.preventDefault();if(typeof window.go==='function')window.go(nav.dataset.page);}
      });
      loadCustomer('bank');loadCustomer('demat');
    }else{
      addAdminPages();
      document.addEventListener('click',e=>{
        const add=e.target.closest?.('[data-partner-add]');
        if(add){showForm(add.dataset.partnerAdd);return;}
        const cancel=e.target.closest?.('[data-partner-cancel]');
        if(cancel){document.querySelector(`[data-partner-form="${cancel.dataset.partnerCancel}"]`)?.classList.add('hidden');return;}
        const edit=e.target.closest?.('[data-partner-edit]');
        if(edit){const row=adminCache[edit.dataset.partnerEdit]?.find(x=>Number(x.id)===Number(edit.dataset.id));if(row)showForm(edit.dataset.partnerEdit,row);return;}
        const del=e.target.closest?.('[data-partner-delete]');
        if(del){deleteAdmin(del.dataset.partnerDelete,del.dataset.id);return;}
      });
      document.querySelectorAll('[data-partner-form-element]').forEach(form=>{
        form.addEventListener('submit',e=>{e.preventDefault();saveAdmin(form.dataset.partnerFormElement,form);});
      });
      loadAdmin('bank');loadAdmin('demat');
    }
  }

  // Loaded before the existing panel JS so its navigation/data-page hooks see the new pages.
  // At this point this script is placed at the end of the document, so build synchronously.
  bind();
})();
