let activities = [];
let purchases = [];
let settlements = [];
let orders = [];
let products = [];
let businessProfile = {};
let editingOrderId = null;
let editingProductId = null;
let editingPurchaseId = null;
let selectedActivityId = 'all'; // shared selection concept across tabs, 'all' or activity id or 'none'
let hasLoadedOnce = false;
let selectedPurchaseIds = new Set(); // for grouping multiple purchase lines into one repayment settlement

const colorMap = {cny:'var(--cny)', midautumn:'var(--midautumn)', generic:'var(--generic)'};

const sb = (window.SUPABASE_URL && window.SUPABASE_ANON_KEY)
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

if(!sb){
  document.getElementById('config-warning').style.display = 'block';
}

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1800);
}

function fmtMoney(n){
  n = Number(n)||0;
  return 'RM ' + n.toFixed(2);
}

function uid(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}

// ---------- 固定人名选单 + OTHER 自由输入 ----------
function toggleOtherField(selectId, otherId){
  const select = document.getElementById(selectId);
  document.getElementById(otherId).style.display = select.value==='OTHER' ? 'block' : 'none';
}
function getOtherAwareValue(selectId, otherId){
  const select = document.getElementById(selectId);
  if(select.value==='OTHER') return document.getElementById(otherId).value.trim();
  return select.value;
}
function setOtherAwareValue(selectId, otherId, value){
  const select = document.getElementById(selectId);
  const otherInput = document.getElementById(otherId);
  const known = Array.from(select.options).map(o=>o.value).filter(v=>v!=='OTHER');
  if(value && known.includes(value)){
    select.value = value;
    otherInput.style.display = 'none';
    otherInput.value = '';
  } else {
    select.value = 'OTHER';
    otherInput.style.display = value ? 'block' : 'none';
    otherInput.value = value || '';
  }
}

// ---------- Row <-> JS field mapping ----------
function activityToRow(a){
  return { id: a.id, name: a.name, icon: a.icon, color: a.color };
}
function rowToActivity(r){
  return { id: r.id, name: r.name, icon: r.icon, color: r.color };
}

function productToRow(p){
  return {
    id: p.id,
    activity_id: p.activityId,
    name: p.name,
    price: p.price,
    pieces_per_unit: p.piecesPerUnit,
    flavor_options: p.flavorOptions || [],
    note: p.note || ''
  };
}
function rowToProduct(r){
  return {
    id: r.id,
    activityId: r.activity_id,
    name: r.name,
    price: Number(r.price)||0,
    piecesPerUnit: Number(r.pieces_per_unit)||1,
    flavorOptions: r.flavor_options || [],
    note: r.note || ''
  };
}

function purchaseToRow(p){
  return {
    id: p.id,
    activity_id: p.activityId,
    date: p.date || null,
    supplier: p.supplier || '',
    items: p.items || [],
    total_cost: p.totalCost,
    rmb_total: p.rmbTotal || 0,
    note: p.note || '',
    buyer: p.buyer || '',
    is_advance: !!p.isAdvance,
    repaid: !!p.repaid,
    shop_name: p.shopName || '',
    product_link: p.productLink || '',
    product_photo: p.productPhoto || '',
    product_pdf: p.productPdf || ''
  };
}
function rowToPurchase(r){
  // 旧数据是单一货品字段（item/qty/unit/unit_price），没有 items[] 时转换成一项显示，不用另外跑数据迁移
  let items = Array.isArray(r.items) ? r.items : [];
  if(items.length===0 && r.item){
    items = [{
      name: r.item,
      qty: Number(r.qty)||0,
      unit: r.unit || '',
      unitPrice: Number(r.unit_price)||0,
      lineTotal: Number(r.total_cost)||0,
      rmbUnitPrice: Number(r.rmb_unit_price)||0,
      rmbLineTotal: Number(r.rmb_total)||0
    }];
  }
  return {
    id: r.id,
    activityId: r.activity_id,
    date: r.date || '',
    supplier: r.supplier || '',
    items,
    totalCost: Number(r.total_cost)||0,
    rmbTotal: Number(r.rmb_total)||0,
    note: r.note || '',
    buyer: r.buyer || '',
    isAdvance: !!r.is_advance,
    repaid: !!r.repaid,
    shopName: r.shop_name || '',
    productLink: r.product_link || '',
    productPhoto: r.product_photo || '',
    productPdf: r.product_pdf || ''
  };
}

function settlementToRow(s){
  return {
    id: s.id,
    activity_id: s.activityId,
    buyer: s.buyer || '',
    purchase_ids: s.purchaseIds || [],
    rmb_total: s.rmbTotal || 0,
    myr_amount: s.myrAmount || 0,
    needs_repay: !!s.needsRepay,
    repaid: !!s.repaid,
    note: s.note || ''
  };
}
function rowToSettlement(r){
  return {
    id: r.id,
    activityId: r.activity_id,
    buyer: r.buyer || '',
    purchaseIds: r.purchase_ids || [],
    rmbTotal: Number(r.rmb_total)||0,
    myrAmount: Number(r.myr_amount)||0,
    needsRepay: !!r.needs_repay,
    repaid: !!r.repaid,
    note: r.note || ''
  };
}

function fmtRmb(n){
  return '¥ ' + (Number(n)||0).toFixed(2);
}

function purchaseSummaryTitle(p){
  if(!p.items || p.items.length===0) return p.supplier || '采购记录';
  if(p.items.length===1) return p.items[0].name;
  return (p.supplier || '采购记录') + `（${p.items.length}项）`;
}

function orderToRow(o){
  return {
    id: o.id,
    activity_id: o.activityId,
    invoice_no: o.invoiceNo,
    customer_name: o.customerName,
    contact_person: o.contactPerson || '',
    phone: o.phone || '',
    items: o.items || [],
    total_price: o.totalPrice,
    order_date: o.orderDate || null,
    deliver_date: o.deliverDate || null,
    deliver_time: o.deliverTime || '',
    delivery_method: o.deliveryMethod,
    address: o.address || '',
    note: o.note || '',
    payment_status: o.paymentStatus,
    paid_amount: o.paidAmount
  };
}
function rowToOrder(r){
  return {
    id: r.id,
    activityId: r.activity_id,
    invoiceNo: r.invoice_no,
    invoiceSeq: r.invoice_seq || null,
    customerName: r.customer_name,
    contactPerson: r.contact_person || '',
    phone: r.phone || '',
    items: r.items || [],
    totalPrice: Number(r.total_price)||0,
    orderDate: r.order_date || '',
    deliverDate: r.deliver_date || '',
    deliverTime: r.deliver_time || '',
    deliveryMethod: r.delivery_method || 'pickup',
    address: r.address || '',
    note: r.note || '',
    paymentStatus: r.payment_status || 'unpaid',
    paidAmount: Number(r.paid_amount)||0
  };
}

function businessProfileToRow(bp){
  return {
    id: 1,
    biz_name: bp.bizName || '',
    reg_no: bp.regNo || '',
    phone: bp.phone || '',
    address: bp.address || '',
    bank_name: bp.bankName || '',
    bank_account_name: bp.bankAccountName || '',
    bank_account_number: bp.bankAccountNumber || '',
    terms: bp.terms || '',
    qr_image: bp.qrImage || '',
    logo_image: bp.logoImage || ''
  };
}
function rowToBusinessProfile(r){
  if(!r) return {};
  return {
    bizName: r.biz_name || '',
    regNo: r.reg_no || '',
    phone: r.phone || '',
    address: r.address || '',
    bankName: r.bank_name || '',
    bankAccountName: r.bank_account_name || '',
    bankAccountNumber: r.bank_account_number || '',
    terms: r.terms || '',
    qrImage: r.qr_image || '',
    logoImage: r.logo_image || ''
  };
}

async function loadAll(){
  if(!sb){ return; }
  try{
    const [a, pr, pu, ps, o, bp] = await Promise.all([
      sb.from('activities').select('*').order('created_at'),
      sb.from('products').select('*').order('created_at'),
      sb.from('purchases').select('*').order('created_at'),
      sb.from('purchase_settlements').select('*').order('created_at'),
      sb.from('orders').select('*').order('created_at'),
      sb.from('business_profile').select('*').eq('id', 1).maybeSingle()
    ]);
    if(a.error) throw a.error;
    if(pr.error) throw pr.error;
    if(pu.error) throw pu.error;
    if(ps.error) throw ps.error;
    if(o.error) throw o.error;
    if(bp.error) throw bp.error;

    activities = (a.data||[]).map(rowToActivity);
    products = (pr.data||[]).map(rowToProduct);
    purchases = (pu.data||[]).map(rowToPurchase);
    settlements = (ps.data||[]).map(rowToSettlement);
    orders = (o.data||[]).map(rowToOrder);
    businessProfile = rowToBusinessProfile(bp.data);
  }catch(e){
    console.error(e);
    showToast('读取数据失败，请检查网络或 Supabase 设置');
    return;
  }

  fillBusinessForm();

  if(activities.length === 0){
    const defaultActivity = {id:'none', name:'常规订单（不属于节庆）', icon:'🎂', color:'generic'};
    const {error} = await sb.from('activities').insert(activityToRow(defaultActivity));
    if(error){ console.error(error); showToast('初始化默认活动失败'); }
    else activities = [defaultActivity];
  }
  if(!hasLoadedOnce){
    // 第一次打开：默认显示最近创建的活动，避免把所有活动的数据混在一起看
    selectedActivityId = activities.length ? activities[activities.length-1].id : 'all';
    hasLoadedOnce = true;
  } else if(selectedActivityId!=='all' && !activities.some(a=>a.id===selectedActivityId)){
    // 手动刷新时保留原本选的活动；只有那个活动已经不存在了才改选别的
    selectedActivityId = activities.length ? activities[activities.length-1].id : 'all';
  }
  renderAll();
}

async function refreshData(){
  if(!sb){ showToast('请先设置 Supabase 连接信息'); return; }
  await loadAll();
  showToast('已刷新最新资料');
}

// ---------- Business Profile (for invoice printing) ----------
function fillBusinessForm(){
  document.getElementById('biz-name').value = businessProfile.bizName||'';
  document.getElementById('biz-regno').value = businessProfile.regNo||'';
  document.getElementById('biz-phone').value = businessProfile.phone||'';
  document.getElementById('biz-address').value = businessProfile.address||'';
  document.getElementById('biz-bank').value = businessProfile.bankName||'';
  document.getElementById('biz-bank-name').value = businessProfile.bankAccountName||'';
  document.getElementById('biz-bank-acc').value = businessProfile.bankAccountNumber||'';
  document.getElementById('biz-terms').value = businessProfile.terms||'';
  renderBusinessQrPreview();
  renderBusinessLogoPreview();
}

function renderBusinessQrPreview(){
  const box = document.getElementById('biz-qr-preview');
  box.innerHTML = businessProfile.qrImage ? `<div style="font-size:11px;color:var(--espresso-soft);margin-bottom:4px;">收款二维码：</div><img src="${businessProfile.qrImage}" style="max-width:120px;border:1px solid var(--border);border-radius:8px;display:block;">` : '';
}

function renderBusinessLogoPreview(){
  const box = document.getElementById('biz-logo-preview');
  box.innerHTML = businessProfile.logoImage ? `<div style="font-size:11px;color:var(--espresso-soft);margin-bottom:4px;">店铺 Logo：</div><img src="${businessProfile.logoImage}" style="max-width:100px;max-height:100px;border:1px solid var(--border);border-radius:8px;display:block;">` : '';
}

function readFileAsDataURL(file){
  return new Promise((resolve)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

async function persistBusinessProfile(){
  if(!sb){ showToast('请先设置 Supabase 连接信息'); return; }
  const {error} = await sb.from('business_profile').upsert(businessProfileToRow(businessProfile));
  if(error){ console.error(error); showToast('保存商家资料失败：'+error.message); return; }
  renderBusinessQrPreview();
  renderBusinessLogoPreview();
  showToast('商家资料已保存');
}

async function saveBusinessProfile(){
  const qrFileInput = document.getElementById('biz-qr-file');
  const logoFileInput = document.getElementById('biz-logo-file');
  const qrData = (qrFileInput.files && qrFileInput.files[0]) ? await readFileAsDataURL(qrFileInput.files[0]) : undefined;
  const logoData = (logoFileInput.files && logoFileInput.files[0]) ? await readFileAsDataURL(logoFileInput.files[0]) : undefined;
  businessProfile = {
    bizName: document.getElementById('biz-name').value.trim(),
    regNo: document.getElementById('biz-regno').value.trim(),
    phone: document.getElementById('biz-phone').value.trim(),
    address: document.getElementById('biz-address').value.trim(),
    bankName: document.getElementById('biz-bank').value.trim(),
    bankAccountName: document.getElementById('biz-bank-name').value.trim(),
    bankAccountNumber: document.getElementById('biz-bank-acc').value.trim(),
    terms: document.getElementById('biz-terms').value.trim(),
    qrImage: qrData !== undefined ? qrData : (businessProfile.qrImage || ''),
    logoImage: logoData !== undefined ? logoData : (businessProfile.logoImage || '')
  };
  await persistBusinessProfile();
}

function toggleNewActivityForm(show){
  document.getElementById('new-activity-form').style.display = show ? 'block' : 'none';
}

async function createActivity(){
  if(!sb){ showToast('请先设置 Supabase 连接信息'); return; }
  const name = document.getElementById('act-name').value.trim();
  if(!name){ showToast('请输入活动名称'); return; }
  const icon = document.getElementById('act-icon').value;
  const color = document.getElementById('act-color').value;
  const rec = {id:uid(), name, icon, color};
  const {error} = await sb.from('activities').insert(activityToRow(rec));
  if(error){ console.error(error); showToast('保存活动失败：'+error.message); return; }
  activities.push(rec);
  toggleNewActivityForm(false);
  document.getElementById('act-name').value = '';
  selectedActivityId = rec.id;
  renderAll();
  showToast('活动已创建');
}

function renderActivityRow(containerId, includeAll){
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  if(includeAll){
    const allPill = document.createElement('div');
    allPill.className = 'activity-pill' + (selectedActivityId==='all' ? ' selected' : '');
    allPill.innerHTML = `<span class="dot" style="background:var(--espresso-soft)"></span>全部`;
    allPill.onclick = ()=>{ selectedActivityId='all'; selectedPurchaseIds.clear(); renderAll(); };
    el.appendChild(allPill);
  }
  activities.forEach(a=>{
    const pill = document.createElement('div');
    pill.className = 'activity-pill' + (selectedActivityId===a.id ? ' selected' : '');
    pill.innerHTML = `<span class="dot" style="background:${colorMap[a.color]||colorMap.generic}"></span>${a.icon||''} ${a.name}`;
    pill.onclick = ()=>{ selectedActivityId = a.id; selectedPurchaseIds.clear(); renderAll(); };
    el.appendChild(pill);
  });
  if(containerId === 'activity-list-overview'){
    const addPill = document.createElement('div');
    addPill.className = 'activity-pill add';
    addPill.textContent = '+ 新建活动';
    addPill.onclick = ()=>toggleNewActivityForm(true);
    el.appendChild(addPill);
  }
}

function activityName(id){
  const a = activities.find(x=>x.id===id);
  return a ? (a.icon+' '+a.name) : '未知活动';
}
function activityColor(id){
  const a = activities.find(x=>x.id===id);
  return a ? (colorMap[a.color]||colorMap.generic) : colorMap.generic;
}

function filteredOrders(){
  if(selectedActivityId==='all') return orders;
  return orders.filter(o=>o.activityId===selectedActivityId);
}
function filteredPurchases(){
  if(selectedActivityId==='all') return purchases;
  return purchases.filter(p=>p.activityId===selectedActivityId);
}

// ---------- Overview ----------
function renderOverview(){
  renderActivityRow('activity-list-overview', true);
  const ords = filteredOrders();
  const purs = filteredPurchases();
  const revenue = ords.reduce((s,o)=>s+Number(o.totalPrice||0),0);
  const received = ords.reduce((s,o)=>s+Number(o.paidAmount||0),0);
  const cost = purchaseCostTotal(purs, filteredSettlements());
  const costRmb = purs.reduce((s,p)=>s+Number(p.rmbTotal||0),0);
  const profit = revenue - cost;

  const grid = document.getElementById('overview-stats');
  grid.innerHTML = `
    <div class="stat-card"><div class="label">订单总数</div><div class="value">${ords.length}</div></div>
    <div class="stat-card"><div class="label">总营业额</div><div class="value">${fmtMoney(revenue)}</div></div>
    <div class="stat-card"><div class="label">已收款</div><div class="value good">${fmtMoney(received)}</div></div>
    <div class="stat-card"><div class="label">采购总成本（MYR）</div><div class="value">${fmtMoney(cost)}</div></div>
    <div class="stat-card"><div class="label">预估利润</div><div class="value ${profit>=0?'good':'bad'}">${fmtMoney(profit)}</div></div>
    <div class="stat-card"><div class="label">未收款</div><div class="value bad">${fmtMoney(revenue-received)}</div></div>
    ${costRmb>0 ? `<div class="stat-card"><div class="label">人民币采购参考（¥）</div><div class="value">¥ ${costRmb.toFixed(2)}</div></div>` : ''}
  `;

  const upcoming = [...ords].filter(o=>o.deliverDate).sort((a,b)=> new Date(a.deliverDate) - new Date(b.deliverDate)).slice(0,8);
  const upcomingBox = document.getElementById('overview-upcoming');
  if(upcoming.length===0){
    upcomingBox.innerHTML = '<div class="empty">暂无设定交货日期的订单</div>';
  } else {
    upcomingBox.innerHTML = upcoming.map(o=>orderCardHTML(o, false)).join('');
  }

  const recent = [...ords].sort((a,b)=> new Date(b.orderDate) - new Date(a.orderDate)).slice(0,5);
  const box = document.getElementById('overview-recent');
  if(recent.length===0){
    box.innerHTML = '<div class="empty">还没有订单，去"下订单"页面添加第一笔吧</div>';
  } else {
    box.innerHTML = recent.map(o=>orderCardHTML(o, false)).join('');
  }
}

// ---------- Purchase ----------
// ---------- 采购项目（一次采购可以有多样货品，跟下订单的多产品是一样逻辑） ----------
function addPurchaseItemRow(){
  const container = document.getElementById('purchase-items-container');
  const div = document.createElement('div');
  div.className = 'oi-row';
  div.innerHTML = `
    <div class="oi-fields">
      <div class="oi-field" style="flex:2 1 160px;">
        <label>货品名称</label>
        <input type="text" class="pi-name" placeholder="例如：低筋面粉">
      </div>
      <div class="oi-field">
        <label>数量</label>
        <input type="number" class="pi-qty" value="1" min="0" step="0.01">
      </div>
      <div class="oi-field">
        <label>单位</label>
        <input type="text" class="pi-unit" placeholder="kg / 包 / 打">
      </div>
      <div class="oi-field">
        <label>单价（RM）</label>
        <input type="number" class="pi-price" step="0.01">
      </div>
      <div class="oi-field">
        <label>人民币单价（¥，选填）</label>
        <input type="number" class="pi-price-rmb" step="0.01">
      </div>
    </div>
    <div class="oi-footer">
      <span>小计：<b class="pi-subtotal">RM 0.00</b> <span class="pi-subtotal-rmb"></span></span>
      <button type="button" class="btn danger small pi-remove">移除此项</button>
    </div>
  `;
  container.appendChild(div);

  const qtyInput = div.querySelector('.pi-qty');
  const priceInput = div.querySelector('.pi-price');
  const priceRmbInput = div.querySelector('.pi-price-rmb');
  const subtotalEl = div.querySelector('.pi-subtotal');
  const subtotalRmbEl = div.querySelector('.pi-subtotal-rmb');
  const removeBtn = div.querySelector('.pi-remove');

  function updateSubtotal(){
    const q = Number(qtyInput.value)||0;
    const pr = Number(priceInput.value)||0;
    const prRmb = Number(priceRmbInput.value)||0;
    subtotalEl.textContent = fmtMoney(q*pr);
    subtotalRmbEl.textContent = prRmb>0 ? ('· '+fmtRmb(q*prRmb)) : '';
    updatePurchaseItemsTotal();
  }
  [qtyInput, priceInput, priceRmbInput].forEach(inp=>inp.addEventListener('input', updateSubtotal));
  removeBtn.addEventListener('click', ()=>{
    if(container.querySelectorAll('.oi-row').length<=1){ showToast('至少要保留一样货品'); return; }
    div.remove();
    updatePurchaseItemsTotal();
  });
}

function updatePurchaseItemsTotal(){
  const rows = document.querySelectorAll('#purchase-items-container .oi-row');
  let total = 0, totalRmb = 0;
  rows.forEach(row=>{
    const q = Number(row.querySelector('.pi-qty').value)||0;
    const pr = Number(row.querySelector('.pi-price').value)||0;
    const prRmb = Number(row.querySelector('.pi-price-rmb').value)||0;
    total += q*pr;
    totalRmb += q*prRmb;
  });
  document.getElementById('purchase-items-total').textContent = fmtMoney(total);
  document.getElementById('purchase-items-total-rmb').textContent = totalRmb>0 ? ('· '+fmtRmb(totalRmb)) : '';
}

function resetPurchaseItemRows(){
  document.getElementById('purchase-items-container').innerHTML = '';
  addPurchaseItemRow();
  updatePurchaseItemsTotal();
}

function collectPurchaseItems(){
  const rows = document.querySelectorAll('#purchase-items-container .oi-row');
  const items = [];
  rows.forEach(row=>{
    const name = row.querySelector('.pi-name').value.trim();
    if(!name) return;
    const qty = Number(row.querySelector('.pi-qty').value)||0;
    const unit = row.querySelector('.pi-unit').value.trim();
    const unitPrice = Number(row.querySelector('.pi-price').value)||0;
    const rmbUnitPrice = Number(row.querySelector('.pi-price-rmb').value)||0;
    items.push({
      name, qty, unit, unitPrice,
      lineTotal: qty*unitPrice,
      rmbUnitPrice,
      rmbLineTotal: qty*rmbUnitPrice
    });
  });
  return items;
}

function toggleRepaidField(){
  const isAdvance = document.getElementById('p-is-advance').checked;
  document.getElementById('p-repaid-wrapper').style.display = isAdvance ? 'block' : 'none';
}

function resetPurchaseFormUI(){
  document.getElementById('purchase-save-btn').textContent = '保存采购记录';
  document.getElementById('purchase-cancel-edit-btn').style.display = 'none';
}

function resetPurchaseFormFields(){
  ['p-supplier','p-note','p-shop-name','p-product-link'].forEach(id=>document.getElementById(id).value='');
  setOtherAwareValue('p-buyer-select','p-buyer-other','');
  document.getElementById('p-product-photo-file').value = '';
  document.getElementById('p-product-pdf-file').value = '';
  document.getElementById('p-is-advance').checked = false;
  document.getElementById('p-repaid').checked = false;
  toggleRepaidField();
  resetPurchaseItemRows();
}

async function addPurchase(){
  if(!sb){ showToast('请先设置 Supabase 连接信息'); return; }
  if(selectedActivityId==='all'){ showToast('请先在上方选择一个具体活动'); return; }
  const items = collectPurchaseItems();
  if(items.length===0){ showToast('请至少填写一样货品名称'); return; }
  const photoFileInput = document.getElementById('p-product-photo-file');
  const pdfFileInput = document.getElementById('p-product-pdf-file');
  const photoData = (photoFileInput.files && photoFileInput.files[0]) ? await readFileAsDataURL(photoFileInput.files[0]) : undefined;
  const pdfData = (pdfFileInput.files && pdfFileInput.files[0]) ? await readFileAsDataURL(pdfFileInput.files[0]) : undefined;
  const isAdvance = document.getElementById('p-is-advance').checked;
  const existing = editingPurchaseId ? purchases.find(x=>x.id===editingPurchaseId) : null;
  const commonFields = {
    activityId: selectedActivityId,
    date: document.getElementById('p-date').value || new Date().toISOString().slice(0,10),
    supplier: document.getElementById('p-supplier').value.trim(),
    items,
    totalCost: items.reduce((s,it)=>s+it.lineTotal,0),
    rmbTotal: items.reduce((s,it)=>s+it.rmbLineTotal,0),
    note: document.getElementById('p-note').value.trim(),
    buyer: getOtherAwareValue('p-buyer-select','p-buyer-other'),
    isAdvance,
    repaid: isAdvance ? document.getElementById('p-repaid').checked : false,
    shopName: document.getElementById('p-shop-name').value.trim(),
    productLink: document.getElementById('p-product-link').value.trim(),
    productPhoto: photoData !== undefined ? photoData : (existing ? existing.productPhoto : ''),
    productPdf: pdfData !== undefined ? pdfData : (existing ? existing.productPdf : '')
  };

  if(editingPurchaseId){
    const idx = purchases.findIndex(x=>x.id===editingPurchaseId);
    const updated = { ...(idx>-1 ? purchases[idx] : {id:editingPurchaseId}), ...commonFields };
    const {error} = await sb.from('purchases').update(purchaseToRow(updated)).eq('id', editingPurchaseId);
    if(error){ console.error(error); showToast('更新采购记录失败：'+error.message); return; }
    if(idx>-1) purchases[idx] = updated;
    editingPurchaseId = null;
    resetPurchaseFormUI();
    resetPurchaseFormFields();
    renderAll();
    showToast('采购记录已更新');
    return;
  }

  const rec = { id: uid(), ...commonFields };
  const {error} = await sb.from('purchases').insert(purchaseToRow(rec));
  if(error){ console.error(error); showToast('保存采购记录失败：'+error.message); return; }
  purchases.push(rec);
  resetPurchaseFormFields();
  renderAll();
  showToast('采购记录已保存');
}

function editPurchase(id){
  const p = purchases.find(x=>x.id===id);
  if(!p){ showToast('找不到这条采购记录'); return; }
  editingPurchaseId = id;
  selectedActivityId = p.activityId;
  switchTab('purchase');
  renderActivityRow('activity-list-purchase', false);

  document.getElementById('p-date').value = p.date || '';
  document.getElementById('p-supplier').value = p.supplier || '';
  setOtherAwareValue('p-buyer-select','p-buyer-other', p.buyer || '');
  document.getElementById('p-is-advance').checked = !!p.isAdvance;
  document.getElementById('p-repaid').checked = !!p.repaid;
  toggleRepaidField();
  document.getElementById('p-shop-name').value = p.shopName || '';
  document.getElementById('p-product-link').value = p.productLink || '';
  document.getElementById('p-note').value = p.note || '';

  const container = document.getElementById('purchase-items-container');
  container.innerHTML = '';
  const items = (p.items && p.items.length) ? p.items : [{}];
  items.forEach(it=>{
    addPurchaseItemRow();
    const row = container.lastElementChild;
    row.querySelector('.pi-name').value = it.name || '';
    row.querySelector('.pi-qty').value = it.qty || '';
    row.querySelector('.pi-unit').value = it.unit || '';
    row.querySelector('.pi-price').value = it.unitPrice || '';
    row.querySelector('.pi-price-rmb').value = it.rmbUnitPrice || '';
    row.querySelector('.pi-qty').dispatchEvent(new Event('input'));
  });
  updatePurchaseItemsTotal();

  document.getElementById('purchase-save-btn').textContent = '更新采购记录';
  document.getElementById('purchase-cancel-edit-btn').style.display = 'inline-flex';
  showToast('已载入采购记录，改好后点"更新采购记录"保存（图片/PDF 没重新选就会保留原本的）');
}

function cancelEditPurchase(){
  editingPurchaseId = null;
  resetPurchaseFormUI();
  resetPurchaseFormFields();
  showToast('已取消编辑');
}

async function deletePurchase(id){
  if(!sb){ showToast('请先设置 Supabase 连接信息'); return; }
  const {error} = await sb.from('purchases').delete().eq('id', id);
  if(error){ console.error(error); showToast('删除失败：'+error.message); return; }
  purchases = purchases.filter(p=>p.id!==id);
  selectedPurchaseIds.delete(id);
  if(editingPurchaseId===id){ editingPurchaseId = null; resetPurchaseFormUI(); resetPurchaseFormFields(); }
  renderAll();
}

async function toggleRepaid(id){
  if(!sb){ showToast('请先设置 Supabase 连接信息'); return; }
  const p = purchases.find(x=>x.id===id);
  if(!p) return;
  const repaid = !p.repaid;
  const {error} = await sb.from('purchases').update({repaid}).eq('id', id);
  if(error){ console.error(error); showToast('更新失败：'+error.message); return; }
  p.repaid = repaid;
  renderAll();
  showToast(repaid ? '已标记为还款' : '已标记为待还款');
}

// ---------- 还款批次（把几笔分开记录的采购，合并成一笔要还给代付人的金额） ----------
function togglePurchaseSelect(id){
  if(selectedPurchaseIds.has(id)) selectedPurchaseIds.delete(id);
  else selectedPurchaseIds.add(id);
  renderPurchaseList();
}

function clearPurchaseSelection(){
  selectedPurchaseIds.clear();
  renderPurchaseList();
}

function filteredSettlements(){
  if(selectedActivityId==='all') return settlements;
  return settlements.filter(s=>s.activityId===selectedActivityId);
}

// 已经并入合并结算记录的采购 id：算成本时用结算的真实总额代替，不重复计算单笔金额
function settledPurchaseIds(){
  const set = new Set();
  settlements.forEach(s=>(s.purchaseIds||[]).forEach(id=>set.add(id)));
  return set;
}

function purchaseCostTotal(purs, sttls){
  const settled = settledPurchaseIds();
  const lineTotal = purs.filter(p=>!settled.has(p.id)).reduce((s,p)=>s+Number(p.totalCost||0),0);
  const settlementTotal = sttls.reduce((s,st)=>s+Number(st.myrAmount||0),0);
  return lineTotal + settlementTotal;
}

function toggleSettleRepaidField(){
  const needsRepay = document.getElementById('settle-needs-repay').checked;
  document.getElementById('settle-repaid-wrapper').style.display = needsRepay ? 'block' : 'none';
  document.getElementById('settle-repaid-check-wrapper').style.display = needsRepay ? 'block' : 'none';
}

function renderSettlementBuilder(){
  const box = document.getElementById('settlement-builder');
  if(!box) return;
  if(selectedPurchaseIds.size===0){ box.innerHTML = ''; return; }
  const selected = purchases.filter(p=>selectedPurchaseIds.has(p.id));
  const rmbTotal = selected.reduce((s,p)=>s+Number(p.rmbTotal||0),0);
  const myrLineSum = selected.reduce((s,p)=>s+Number(p.totalCost||0),0);
  const buyers = [...new Set(selected.map(p=>p.buyer).filter(Boolean))];
  box.innerHTML = `
    <div class="card">
      <div class="section-title" style="margin-top:0;">已勾选 ${selected.length} 项 <small>合并记录这几笔单真实的总金额（运费/手续费等常常让单笔总和对不上）</small></div>
      <div class="form-grid">
        <div>
          <label>人民币合计（¥，参考用，自动加总）</label>
          <input type="number" step="0.01" id="settle-rmb" value="${rmbTotal.toFixed(2)}">
        </div>
        <div>
          <label>实际总额（MYR）<small style="font-weight:400;">单笔加起来是 ${fmtMoney(myrLineSum)}</small></label>
          <input type="number" step="0.01" id="settle-myr" placeholder="例如：486.09">
        </div>
        <div class="full" style="display:flex;align-items:center;gap:8px;">
          <label style="margin:0;display:flex;align-items:center;gap:6px;font-size:13px;color:var(--espresso);font-weight:normal;">
            <input type="checkbox" id="settle-needs-repay" style="width:auto;" onchange="toggleSettleRepaidField()">
            这是别人代付的（需要还款）
          </label>
        </div>
        <div id="settle-repaid-wrapper" style="display:none;">
          <label>还给谁（代付人）</label>
          <input type="text" id="settle-buyer" value="${buyers.length===1 ? buyers[0] : ''}" placeholder="例如：老公 / 女儿">
        </div>
        <div id="settle-repaid-check-wrapper" style="display:none;">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--espresso);font-weight:normal;">
            <input type="checkbox" id="settle-repaid" style="width:auto;">
            已还款
          </label>
        </div>
        <div class="full">
          <label>备注（选填）</label>
          <input type="text" id="settle-note" placeholder="选填">
        </div>
      </div>
      <div class="btn-row">
        <button class="btn" onclick="addSettlement()">生成合并结算记录</button>
        <button class="btn ghost" onclick="clearPurchaseSelection()">取消勾选</button>
      </div>
    </div>
  `;
}

async function addSettlement(){
  if(!sb){ showToast('请先设置 Supabase 连接信息'); return; }
  if(selectedPurchaseIds.size===0){ showToast('请先勾选要合并的采购记录'); return; }
  const myrAmount = Number(document.getElementById('settle-myr').value)||0;
  if(myrAmount<=0){ showToast('请填写实际总额（MYR）'); return; }
  const needsRepay = document.getElementById('settle-needs-repay').checked;
  const rec = {
    id: uid(),
    activityId: selectedActivityId,
    buyer: needsRepay ? document.getElementById('settle-buyer').value.trim() : '',
    purchaseIds: [...selectedPurchaseIds],
    rmbTotal: Number(document.getElementById('settle-rmb').value)||0,
    myrAmount,
    needsRepay,
    repaid: needsRepay ? document.getElementById('settle-repaid').checked : false,
    note: document.getElementById('settle-note').value.trim()
  };
  const {error} = await sb.from('purchase_settlements').insert(settlementToRow(rec));
  if(error){ console.error(error); showToast('保存合并结算记录失败：'+error.message); return; }
  settlements.push(rec);
  selectedPurchaseIds.clear();
  renderAll();
  showToast('合并结算记录已保存');
}

async function deleteSettlement(id){
  if(!sb){ showToast('请先设置 Supabase 连接信息'); return; }
  const {error} = await sb.from('purchase_settlements').delete().eq('id', id);
  if(error){ console.error(error); showToast('删除失败：'+error.message); return; }
  settlements = settlements.filter(s=>s.id!==id);
  renderAll();
}

async function toggleSettlementRepaid(id){
  if(!sb){ showToast('请先设置 Supabase 连接信息'); return; }
  const s = settlements.find(x=>x.id===id);
  if(!s) return;
  const repaid = !s.repaid;
  const {error} = await sb.from('purchase_settlements').update({repaid}).eq('id', id);
  if(error){ console.error(error); showToast('更新失败：'+error.message); return; }
  s.repaid = repaid;
  renderAll();
  showToast(repaid ? '已标记为还款' : '已标记为待还款');
}

function renderSettlementList(){
  const box = document.getElementById('settlement-list');
  if(!box) return;
  if(selectedActivityId==='all'){ box.innerHTML = ''; return; }
  const items = filteredSettlements();
  if(items.length===0){ box.innerHTML = ''; return; }
  box.innerHTML = `<div class="section-title">合并结算记录 <small>多笔采购合并后的真实总额</small></div>` + items.map(s=>{
    const names = s.purchaseIds.map(id=>{
      const p = purchases.find(x=>x.id===id);
      return p ? purchaseSummaryTitle(p) : null;
    }).filter(Boolean);
    return `
    <div class="item-card">
      <div class="item-top">
        <div>
          <div class="item-title">${s.needsRepay && s.buyer ? '还给 '+s.buyer : '合并结算'}</div>
          <div class="item-sub">${names.join('、')}</div>
        </div>
        ${s.needsRepay ? `<span class="badge ${s.repaid?'paid':'unpaid'}">${s.repaid?'已还款':'待还款'}</span>` : ''}
      </div>
      <div class="item-meta">
        <span>人民币合计：<b>¥ ${s.rmbTotal.toFixed(2)}</b></span>
        <span>实际总额：<b>${fmtMoney(s.myrAmount)}</b></span>
        ${s.note ? `<span>备注：${s.note}</span>` : ''}
      </div>
      <div class="item-actions">
        ${s.needsRepay ? `<button class="btn small ghost" onclick="toggleSettlementRepaid('${s.id}')">${s.repaid?'标记为待还款':'标记为已还款'}</button>` : ''}
        <button class="btn danger small" onclick="deleteSettlement('${s.id}')">删除</button>
      </div>
    </div>
  `;
  }).join('');
}

function renderPurchaseList(){
  renderActivityRow('activity-list-purchase', false);
  const list = document.getElementById('purchase-list');
  const items = filteredPurchases().sort((a,b)=> new Date(b.date)-new Date(a.date));
  if(selectedActivityId==='all'){
    list.innerHTML = '<div class="empty">请选择一个活动来查看和添加采购记录</div>';
    renderSettlementBuilder();
    renderSettlementList();
    return;
  }
  if(items.length===0){
    list.innerHTML = '<div class="empty">这个活动还没有采购记录</div>';
    renderSettlementBuilder();
    renderSettlementList();
    return;
  }
  const settled = settledPurchaseIds();
  list.innerHTML = items.map(p=>`
    <div class="item-card">
      <div class="item-top">
        <div style="display:flex;gap:8px;align-items:flex-start;">
          <input type="checkbox" style="width:auto;margin-top:4px;" ${selectedPurchaseIds.has(p.id)?'checked':''} onchange="togglePurchaseSelect('${p.id}')" title="勾选后可合并记录这几笔单真实的总金额">
          <div>
            <div class="item-title">${purchaseSummaryTitle(p)}</div>
            <div class="item-sub">${p.date}${p.supplier ? ' · '+p.supplier : ''}${p.buyer ? ' · 采购人：'+p.buyer : ''}</div>
          </div>
        </div>
        <div class="item-title">${fmtMoney(p.totalCost)}</div>
      </div>
      <div class="oi-lines">
        ${(p.items||[]).map(it=>`
          <div class="oi-line">
            <span>${it.name} <span class="n">× ${it.qty}${it.unit ? ' '+it.unit : ''}</span></span>
            <span>${fmtMoney(it.lineTotal)}${it.rmbLineTotal ? ' · '+fmtRmb(it.rmbLineTotal) : ''}</span>
          </div>
        `).join('')}
      </div>
      <div class="item-meta">
        ${p.rmbTotal ? `<span>人民币合计：<b>${fmtRmb(p.rmbTotal)}</b></span>` : ''}
        ${settled.has(p.id) ? `<span>📎 已并入合并结算记录（成本按结算的真实总额算，不会重复计算这里的金额）</span>` : ''}
        ${p.isAdvance ? `<span class="badge ${p.repaid?'paid':'unpaid'}">${p.repaid?'已还款':'待还款'}</span>` : ''}
        ${p.shopName ? `<span>商家：${p.shopName}</span>` : ''}
        ${p.productLink ? `<span><a href="${p.productLink}" target="_blank" rel="noopener">商品链接 ↗</a></span>` : ''}
        ${p.productPdf ? `<span><a href="${p.productPdf}" target="_blank" rel="noopener">📄 查看PDF</a></span>` : ''}
        ${p.note ? `<span>备注：${p.note}</span>` : ''}
      </div>
      ${p.productPhoto ? `<img src="${p.productPhoto}" style="max-width:100px;max-height:100px;border-radius:8px;border:1px solid var(--border);margin-top:8px;display:block;">` : ''}
      <div class="item-actions">
        <button class="btn small ghost" onclick="editPurchase('${p.id}')">✏️ 编辑</button>
        ${p.isAdvance ? `<button class="btn small ghost" onclick="toggleRepaid('${p.id}')">${p.repaid?'标记为待还款':'标记为已还款'}</button>` : ''}
        <button class="btn danger small" onclick="deletePurchase('${p.id}')">删除</button>
      </div>
    </div>
  `).join('');
  renderSettlementBuilder();
  renderSettlementList();
}

// ---------- Products ----------
async function addProduct(){
  if(!sb){ showToast('请先设置 Supabase 连接信息'); return; }
  const name = document.getElementById('prod-name').value.trim();
  if(!name){ showToast('请输入货品名称'); return; }
  if(selectedActivityId==='all'){ showToast('请先在上方选择一个具体活动'); return; }
  const flavorsRaw = document.getElementById('prod-flavors').value.trim();
  const flavorOptions = flavorsRaw ? flavorsRaw.split(/[,，]/).map(s=>s.trim()).filter(Boolean) : [];
  const commonFields = {
    activityId: selectedActivityId,
    name,
    price: Number(document.getElementById('prod-price').value)||0,
    piecesPerUnit: Number(document.getElementById('prod-pieces').value)||1,
    flavorOptions,
    note: document.getElementById('prod-note').value.trim()
  };

  if(editingProductId){
    const idx = products.findIndex(x=>x.id===editingProductId);
    const updated = { ...(idx>-1 ? products[idx] : {id:editingProductId}), ...commonFields };
    const {error} = await sb.from('products').update(productToRow(updated)).eq('id', editingProductId);
    if(error){ console.error(error); showToast('更新货品失败：'+error.message); return; }
    if(idx>-1) products[idx] = updated;
    editingProductId = null;
    resetProductFormUI();
    ['prod-name','prod-price','prod-note','prod-pieces','prod-flavors'].forEach(id=>document.getElementById(id).value='');
    renderAll();
    showToast('货品已更新');
    return;
  }

  const rec = { id: uid(), ...commonFields };
  const {error} = await sb.from('products').insert(productToRow(rec));
  if(error){ console.error(error); showToast('保存货品失败：'+error.message); return; }
  products.push(rec);
  ['prod-name','prod-price','prod-note','prod-pieces','prod-flavors'].forEach(id=>document.getElementById(id).value='');
  renderAll();
  showToast('货品已保存');
}

function resetProductFormUI(){
  document.getElementById('product-save-btn').textContent = '保存货品';
  document.getElementById('product-cancel-edit-btn').style.display = 'none';
}

function editProduct(id){
  const p = products.find(x=>x.id===id);
  if(!p){ showToast('找不到这个货品'); return; }
  editingProductId = id;
  selectedActivityId = p.activityId;
  switchTab('products');
  renderActivityRow('activity-list-products', false);

  document.getElementById('prod-name').value = p.name || '';
  document.getElementById('prod-price').value = p.price || '';
  document.getElementById('prod-pieces').value = p.piecesPerUnit || '';
  document.getElementById('prod-flavors').value = (p.flavorOptions||[]).join(',');
  document.getElementById('prod-note').value = p.note || '';

  document.getElementById('product-save-btn').textContent = '更新货品';
  document.getElementById('product-cancel-edit-btn').style.display = 'inline-flex';
  showToast('已载入货品，改好后点"更新货品"保存');
}

function cancelEditProduct(){
  editingProductId = null;
  resetProductFormUI();
  ['prod-name','prod-price','prod-note','prod-pieces','prod-flavors'].forEach(id=>document.getElementById(id).value='');
  showToast('已取消编辑');
}

async function deleteProduct(id){
  if(!sb){ showToast('请先设置 Supabase 连接信息'); return; }
  const {error} = await sb.from('products').delete().eq('id', id);
  if(error){ console.error(error); showToast('删除失败：'+error.message); return; }
  products = products.filter(p=>p.id!==id);
  renderAll();
}

function renderProductList(){
  renderActivityRow('activity-list-products', false);
  const list = document.getElementById('product-list');
  if(selectedActivityId==='all'){
    list.innerHTML = '<div class="empty">请选择一个活动来查看和添加货品</div>';
    return;
  }
  const items = products.filter(p=>p.activityId===selectedActivityId);
  if(items.length===0){
    list.innerHTML = '<div class="empty">这个活动还没有货品，添加后下订单时就能直接选</div>';
    return;
  }
  list.innerHTML = items.map(p=>`
    <div class="item-card">
      <div class="item-top">
        <div>
          <div class="item-title">${p.name}</div>
          ${p.note ? `<div class="item-sub">${p.note}</div>` : ''}
          ${p.flavorOptions && p.flavorOptions.length>0 ? `<div class="item-sub">口味：${p.flavorOptions.join('、')}（每份 ${p.piecesPerUnit||1} 件）</div>` : ''}
        </div>
        <div class="item-title">${fmtMoney(p.price)}</div>
      </div>
      <div class="item-actions">
        <button class="btn small ghost" onclick="editProduct('${p.id}')">✏️ 编辑</button>
        <button class="btn danger small" onclick="deleteProduct('${p.id}')">删除</button>
      </div>
    </div>
  `).join('');
}

function buildProductOptionsHTML(){
  const items = products.filter(p=>p.activityId===selectedActivityId);
  return '<option value="">选择产品</option>'
    + items.map(p=>`<option value="${escapeHTML(p.name)}">${escapeHTML(p.name)}</option>`).join('')
    + '<option value="OTHER">OTHER（自己输入）</option>';
}

function getRowProductValue(row){
  const select = row.querySelector('.oi-product-select');
  if(select.value==='OTHER') return row.querySelector('.oi-product-other').value.trim();
  return select.value;
}

function setRowProductValue(row, productName){
  const select = row.querySelector('.oi-product-select');
  const otherInput = row.querySelector('.oi-product-other');
  const known = Array.from(select.options).map(o=>o.value).filter(v=>v && v!=='OTHER');
  if(productName && known.includes(productName)){
    select.value = productName;
    otherInput.style.display = 'none';
    otherInput.value = '';
  } else {
    select.value = 'OTHER';
    otherInput.style.display = productName ? 'block' : 'none';
    otherInput.value = productName || '';
  }
}

// 货品清单改了之后，把已经加进订单表单里的每一行产品选单同步更新（保留原本选的值）
function refreshOrderItemProductOptions(){
  document.querySelectorAll('#order-items-container .oi-row').forEach(row=>{
    const currentValue = getRowProductValue(row);
    row.querySelector('.oi-product-select').innerHTML = buildProductOptionsHTML();
    setRowProductValue(row, currentValue);
  });
}

// ---------- Order item rows (一个订单可有多个产品) ----------
let orderItemRowCounter = 0;

function addOrderItemRow(){
  orderItemRowCounter++;
  const container = document.getElementById('order-items-container');
  const div = document.createElement('div');
  div.className = 'oi-row';
  div.innerHTML = `
    <div class="oi-fields">
      <div class="oi-field" style="flex:2 1 140px;">
        <label>产品</label>
        <select class="oi-product-select">${buildProductOptionsHTML()}</select>
        <input type="text" class="oi-product-other" style="display:none;margin-top:8px;" placeholder="输入产品名称">
      </div>
      <div class="oi-field" style="flex:2 1 180px;">
        <label>口味/规格</label>
        <div class="oi-flavor-container">
          <input type="text" class="oi-flavor" placeholder="选填">
        </div>
      </div>
      <div class="oi-field">
        <label>数量</label>
        <input type="number" class="oi-qty" value="1" min="1">
      </div>
      <div class="oi-field">
        <label>单价（RM）</label>
        <input type="number" class="oi-price" step="0.01">
      </div>
    </div>
    <div class="oi-footer">
      <span>小计：<b class="oi-subtotal">RM 0.00</b></span>
      <button type="button" class="btn danger small oi-remove">移除此项</button>
    </div>
  `;
  container.appendChild(div);

  const productSelect = div.querySelector('.oi-product-select');
  const productOther = div.querySelector('.oi-product-other');
  const qtyInput = div.querySelector('.oi-qty');
  const priceInput = div.querySelector('.oi-price');
  const subtotalEl = div.querySelector('.oi-subtotal');
  const removeBtn = div.querySelector('.oi-remove');
  const flavorContainer = div.querySelector('.oi-flavor-container');

  function updateSubtotal(){
    const q = Number(qtyInput.value)||0;
    const pr = Number(priceInput.value)||0;
    subtotalEl.textContent = fmtMoney(q*pr);
  }
  function handleProductChange(){
    const value = getRowProductValue(div);
    const match = products.find(p=>p.activityId===selectedActivityId && p.name.trim().toLowerCase()===value.trim().toLowerCase());
    if(match){
      div.dataset.catalogPrice = match.price;
      if(!priceInput.value){ priceInput.value = match.price.toFixed(2); }
      if(match.flavorOptions && match.flavorOptions.length>0){
        div.dataset.piecesPerUnit = match.piecesPerUnit || 1;
        renderFlavorBreakdownUI(flavorContainer, match.flavorOptions, qtyInput, div);
      } else {
        delete div.dataset.piecesPerUnit;
        resetFlavorSimpleInput(flavorContainer);
      }
    } else {
      delete div.dataset.catalogPrice;
      delete div.dataset.piecesPerUnit;
      resetFlavorSimpleInput(flavorContainer);
    }
    updateSubtotal();
  }
  productSelect.addEventListener('change', ()=>{
    productOther.style.display = productSelect.value==='OTHER' ? 'block' : 'none';
    if(productSelect.value!=='OTHER') productOther.value = '';
    handleProductChange();
  });
  productOther.addEventListener('input', handleProductChange);
  qtyInput.addEventListener('input', ()=>{
    updateSubtotal();
    if(div._refreshFlavorTarget) div._refreshFlavorTarget();
  });
  priceInput.addEventListener('input', updateSubtotal);
  removeBtn.addEventListener('click', ()=>{
    if(container.querySelectorAll('.oi-row').length<=1){ showToast('订单至少要保留一个产品'); return; }
    div.remove();
  });
}

function buildFlavorBreakdownHTML(flavorOptions){
  return `
    <div class="flavor-breakdown">
      <label class="fb-mix-toggle">
        <input type="checkbox" class="fb-mix-checkbox">
        🎲 Mix（随意搭配口味，不用指定数量）
      </label>
      <div class="fb-detail">
        ${flavorOptions.map(f=>`
          <div class="fb-row">
            <span class="fb-name">${escapeHTML(f)}</span>
            <input type="number" class="fb-qty" data-flavor="${escapeHTML(f)}" min="0" value="0">
          </div>
        `).join('')}
        <div class="fb-total">已分配 <b class="fb-sum">0</b> / 需要 <b class="fb-target">0</b></div>
      </div>
    </div>
  `;
}

function renderFlavorBreakdownUI(container, flavorOptions, qtyInput, row){
  container.innerHTML = buildFlavorBreakdownHTML(flavorOptions);
  const fbQtyInputs = container.querySelectorAll('.fb-qty');
  const sumEl = container.querySelector('.fb-sum');
  const targetEl = container.querySelector('.fb-target');
  const mixCheckbox = container.querySelector('.fb-mix-checkbox');
  const detailBox = container.querySelector('.fb-detail');

  function refreshTarget(){
    const pieces = Number(row.dataset.piecesPerUnit)||1;
    const qty = Number(qtyInput.value)||0;
    targetEl.textContent = pieces*qty;
    refreshSum();
  }
  function refreshSum(){
    let sum = 0;
    fbQtyInputs.forEach(inp=>sum += Number(inp.value)||0);
    sumEl.textContent = sum;
    const target = Number(targetEl.textContent)||0;
    sumEl.style.color = (sum===target && target>0) ? 'var(--good)' : 'var(--bad)';
  }
  mixCheckbox.addEventListener('change', ()=>{
    detailBox.style.display = mixCheckbox.checked ? 'none' : 'block';
  });
  fbQtyInputs.forEach(inp=>inp.addEventListener('input', refreshSum));
  refreshTarget();
  row._refreshFlavorTarget = refreshTarget;
}

function resetFlavorSimpleInput(container){
  container.innerHTML = `<input type="text" class="oi-flavor" placeholder="选填">`;
}

function resetOrderItemRows(){
  document.getElementById('order-items-container').innerHTML = '';
  addOrderItemRow();
}

function toggleAddressField(){
  const method = document.getElementById('o-delivery-method').value;
  document.getElementById('o-address-wrapper').style.display = method==='delivery' ? 'block' : 'none';
}

function getOrderItems(o){
  if(Array.isArray(o.items) && o.items.length>0) return o.items;
  if(o.product){
    return [{product:o.product, flavor:o.flavor, qty:o.qty, unitPrice:o.unitPrice, lineTotal:o.totalPrice}];
  }
  return [];
}

// ---------- Order ----------
async function addOrder(){
  if(!sb){ showToast('请先设置 Supabase 连接信息'); return; }
  const name = document.getElementById('o-name').value.trim();
  if(!name){ showToast('请填写客户姓名'); return; }
  if(selectedActivityId==='all'){ showToast('请先在上方选择一个具体活动'); return; }

  const rows = document.querySelectorAll('#order-items-container .oi-row');
  const items = [];
  rows.forEach(row=>{
    const product = getRowProductValue(row);
    const qty = Number(row.querySelector('.oi-qty').value)||0;
    const unitPrice = Number(row.querySelector('.oi-price').value)||0;
    const catalogPrice = row.dataset.catalogPrice ? Number(row.dataset.catalogPrice) : null;
    const mixCheckbox = row.querySelector('.fb-mix-checkbox');
    const fbInputs = row.querySelectorAll('.fb-qty');
    let flavor = '';
    let flavorBreakdown = null;
    if(mixCheckbox && mixCheckbox.checked){
      flavor = 'Mix（随意搭配）';
    } else if(fbInputs.length>0){
      const parts = [];
      fbInputs.forEach(inp=>{
        const n = Number(inp.value)||0;
        if(n>0) parts.push({flavor: inp.dataset.flavor, qty:n});
      });
      if(parts.length>0){
        flavorBreakdown = parts;
        flavor = parts.map(p=>`${p.flavor}×${p.qty}`).join('、');
      }
    } else {
      flavor = row.querySelector('.oi-flavor').value.trim();
    }
    if(product && qty>0){
      const item = {product, flavor, qty, unitPrice, lineTotal: qty*unitPrice};
      if(flavorBreakdown) item.flavorBreakdown = flavorBreakdown;
      if(catalogPrice && catalogPrice > unitPrice){
        item.originalPrice = catalogPrice;
      }
      items.push(item);
    }
  });
  if(items.length===0){ showToast('请至少填写一个产品（含数量）'); return; }
  const totalPrice = items.reduce((s,it)=>s+it.lineTotal, 0);
  const deliveryMethod = document.getElementById('o-delivery-method').value;
  const address = deliveryMethod==='delivery' ? document.getElementById('o-address').value.trim() : '';

  const commonFields = {
    activityId: selectedActivityId,
    customerName: name,
    contactPerson: getOtherAwareValue('o-contact-select','o-contact-other'),
    phone: document.getElementById('o-phone').value.trim(),
    items,
    totalPrice,
    orderDate: document.getElementById('o-orderdate').value || new Date().toISOString().slice(0,10),
    deliverDate: document.getElementById('o-deliverdate').value,
    deliverTime: document.getElementById('o-delivertime').value,
    deliveryMethod,
    address,
    note: document.getElementById('o-note').value.trim()
  };

  if(editingOrderId){
    const idx = orders.findIndex(x=>x.id===editingOrderId);
    if(idx===-1){ showToast('找不到这张订单'); return; }
    const updated = { ...orders[idx], ...commonFields };
    const {error} = await sb.from('orders').update(orderToRow(updated)).eq('id', editingOrderId);
    if(error){ console.error(error); showToast('更新订单失败：'+error.message); return; }
    orders[idx] = updated;
    editingOrderId = null;
    resetOrderFormUI();
    ['o-name','o-phone','o-note','o-address','o-delivertime'].forEach(id=>document.getElementById(id).value='');
    setOtherAwareValue('o-contact-select','o-contact-other','');
    document.getElementById('o-delivery-method').value = 'pickup';
    toggleAddressField();
    resetOrderItemRows();
    renderAll();
    showToast('订单已更新');
    return;
  }

  const rec = {
    id: uid(),
    ...commonFields,
    paymentStatus: 'unpaid',
    paidAmount: 0
  };
  const {data: inserted, error} = await sb.from('orders').insert(orderToRow(rec)).select().single();
  if(error){ console.error(error); showToast('保存订单失败：'+error.message); return; }
  orders.push(rowToOrder(inserted));
  ['o-name','o-phone','o-note','o-address','o-delivertime'].forEach(id=>document.getElementById(id).value='');
  setOtherAwareValue('o-contact-select','o-contact-other','');
  document.getElementById('o-delivery-method').value = 'pickup';
  toggleAddressField();
  resetOrderItemRows();
  renderAll();
  showToast('订单已保存');
}

function resetOrderFormUI(){
  document.getElementById('order-save-btn').textContent = '保存订单';
  document.getElementById('order-cancel-edit-btn').style.display = 'none';
}

function editOrder(id){
  const o = orders.find(x=>x.id===id);
  if(!o){ showToast('找不到这张订单'); return; }
  editingOrderId = id;
  selectedActivityId = o.activityId;
  switchTab('order');
  renderActivityRow('activity-list-order', false);

  document.getElementById('o-name').value = o.customerName || '';
  setOtherAwareValue('o-contact-select','o-contact-other', o.contactPerson || '');
  document.getElementById('o-phone').value = o.phone || '';
  document.getElementById('o-orderdate').value = o.orderDate || '';
  document.getElementById('o-deliverdate').value = o.deliverDate || '';
  document.getElementById('o-delivertime').value = o.deliverTime || '';
  document.getElementById('o-delivery-method').value = o.deliveryMethod || 'pickup';
  toggleAddressField();
  document.getElementById('o-address').value = o.address || '';
  document.getElementById('o-note').value = o.note || '';

  const container = document.getElementById('order-items-container');
  container.innerHTML = '';
  const items = getOrderItems(o);
  items.forEach(it=>{
    addOrderItemRow();
    const row = container.lastElementChild;
    const qtyInput = row.querySelector('.oi-qty');
    const priceInput = row.querySelector('.oi-price');

    setRowProductValue(row, it.product);
    row.querySelector('.oi-product-select').dispatchEvent(new Event('change'));

    qtyInput.value = it.qty;
    qtyInput.dispatchEvent(new Event('input'));

    priceInput.value = it.unitPrice;
    priceInput.dispatchEvent(new Event('input'));

    if(it.flavorBreakdown && it.flavorBreakdown.length>0){
      it.flavorBreakdown.forEach(fb=>{
        const inp = Array.from(row.querySelectorAll('.fb-qty')).find(el=>el.dataset.flavor===fb.flavor);
        if(inp){ inp.value = fb.qty; inp.dispatchEvent(new Event('input')); }
      });
    } else if(it.flavor === 'Mix（随意搭配）'){
      const mixCb = row.querySelector('.fb-mix-checkbox');
      if(mixCb){ mixCb.checked = true; mixCb.dispatchEvent(new Event('change')); }
    } else {
      const flavorInput = row.querySelector('.oi-flavor');
      if(flavorInput) flavorInput.value = it.flavor || '';
    }
  });
  if(items.length===0) addOrderItemRow();

  document.getElementById('order-save-btn').textContent = '更新订单';
  document.getElementById('order-cancel-edit-btn').style.display = 'inline-flex';
  showToast('已载入订单，改好后点"更新订单"保存');
}

function cancelEditOrder(){
  editingOrderId = null;
  resetOrderFormUI();
  ['o-name','o-phone','o-note','o-address','o-delivertime'].forEach(id=>document.getElementById(id).value='');
  setOtherAwareValue('o-contact-select','o-contact-other','');
  document.getElementById('o-delivery-method').value = 'pickup';
  toggleAddressField();
  resetOrderItemRows();
  showToast('已取消编辑');
}

function orderCardHTML(o, showActions){
  showActions = showActions !== false;
  const statusLabel = o.paymentStatus==='paid' ? '已全款' : (o.paymentStatus==='deposit' ? '已付定金' : '未付款');
  const statusClass = o.paymentStatus==='paid' ? 'paid' : (o.paymentStatus==='deposit' ? 'deposit' : 'unpaid');
  const items = getOrderItems(o);
  const itemsHTML = items.map(it=>{
    const hasDiscount = it.originalPrice && it.originalPrice > it.unitPrice;
    return `
    <div class="oi-line">
      <span>
        ${it.product}${it.flavor ? '（'+it.flavor+'）' : ''} <span class="n">× ${it.qty}</span>
        ${hasDiscount ? `<br><span class="discount-note">原价 ${fmtMoney(it.originalPrice)} → 优惠价 ${fmtMoney(it.unitPrice)}</span>` : ''}
      </span>
      <span>${fmtMoney(it.lineTotal)}</span>
    </div>
  `;
  }).join('');
  const balance = Number(o.totalPrice||0) - Number(o.paidAmount||0);
  return `
    <div class="item-card">
      <div class="item-top">
        <div>
          <div class="item-title">${o.customerName} <small style="font-weight:400;color:var(--espresso-soft);">${getInvoiceNo(o)}${o.deliverDate ? ' · 交货 '+o.deliverDate : ''}</small></div>
          <div class="item-sub">${activityName(o.activityId)} · 下单 ${o.orderDate}${o.deliverDate ? ' · 交货 '+o.deliverDate+(o.deliverTime ? ' '+o.deliverTime : '') : ''}${o.contactPerson ? ' · 对接人：'+o.contactPerson : ''} · ${o.deliveryMethod==='delivery' ? '🚗 送货' : '🏪 自取'}</div>
        </div>
        <span class="badge ${statusClass}">${statusLabel}</span>
      </div>
      <div class="oi-lines">${itemsHTML}</div>
      <div class="item-meta">
        <span>总额：<b>${fmtMoney(o.totalPrice)}</b></span>
        <span>已收：<b>${fmtMoney(o.paidAmount)}</b></span>
        <span>欠款：<b style="color:${balance>0 ? 'var(--bad)' : 'var(--good)'}">${fmtMoney(balance)}</b></span>
        ${o.phone ? `<span>电话：${o.phone}</span>` : ''}
        ${o.deliveryMethod==='delivery' && o.address ? `<span>地址：${o.address}</span>` : ''}
        ${o.note ? `<span>备注：${o.note}</span>` : ''}
      </div>
      ${showActions ? `
      <div class="item-actions">
        <button class="btn small ghost" onclick="editOrder('${o.id}')">✏️ 编辑</button>
        <button class="btn small ghost" onclick="printInvoice('${o.id}')">🖨 打印发票</button>
        <button class="btn small danger" onclick="deleteOrder('${o.id}')">删除订单</button>
      </div>
      <div class="pay-row" style="margin-top:8px;">
        <input type="number" step="0.01" id="pay-input-${o.id}" value="${o.paidAmount}">
        <button class="btn small ghost" onclick="updatePaidAmount('${o.id}')">更新已收款</button>
        <button class="btn small" onclick="markFullyPaid('${o.id}')">收全款</button>
      </div>` : ''}
    </div>
  `;
}

async function updatePaidAmount(id){
  if(!sb){ showToast('请先设置 Supabase 连接信息'); return; }
  const o = orders.find(x=>x.id===id);
  if(!o) return;
  const input = document.getElementById('pay-input-'+id);
  const amt = Number(input.value)||0;
  const paymentStatus = amt<=0 ? 'unpaid' : (amt>=Number(o.totalPrice||0) ? 'paid' : 'deposit');
  const {error} = await sb.from('orders').update({paid_amount: amt, payment_status: paymentStatus}).eq('id', id);
  if(error){ console.error(error); showToast('更新失败：'+error.message); return; }
  o.paidAmount = amt;
  o.paymentStatus = paymentStatus;
  renderAll();
  showToast('付款状态已更新');
}

async function markFullyPaid(id){
  if(!sb){ showToast('请先设置 Supabase 连接信息'); return; }
  const o = orders.find(x=>x.id===id);
  if(!o) return;
  const {error} = await sb.from('orders').update({paid_amount:o.totalPrice, payment_status:'paid'}).eq('id', id);
  if(error){ console.error(error); showToast('更新失败：'+error.message); return; }
  o.paidAmount = o.totalPrice;
  o.paymentStatus = 'paid';
  renderAll();
  showToast('已标记全款');
}

async function deleteOrder(id){
  if(!sb){ showToast('请先设置 Supabase 连接信息'); return; }
  const {error} = await sb.from('orders').delete().eq('id', id);
  if(error){ console.error(error); showToast('删除失败：'+error.message); return; }
  orders = orders.filter(o=>o.id!==id);
  renderAll();
}

// ---------- Invoice printing ----------
function getInvoiceNo(o){
  if(o.invoiceSeq) return 'INV' + String(o.invoiceSeq).padStart(4,'0');
  return o.invoiceNo || ('INV' + o.id.slice(-4).toUpperCase());
}

function escapeHTML(s){
  return (s||'').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function buildInvoiceHTML(o){
  const items = getOrderItems(o);
  const itemsRows = items.map(it=>{
    const hasDiscount = it.originalPrice && it.originalPrice > it.unitPrice;
    const priceCell = hasDiscount
      ? `<span class="orig-price">${fmtMoney(it.originalPrice)}</span><br>${fmtMoney(it.unitPrice)}`
      : fmtMoney(it.unitPrice);
    return `
    <tr>
      <td>
        <div class="it-name">${escapeHTML(it.product)}</div>
        ${it.flavor ? `<div class="it-sub">${escapeHTML(it.flavor)}</div>` : ''}
        ${hasDiscount ? `<div class="it-sub discount">Special Price</div>` : ''}
      </td>
      <td class="num">${it.qty}</td>
      <td class="num">${priceCell}</td>
      <td class="num">${fmtMoney(it.lineTotal)}</td>
    </tr>
  `;
  }).join('');

  const balance = Number(o.totalPrice||0) - Number(o.paidAmount||0);
  let stampHTML = '';
  if(o.paymentStatus==='paid'){
    stampHTML = `<div class="stamp paid">PAID ✓</div>`;
  } else if(o.paymentStatus==='deposit'){
    stampHTML = `<div class="stamp deposit">DEPOSIT PAID · Balance ${fmtMoney(balance)}</div>`;
  } else {
    stampHTML = `<div class="stamp unpaid">UNPAID</div>`;
  }

  const defaultTerms = [
    'Please complete payment and send the receipt within 12 hours, otherwise the order will be automatically cancelled.',
    'Reservation is confirmed only after payment.',
    'No refund once cake production has started.',
    'Any changes must be informed at least 3 days in advance.'
  ];
  const termsLines = (businessProfile.terms && businessProfile.terms.trim())
    ? businessProfile.terms.split('\n').map(s=>s.trim()).filter(Boolean)
    : defaultTerms;
  const termsHTML = termsLines.map(t=>`<li>${escapeHTML(t)}</li>`).join('');

  const methodLabel = o.deliveryMethod==='delivery' ? 'Delivery' : 'Self Pickup';
  const addressRow = (o.deliveryMethod==='delivery' && o.address)
    ? `<div class="info-row"><span class="k">Delivery Address</span><span class="v">${escapeHTML(o.address)}</span></div>` : '';

  const bankHTML = (businessProfile.bankName || businessProfile.bankAccountNumber) ? `
    <div class="pay-details">
      ${businessProfile.qrImage ? `<div class="qr-box"><img src="${businessProfile.qrImage}"><div class="qr-label">Scan to pay</div></div>` : ''}
      <div class="pay-title">PAYMENT DETAILS</div>
      <div class="pay-info">
        ${businessProfile.bankName ? `<div class="info-row"><span class="k">Bank</span><span class="v">${escapeHTML(businessProfile.bankName)}</span></div>` : ''}
        ${businessProfile.bankAccountName ? `<div class="info-row"><span class="k">Account Name</span><span class="v">${escapeHTML(businessProfile.bankAccountName)}</span></div>` : ''}
        ${businessProfile.bankAccountNumber ? `<div class="info-row"><span class="k">Account Number</span><span class="v">${escapeHTML(businessProfile.bankAccountNumber)}</span></div>` : ''}
      </div>
    </div>
  ` : '';

  const today = new Date().toISOString().slice(0,10);

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Invoice ${getInvoiceNo(o)}</title>
<style>
  @page{ margin:16mm; }
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;}
  body{font-family:Arial,Helvetica,"PingFang SC","Microsoft YaHei",sans-serif;color:#222;margin:0;padding:0;font-size:13px;}
  .sheet{max-width:700px;margin:0 auto;padding:10px;}
  .bottom-block{margin-top:55px;}
  .biz-header{display:flex;align-items:center;gap:12px;}
  .biz-logo{width:78px;height:78px;object-fit:contain;flex-shrink:0;}
  .biz-name{font-family:Georgia,"Songti SC","STSong",serif;font-size:26px;font-weight:700;letter-spacing:0.5px;}
  .biz-sub{font-size:15.5px;color:#555;margin-top:3px;}
  .divider{border-top:2px solid #222;margin:14px 0;}
  .invoice-title{font-family:Georgia,"Songti SC","STSong",serif;font-size:16px;font-weight:700;letter-spacing:2px;margin-bottom:10px;}
  .info-cols{display:flex;justify-content:space-between;gap:24px;margin-bottom:14px;}
  .info-block{flex:1;}
  .info-block-title{font-family:Georgia,"Songti SC","STSong",serif;font-size:11px;font-weight:700;letter-spacing:1px;color:#555;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:6px;}
  .info-row{display:flex;font-size:12.5px;padding:2px 0;}
  .info-row .k{width:130px;color:#666;flex-shrink:0;}
  .info-row .k::after{content:":";margin-left:1px;}
  .info-row .v{font-weight:600;}
  table{width:100%;border-collapse:collapse;margin-top:6px;}
  thead th{font-size:10.5px;letter-spacing:0.5px;color:#555;text-align:left;border-bottom:1.5px solid #222;padding:6px 4px;}
  thead th.num{text-align:right;}
  tbody td{padding:8px 4px;border-bottom:1px solid #e5e5e5;font-size:13px;vertical-align:top;}
  td.num{text-align:right;white-space:nowrap;}
  .it-name{font-family:Georgia,"Songti SC","STSong",serif;font-weight:600;}
  .it-sub{font-size:11px;color:#777;}
  .it-sub.discount{color:#b9781f;font-weight:700;}
  .orig-price{text-decoration:line-through;color:#999;font-size:11px;}
  .total-row{display:flex;justify-content:flex-end;align-items:center;gap:14px;margin-top:0;}
  .total-label{font-family:Georgia,"Songti SC","STSong",serif;font-size:13px;color:#555;}
  .total-amount{font-size:20px;font-weight:700;}
  .stamp{display:inline-block;margin-top:8px;padding:5px 14px;border:2px solid;border-radius:6px;font-weight:700;font-size:13px;float:right;}
  .stamp.paid{color:#2e7d32;border-color:#2e7d32;}
  .stamp.deposit{color:#b9781f;border-color:#b9781f;}
  .stamp.unpaid{color:#b04a3f;border-color:#b04a3f;}
  .order-note{margin-top:6px;font-size:10.5px;color:#888;font-style:italic;}
  .terms{margin-top:0;font-size:11px;color:#555;}
  .terms .t-title{font-family:Georgia,"Songti SC","STSong",serif;font-weight:700;font-size:11.5px;color:#333;margin-bottom:4px;}
  .tear-divider{border-top:1.5px dashed #bbb;margin-top:20px;margin-bottom:12px;}
  .terms ul{margin:0;padding-left:16px;}
  .pay-details{position:relative;min-height:130px;margin-top:16px;background:#F5F1E8;border:1px solid #E5DFD0;border-radius:10px;padding:12px 130px 14px 16px;}
  .pay-title{font-family:Georgia,"Songti SC","STSong",serif;font-size:10.5px;letter-spacing:1px;color:#777;}
  .pay-info{margin-top:8px;}
  .qr-box{position:absolute;top:12px;right:16px;text-align:center;}
  .qr-box img{width:88px;height:88px;object-fit:contain;border-radius:4px;display:block;}
  .qr-label{font-size:10px;color:#777;margin-top:2px;}
  .footer-note{text-align:center;font-size:10.5px;color:#999;margin-top:24px;}
  .print-btn-wrap{text-align:center;margin-bottom:18px;}
  .print-btn-wrap button{
    padding:11px 26px;
    border-radius:9px;
    border:none;
    background:#B9793F;
    color:#fff;
    font-size:14.5px;
    font-weight:700;
    cursor:pointer;
  }
  @media print{
    body{padding:0;}
    .print-btn-wrap{display:none !important;}
  }
</style>
</head>
<body>
  <div class="print-btn-wrap">
    <button onclick="window.print()">🖨 打印 / 保存为 PDF</button>
  </div>
  <div class="sheet">
    <div class="biz-header">
      ${businessProfile.logoImage ? `<img class="biz-logo" src="${businessProfile.logoImage}">` : ''}
      <div>
        <div class="biz-name">${escapeHTML(businessProfile.bizName || '（请到"商家资料"页填写店名）')}</div>
        <div class="biz-sub">
          ${businessProfile.regNo ? `Business Reg. No: ${escapeHTML(businessProfile.regNo)}<br>` : ''}
          ${businessProfile.address ? `${escapeHTML(businessProfile.address)}<br>` : ''}
          ${businessProfile.phone ? `Tel: ${escapeHTML(businessProfile.phone)}` : ''}
        </div>
      </div>
    </div>
    <div class="divider"></div>
    <div class="invoice-title">INVOICE</div>
    <div class="info-cols">
      <div class="info-block">
        <div class="info-block-title">ORDER INFO</div>
        <div class="info-row"><span class="k">Invoice No</span><span class="v">${getInvoiceNo(o)}</span></div>
        <div class="info-row"><span class="k">Invoice Date</span><span class="v">${o.orderDate||''}</span></div>
        <div class="info-row"><span class="k">Bill To</span><span class="v">${escapeHTML(o.customerName)}</span></div>
        ${o.phone ? `<div class="info-row"><span class="k">Contact</span><span class="v">${escapeHTML(o.phone)}</span></div>` : ''}
      </div>
      <div class="info-block">
        <div class="info-block-title">COLLECTION INFO</div>
        ${o.deliverDate ? `<div class="info-row"><span class="k">Collect Date</span><span class="v">${o.deliverDate}</span></div>` : ''}
        ${o.deliverTime ? `<div class="info-row"><span class="k">Collect Time</span><span class="v">${o.deliverTime}</span></div>` : ''}
        <div class="info-row"><span class="k">Method</span><span class="v">${methodLabel}</span></div>
        ${addressRow}
      </div>
    </div>

    <table>
      <thead>
        <tr><th>ITEM</th><th class="num">QTY</th><th class="num">UNIT PRICE</th><th class="num">AMOUNT</th></tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>

    ${o.note ? `<div class="order-note">Note: ${escapeHTML(o.note)}</div>` : ''}

    <div class="bottom-block">
      <div class="total-row">
        <span class="total-label">TOTAL AMOUNT</span>
        <span class="total-amount">${fmtMoney(o.totalPrice)}</span>
      </div>
      ${stampHTML}
      <div style="clear:both;"></div>

      <div class="tear-divider"></div>

      <div class="terms">
        <div class="t-title">TERMS &amp; CONDITIONS</div>
        <ul>${termsHTML}</ul>
      </div>

      ${bankHTML}

      <div class="footer-note">Printed on ${today}</div>
    </div>
  </div>
</body></html>`;
}

function printInvoice(orderId){
  const o = orders.find(x=>x.id===orderId);
  if(!o){ showToast('找不到这张订单'); return; }
  const html = buildInvoiceHTML(o);
  try{
    const blob = new Blob([html], {type:'text/html'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Invoice_${getInvoiceNo(o)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 5000);
    showToast('发票已下载，打开该文件后点里面的打印按钮');
  }catch(e){
    console.error(e);
    showToast('下载失败，请稍后再试');
  }
}

// ---------- 空白订购表（拿去手写接单用的打印模板） ----------
function buildOrderFormTicketHTML(items, bizName, logoImage){
  const groups = items.map(p=>{
    const flavors = (p.flavorOptions && p.flavorOptions.length>0) ? p.flavorOptions : [''];
    const rowCount = flavors.length + 1; // 多留一行给手写额外口味
    const flavorRows = flavors.map((f,idx)=>`
      <tr>
        ${idx===0 ? `<td class="of-size" rowspan="${rowCount}">${escapeHTML(p.name)}</td>` : ''}
        <td class="of-flavor">${escapeHTML(f)}</td>
        <td class="of-egg"></td>
        ${idx===0 ? `<td class="of-price" rowspan="${rowCount}">RM${(Number(p.price)||0).toFixed(2)}</td>` : ''}
        ${idx===0 ? `<td class="of-qty" rowspan="${rowCount}"></td>` : ''}
        ${idx===0 ? `<td class="of-amt" rowspan="${rowCount}"></td>` : ''}
      </tr>
    `).join('');
    const blankRow = `
      <tr>
        <td class="of-flavor"></td>
        <td class="of-egg"></td>
      </tr>
    `;
    return flavorRows + blankRow;
  }).join('');

  return `
    <div class="order-ticket"><div class="of-inner">
      <div class="of-header">
        ${logoImage ? `<div class="of-logo"></div>` : ''}
        <div class="of-bizname">${escapeHTML(bizName || "LINGLING'S BAKERY")}</div>
      </div>
      <table class="of-table">
        <thead>
          <tr><th>SIZE</th><th>FLAVOUR</th><th>X<br>EGG</th><th>PRICE</th><th>BOX<br>QTY</th><th>TOTAL<br>AMT</th></tr>
        </thead>
        <tbody>${groups}</tbody>
      </table>
      <div class="of-footer-row">
        <div class="of-checks">
          <label><input type="checkbox" disabled> 面交</label>
          <label><input type="checkbox" disabled> OTHER</label>
        </div>
        <div class="of-total">TOTAL= <span class="of-total-box"></span></div>
      </div>
      <div class="of-field">CUS NAME: <span class="of-line"></span></div>
      <div class="of-field">CONTACT: <span class="of-line"></span></div>
      <div class="of-field">ADDRESS: <span class="of-line"></span></div>
      <div class="of-remark">REMARK:</div>
    </div></div>
  `;
}

function buildBlankOrderFormHTML(items){
  const ticket = buildOrderFormTicketHTML(items, businessProfile.bizName, businessProfile.logoImage);
  const tickets = Array(4).fill(ticket).join('');
  // logo 只在 CSS 里放一份（用 background-image），不要在每张票据的 <img> 里各放一份，不然文件会变得很大
  const businessLogoCss = businessProfile.logoImage ? `background-image:url('${businessProfile.logoImage}');` : '';
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>空白订购表</title>
<style>
  @page{ size:A4; margin:8mm; }
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  body{font-family:Arial,Helvetica,"PingFang SC","Microsoft YaHei",sans-serif;color:#111;margin:0;padding:10px;}
  .print-btn-wrap{text-align:center;margin-bottom:16px;}
  .print-btn-wrap button{padding:10px 24px;border-radius:9px;border:none;background:#B9793F;color:#fff;font-size:14px;font-weight:700;cursor:pointer;}
  .grid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:6mm;height:279mm;}
  .order-ticket{border:1.5px solid #000;overflow:hidden;position:relative;}
  .of-inner{padding:8px;transform-origin:top left;}
  .of-header{display:flex;align-items:center;gap:6px;margin-bottom:5px;}
  .of-logo{width:20px;height:20px;background-size:contain;background-repeat:no-repeat;background-position:center;border-radius:50%;flex:none;${businessLogoCss}}
  .of-bizname{font-weight:800;font-style:italic;font-size:13px;letter-spacing:0.3px;}
  .of-table{width:100%;border-collapse:collapse;font-size:9.5px;table-layout:fixed;}
  .of-table th, .of-table td{border:1px solid #000;padding:1.5px 3px;text-align:center;}
  .of-table thead th{font-size:8px;line-height:1.2;padding:1.5px 3px;}
  .of-flavor{text-align:left;}
  .of-size{font-weight:700;}
  .of-footer-row{display:flex;justify-content:space-between;align-items:center;margin-top:5px;font-size:10.5px;}
  .of-checks label{margin-right:10px;}
  .of-checks input{margin-right:3px;}
  .of-total-box{display:inline-block;width:65px;border-bottom:1px solid #000;}
  .of-field{margin-top:4px;font-size:10.5px;}
  .of-line{display:inline-block;width:170px;border-bottom:1px solid #000;}
  .of-remark{margin-top:5px;border:1px solid #000;min-height:24px;font-size:10.5px;padding:3px 5px;}
  @media print{
    body{padding:0;}
    .print-btn-wrap{display:none !important;}
  }
</style>
</head>
<body>
  <div class="print-btn-wrap"><button onclick="window.print()">🖨 打印 / 保存为 PDF</button></div>
  <div class="grid">${tickets}</div>
  <script>
    // 每张票据的内容自动缩放到刚好塞满这一格：内容太多就缩小，内容少留白太多就放大，
    // 这样不管选了几样货品，4份都能印在同一张 A4 上，也不会有一大截空白。
    function fitTickets(){
      document.querySelectorAll('.order-ticket').forEach(function(ticket){
        var inner = ticket.querySelector('.of-inner');
        inner.style.transform = 'scale(1)';
        inner.style.width = '100%';
        var boxH = ticket.clientHeight, boxW = ticket.clientWidth;
        var naturalH = inner.scrollHeight, naturalW = inner.scrollWidth;
        var scale = Math.min(boxH / naturalH, boxW / naturalW, 1.6);
        scale = Math.max(scale, 0.4);
        inner.style.transform = 'scale(' + scale + ')';
        inner.style.width = (100 / scale) + '%';
      });
    }
    window.addEventListener('load', fitTickets);
    window.addEventListener('beforeprint', fitTickets);
    window.addEventListener('resize', fitTickets);
  </script>
</body></html>`;
}

let printFormOrder = [];
let printFormChecked = new Set();

function showPrintFormPicker(){
  if(selectedActivityId==='all'){ showToast('请先在上方选择一个具体活动'); return; }
  const items = products.filter(p=>p.activityId===selectedActivityId);
  if(items.length===0){ showToast('这个活动还没有货品，先去建立货品清单'); return; }
  printFormOrder = items.map(p=>p.id);
  printFormChecked = new Set(printFormOrder);
  renderPrintFormPicker();
}

function renderPrintFormPicker(){
  const box = document.getElementById('print-form-picker');
  box.innerHTML = `
    <div class="card">
      <div class="section-title" style="margin-top:0;">选要印上去的货品 <small>不需要的可以取消勾选，用 ↑↓ 调整排列顺序</small></div>
      ${printFormOrder.map((id,idx)=>{
        const p = products.find(x=>x.id===id);
        if(!p) return '';
        return `
        <div style="display:flex;align-items:center;gap:8px;font-size:13px;padding:5px 0;border-bottom:1px solid var(--border);">
          <input type="checkbox" class="pf-item-check" data-id="${id}" ${printFormChecked.has(id)?'checked':''} onchange="togglePrintFormCheck('${id}', this.checked)" style="width:auto;">
          <span style="flex:1;">${escapeHTML(p.name)}</span>
          <button type="button" class="btn ghost small" ${idx===0?'disabled':''} onclick="movePrintFormItem('${id}', -1)">↑</button>
          <button type="button" class="btn ghost small" ${idx===printFormOrder.length-1?'disabled':''} onclick="movePrintFormItem('${id}', 1)">↓</button>
        </div>
      `;
      }).join('')}
      <div class="btn-row">
        <button class="btn" onclick="generateBlankOrderForm()">生成并下载</button>
        <button class="btn ghost" onclick="document.getElementById('print-form-picker').innerHTML=''">取消</button>
      </div>
    </div>
  `;
}

function togglePrintFormCheck(id, checked){
  if(checked) printFormChecked.add(id);
  else printFormChecked.delete(id);
}

function movePrintFormItem(id, delta){
  const idx = printFormOrder.indexOf(id);
  const newIdx = idx + delta;
  if(newIdx<0 || newIdx>=printFormOrder.length) return;
  [printFormOrder[idx], printFormOrder[newIdx]] = [printFormOrder[newIdx], printFormOrder[idx]];
  renderPrintFormPicker();
}

function generateBlankOrderForm(){
  if(printFormChecked.size===0){ showToast('请至少勾选一样货品'); return; }
  const items = printFormOrder.filter(id=>printFormChecked.has(id)).map(id=>products.find(p=>p.id===id)).filter(Boolean);
  const html = buildBlankOrderFormHTML(items);
  try{
    const blob = new Blob([html], {type:'text/html'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `空白订购表_${activityName(selectedActivityId).replace(/[^\w一-龥]/g,'')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 5000);
    document.getElementById('print-form-picker').innerHTML = '';
    showToast('订购表已下载，打开该文件后点里面的打印按钮');
  }catch(e){
    console.error(e);
    showToast('下载失败，请稍后再试');
  }
}

function renderContactFilterOptions(){
  const sel = document.getElementById('order-contact-filter');
  const current = sel.value;
  const contacts = [...new Set(orders.map(o=>o.contactPerson).filter(Boolean))];
  sel.innerHTML = '<option value="">全部对接人</option>' + contacts.map(c=>`<option value="${c}">${c}</option>`).join('');
  if(contacts.includes(current)) sel.value = current;
}

function getFilteredOrderListItems(){
  const search = (document.getElementById('order-search').value||'').toLowerCase();
  const statusFilter = document.getElementById('order-status-filter').value;
  const contactFilter = document.getElementById('order-contact-filter').value;
  let items = filteredOrders();
  if(search){
    items = items.filter(o => o.customerName.toLowerCase().includes(search) || getOrderItems(o).some(it=>(it.product||'').toLowerCase().includes(search)));
  }
  if(statusFilter){
    items = items.filter(o => o.paymentStatus === statusFilter);
  }
  if(contactFilter){
    items = items.filter(o => o.contactPerson === contactFilter);
  }
  return items;
}

function renderOrderList(){
  renderActivityRow('activity-list-orderlist', true);
  renderContactFilterOptions();
  let items = getFilteredOrderListItems();
  items = items.sort((a,b)=> new Date(b.orderDate)-new Date(a.orderDate));
  const list = document.getElementById('orderlist-list');
  if(items.length===0){
    list.innerHTML = '<div class="empty">没有符合条件的订单</div>';
    return;
  }
  list.innerHTML = items.map(o=>orderCardHTML(o,true)).join('');
}

// ---------- 打印订单清单（给妈妈对单用，一张单一行，怕漏单可以逐个打勾） ----------
function buildOrderChecklistHTML(orders){
  const withDate = orders.filter(o=>o.deliverDate).sort((a,b)=> new Date(a.deliverDate) - new Date(b.deliverDate));
  const withoutDate = orders.filter(o=>!o.deliverDate);
  const all = withDate.concat(withoutDate);

  const groups = all.map(o=>{
    const items = getOrderItems(o);
    const itemLines = items.map(it=>
      '<div class="ck-item">' + escapeHTML(it.product) + (it.flavor ? ' ' + escapeHTML(it.flavor) : '') + ' <b>× ' + it.qty + '盒</b></div>'
    ).join('');
    let dateLabel = '⚠️ 未填交货日期';
    if(o.deliverDate){
      const parts = o.deliverDate.split('-');
      dateLabel = parts[2] + '/' + parts[1] + (o.deliverTime ? ' ' + o.deliverTime : '');
    }
    return `
      <div class="ck-group">
        <div class="ck-header">
          <span class="ck-box">☐</span>
          <b>${escapeHTML(o.customerName)}</b>
          <span class="ck-date">${dateLabel}</span>
          <span class="ck-method">${o.deliveryMethod==='delivery' ? '🚗 送货' : '🏪 自取'}</span>
        </div>
        <div class="ck-items">${itemLines}</div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>订单清单</title>
<style>
  @page{ margin:12mm; }
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  body{font-family:Arial,Helvetica,"PingFang SC","Microsoft YaHei",sans-serif;color:#111;margin:0;padding:14px;font-size:13px;}
  .print-btn-wrap{text-align:center;margin-bottom:16px;}
  .print-btn-wrap button{padding:10px 24px;border-radius:9px;border:none;background:#B9793F;color:#fff;font-size:14px;font-weight:700;cursor:pointer;}
  h1{font-size:16px;margin:0 0 4px;}
  .meta{font-size:11.5px;color:#666;margin-bottom:14px;}
  .ck-group{border-bottom:1px solid #ddd;padding:8px 0;}
  .ck-header{display:flex;align-items:center;gap:8px;font-size:14px;}
  .ck-box{font-size:16px;}
  .ck-date{color:#B9793F;font-weight:700;margin-left:auto;}
  .ck-method{font-size:11.5px;color:#777;}
  .ck-items{margin-top:4px;padding-left:26px;color:#333;}
  .ck-item{padding:1px 0;}
  @media print{
    body{padding:0;}
    .print-btn-wrap{display:none !important;}
    .ck-group{break-inside:avoid;}
  }
</style>
</head>
<body>
  <div class="print-btn-wrap"><button onclick="window.print()">🖨 打印 / 保存为 PDF</button></div>
  <h1>订单清单</h1>
  <div class="meta">共 ${all.length} 张订单 · 生成时间 ${new Date().toISOString().slice(0,16).replace('T',' ')}</div>
  ${groups}
</body></html>`;
}

function printOrderChecklist(){
  const items = getFilteredOrderListItems();
  if(items.length===0){ showToast('没有符合条件的订单可以打印'); return; }
  const html = buildOrderChecklistHTML(items);
  try{
    const blob = new Blob([html], {type:'text/html'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '订单清单_' + new Date().toISOString().slice(0,10) + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 5000);
    showToast('订单清单已下载，打开该文件后点里面的打印按钮');
  }catch(e){
    console.error(e);
    showToast('下载失败，请稍后再试');
  }
}

// ---------- 交货日历 ----------
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth(); // 0-11

function changeCalendarMonth(delta){
  calendarMonth += delta;
  if(calendarMonth < 0){ calendarMonth = 11; calendarYear--; }
  else if(calendarMonth > 11){ calendarMonth = 0; calendarYear++; }
  renderCalendar();
}

function jumpToOrderFromCalendar(id){
  switchTab('order');
  editOrder(id);
}

function renderCalendar(){
  const grid = document.getElementById('calendar-grid');
  if(!grid) return;
  renderActivityRow('activity-list-calendar', true);
  document.getElementById('calendar-month-label').textContent = calendarYear + ' 年 ' + (calendarMonth+1) + ' 月';

  const byDate = {};
  filteredOrders().forEach(o=>{
    if(!o.deliverDate) return;
    if(!byDate[o.deliverDate]) byDate[o.deliverDate] = [];
    byDate[o.deliverDate].push(o);
  });

  const firstOfMonth = new Date(calendarYear, calendarMonth, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7; // 周一=0
  const daysInMonth = new Date(calendarYear, calendarMonth+1, 0).getDate();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
  const todayStr2 = new Date().toISOString().slice(0,10);

  let html = ['一','二','三','四','五','六','日'].map(d=>'<div class="cal-head">周'+d+'</div>').join('');
  for(let i=0;i<totalCells;i++){
    const dayNum = i - startWeekday + 1;
    if(dayNum < 1 || dayNum > daysInMonth){
      html += '<div class="cal-cell cal-cell-empty"></div>';
      continue;
    }
    const dateStr = calendarYear + '-' + String(calendarMonth+1).padStart(2,'0') + '-' + String(dayNum).padStart(2,'0');
    const dayOrders = (byDate[dateStr]||[]).sort((a,b)=>(a.deliverTime||'').localeCompare(b.deliverTime||''));
    const shown = dayOrders.slice(0,4);
    const chips = shown.map(o=>{
      const cls = o.paymentStatus==='paid' ? 'paid' : (o.paymentStatus==='deposit' ? 'deposit' : 'unpaid');
      const label = (o.deliverTime ? o.deliverTime+' ' : '') + o.customerName;
      return '<div class="cal-chip '+cls+'" onclick="jumpToOrderFromCalendar(\''+o.id+'\')" title="'+escapeHTML(label)+'">'+escapeHTML(label)+'</div>';
    }).join('');
    const more = dayOrders.length>4 ? '<div class="cal-more">+'+(dayOrders.length-4)+' 项</div>' : '';
    const isToday = dateStr===todayStr2 ? ' today' : '';
    html += '<div class="cal-cell"><div class="cal-date'+isToday+'">'+dayNum+'</div>'+chips+more+'</div>';
  }
  grid.innerHTML = html;
}

// ---------- Stats ----------
function renderStats(){
  renderActivityRow('activity-list-stats', true);
  const ords = filteredOrders();
  const purs = filteredPurchases();
  const revenue = ords.reduce((s,o)=>s+Number(o.totalPrice||0),0);
  const cost = purchaseCostTotal(purs, filteredSettlements());
  const costRmb = purs.reduce((s,p)=>s+Number(p.rmbTotal||0),0);
  const profit = revenue - cost;
  const received = ords.reduce((s,o)=>s+Number(o.paidAmount||0),0);
  let totalDiscount = 0;
  ords.forEach(o=>{
    getOrderItems(o).forEach(it=>{
      if(it.originalPrice && it.originalPrice > it.unitPrice){
        totalDiscount += (it.originalPrice - it.unitPrice) * Number(it.qty||0);
      }
    });
  });

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card"><div class="label">订单数</div><div class="value">${ords.length}</div></div>
    <div class="stat-card"><div class="label">营业额</div><div class="value">${fmtMoney(revenue)}</div></div>
    <div class="stat-card"><div class="label">采购成本（MYR）</div><div class="value">${fmtMoney(cost)}</div></div>
    <div class="stat-card"><div class="label">预估利润</div><div class="value ${profit>=0?'good':'bad'}">${fmtMoney(profit)}</div></div>
    <div class="stat-card"><div class="label">已收款</div><div class="value good">${fmtMoney(received)}</div></div>
    <div class="stat-card"><div class="label">未收款</div><div class="value bad">${fmtMoney(revenue-received)}</div></div>
    <div class="stat-card"><div class="label">让利总额</div><div class="value bad">${fmtMoney(totalDiscount)}</div></div>
    ${costRmb>0 ? `<div class="stat-card"><div class="label">人民币采购参考（¥）</div><div class="value">¥ ${costRmb.toFixed(2)}</div></div>` : ''}
  `;

  // top products
  const prodMap = {};
  ords.forEach(o=>{
    getOrderItems(o).forEach(it=>{
      if(!prodMap[it.product]) prodMap[it.product] = {qty:0, revenue:0};
      prodMap[it.product].qty += Number(it.qty||0);
      prodMap[it.product].revenue += Number(it.lineTotal||0);
    });
  });
  const prodArr = Object.entries(prodMap).sort((a,b)=>b[1].revenue-a[1].revenue).slice(0,8);
  const prodBox = document.getElementById('stats-products');
  prodBox.innerHTML = prodArr.length===0 ? '<div class="empty">暂无数据</div>' :
    prodArr.map(([name,d])=>`
      <div class="rank-row">
        <div><div class="name">${name}</div><div class="sub">卖出 ${d.qty} 件</div></div>
        <div>${fmtMoney(d.revenue)}</div>
      </div>
    `).join('');

  // top customers — always across ALL activities so it's a true "常用客户" list
  const custMap = {};
  orders.forEach(o=>{
    const key = o.customerName + '|' + (o.phone||'');
    if(!custMap[key]) custMap[key] = {name:o.customerName, phone:o.phone, count:0, spend:0, last:o.orderDate};
    custMap[key].count += 1;
    custMap[key].spend += Number(o.totalPrice||0);
    if(new Date(o.orderDate) > new Date(custMap[key].last)) custMap[key].last = o.orderDate;
  });
  const custArr = Object.values(custMap).sort((a,b)=>b.spend-a.spend).slice(0,8);
  const custBox = document.getElementById('stats-customers');
  custBox.innerHTML = custArr.length===0 ? '<div class="empty">暂无数据</div>' :
    custArr.map(c=>`
      <div class="rank-row">
        <div><div class="name">${c.name}</div><div class="sub">共 ${c.count} 单 · 最近 ${c.last}</div></div>
        <div>${fmtMoney(c.spend)}</div>
      </div>
    `).join('');
}

function renderAll(){
  renderOverview();
  renderPurchaseList();
  renderProductList();
  renderActivityRow('activity-list-order', false);
  refreshOrderItemProductOptions();
  renderOrderList();
  renderCalendar();
  renderStats();
}

// tab switching
function switchTab(tabName){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===tabName));
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active', p.id==='panel-'+tabName));
}
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>switchTab(btn.dataset.tab));
});

// default dates
document.getElementById('p-date').value = new Date().toISOString().slice(0,10);
document.getElementById('o-orderdate').value = new Date().toISOString().slice(0,10);
resetOrderItemRows();
resetPurchaseItemRows();

loadAll();
