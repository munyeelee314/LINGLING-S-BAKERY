let activities = [];
let purchases = [];
let settlements = [];
let orders = [];
let products = [];
let businessProfile = {};
let editingOrderId = null;
let editingProductId = null;
let selectedActivityId = 'all'; // shared selection concept across tabs, 'all' or activity id or 'none'
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
    item: p.item,
    qty: p.qty,
    unit: p.unit || '',
    unit_price: p.unitPrice,
    total_cost: p.totalCost,
    currency: p.currency || 'MYR',
    note: p.note || '',
    buyer: p.buyer || '',
    is_advance: !!p.isAdvance,
    repaid: !!p.repaid,
    shop_name: p.shopName || '',
    product_link: p.productLink || '',
    product_photo: p.productPhoto || ''
  };
}
function rowToPurchase(r){
  return {
    id: r.id,
    activityId: r.activity_id,
    date: r.date || '',
    supplier: r.supplier || '',
    item: r.item,
    qty: Number(r.qty)||0,
    unit: r.unit || '',
    unitPrice: Number(r.unit_price)||0,
    totalCost: Number(r.total_cost)||0,
    currency: r.currency || 'MYR',
    note: r.note || '',
    buyer: r.buyer || '',
    isAdvance: !!r.is_advance,
    repaid: !!r.repaid,
    shopName: r.shop_name || '',
    productLink: r.product_link || '',
    productPhoto: r.product_photo || ''
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
    repaid: !!r.repaid,
    note: r.note || ''
  };
}

function fmtByCurrency(n, currency){
  n = Number(n)||0;
  return currency==='RMB' ? ('¥ ' + n.toFixed(2)) : fmtMoney(n);
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
  // 默认显示最近创建的活动，避免把所有活动的数据混在一起看
  selectedActivityId = activities.length ? activities[activities.length-1].id : 'all';
  renderAll();
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
  const cost = purs.filter(p=>p.currency!=='RMB').reduce((s,p)=>s+Number(p.totalCost||0),0);
  const costRmb = purs.filter(p=>p.currency==='RMB').reduce((s,p)=>s+Number(p.totalCost||0),0);
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
function calcPurchaseTotal(){
  const qty = Number(document.getElementById('p-qty').value)||0;
  const price = Number(document.getElementById('p-price').value)||0;
  document.getElementById('p-total').value = (qty*price).toFixed(2);
}

function toggleRepaidField(){
  const isAdvance = document.getElementById('p-is-advance').checked;
  document.getElementById('p-repaid-wrapper').style.display = isAdvance ? 'block' : 'none';
}

async function addPurchase(){
  if(!sb){ showToast('请先设置 Supabase 连接信息'); return; }
  const item = document.getElementById('p-item').value.trim();
  if(!item){ showToast('请输入原料名称'); return; }
  if(selectedActivityId==='all'){ showToast('请先在上方选择一个具体活动'); return; }
  const photoFileInput = document.getElementById('p-product-photo-file');
  const photoData = (photoFileInput.files && photoFileInput.files[0]) ? await readFileAsDataURL(photoFileInput.files[0]) : '';
  const isAdvance = document.getElementById('p-is-advance').checked;
  const rec = {
    id: uid(),
    activityId: selectedActivityId,
    date: document.getElementById('p-date').value || new Date().toISOString().slice(0,10),
    supplier: document.getElementById('p-supplier').value.trim(),
    item,
    qty: Number(document.getElementById('p-qty').value)||0,
    unit: document.getElementById('p-unit').value.trim(),
    unitPrice: Number(document.getElementById('p-price').value)||0,
    totalCost: Number(document.getElementById('p-total').value)||0,
    currency: document.getElementById('p-currency').value,
    note: document.getElementById('p-note').value.trim(),
    buyer: document.getElementById('p-buyer').value.trim(),
    isAdvance,
    repaid: isAdvance ? document.getElementById('p-repaid').checked : false,
    shopName: document.getElementById('p-shop-name').value.trim(),
    productLink: document.getElementById('p-product-link').value.trim(),
    productPhoto: photoData
  };
  const {error} = await sb.from('purchases').insert(purchaseToRow(rec));
  if(error){ console.error(error); showToast('保存采购记录失败：'+error.message); return; }
  purchases.push(rec);
  ['p-item','p-qty','p-unit','p-price','p-total','p-supplier','p-note','p-buyer','p-shop-name','p-product-link'].forEach(id=>document.getElementById(id).value='');
  photoFileInput.value = '';
  document.getElementById('p-currency').value = 'MYR';
  document.getElementById('p-is-advance').checked = false;
  document.getElementById('p-repaid').checked = false;
  toggleRepaidField();
  renderAll();
  showToast('采购记录已保存');
}

async function deletePurchase(id){
  if(!sb){ showToast('请先设置 Supabase 连接信息'); return; }
  const {error} = await sb.from('purchases').delete().eq('id', id);
  if(error){ console.error(error); showToast('删除失败：'+error.message); return; }
  purchases = purchases.filter(p=>p.id!==id);
  selectedPurchaseIds.delete(id);
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

function renderSettlementBuilder(){
  const box = document.getElementById('settlement-builder');
  if(!box) return;
  if(selectedPurchaseIds.size===0){ box.innerHTML = ''; return; }
  const selected = purchases.filter(p=>selectedPurchaseIds.has(p.id));
  const rmbTotal = selected.filter(p=>p.currency==='RMB').reduce((s,p)=>s+Number(p.totalCost||0),0);
  const buyers = [...new Set(selected.map(p=>p.buyer).filter(Boolean))];
  box.innerHTML = `
    <div class="card">
      <div class="section-title" style="margin-top:0;">已勾选 ${selected.length} 项 <small>合并成一笔还款记录</small></div>
      <div class="form-grid">
        <div>
          <label>还给谁（代付人）</label>
          <input type="text" id="settle-buyer" value="${buyers.length===1 ? buyers[0] : ''}" placeholder="例如：老公 / 女儿">
        </div>
        <div>
          <label>人民币合计（¥，参考用，自动加总）</label>
          <input type="number" step="0.01" id="settle-rmb" value="${rmbTotal.toFixed(2)}">
        </div>
        <div>
          <label>实际要还的金额（MYR）</label>
          <input type="number" step="0.01" id="settle-myr" placeholder="例如：486.09">
        </div>
        <div class="full">
          <label>备注（选填）</label>
          <input type="text" id="settle-note" placeholder="选填">
        </div>
      </div>
      <div class="btn-row">
        <button class="btn" onclick="addSettlement()">生成还款记录</button>
        <button class="btn ghost" onclick="clearPurchaseSelection()">取消勾选</button>
      </div>
    </div>
  `;
}

async function addSettlement(){
  if(!sb){ showToast('请先设置 Supabase 连接信息'); return; }
  if(selectedPurchaseIds.size===0){ showToast('请先勾选要合并的采购记录'); return; }
  const myrAmount = Number(document.getElementById('settle-myr').value)||0;
  if(myrAmount<=0){ showToast('请填写实际要还的 MYR 金额'); return; }
  const rec = {
    id: uid(),
    activityId: selectedActivityId,
    buyer: document.getElementById('settle-buyer').value.trim(),
    purchaseIds: [...selectedPurchaseIds],
    rmbTotal: Number(document.getElementById('settle-rmb').value)||0,
    myrAmount,
    repaid: false,
    note: document.getElementById('settle-note').value.trim()
  };
  const {error} = await sb.from('purchase_settlements').insert(settlementToRow(rec));
  if(error){ console.error(error); showToast('保存还款记录失败：'+error.message); return; }
  settlements.push(rec);
  selectedPurchaseIds.clear();
  renderAll();
  showToast('还款记录已保存');
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
  box.innerHTML = `<div class="section-title">还款记录 <small>多笔采购合并还给代付人的记录</small></div>` + items.map(s=>{
    const names = s.purchaseIds.map(id=>{
      const p = purchases.find(x=>x.id===id);
      return p ? p.item : null;
    }).filter(Boolean);
    return `
    <div class="item-card">
      <div class="item-top">
        <div>
          <div class="item-title">${s.buyer ? '还给 '+s.buyer : '还款记录'}</div>
          <div class="item-sub">${names.join('、')}</div>
        </div>
        <span class="badge ${s.repaid?'paid':'unpaid'}">${s.repaid?'已还款':'待还款'}</span>
      </div>
      <div class="item-meta">
        <span>人民币合计：<b>¥ ${s.rmbTotal.toFixed(2)}</b></span>
        <span>实还金额：<b>${fmtMoney(s.myrAmount)}</b></span>
        ${s.note ? `<span>备注：${s.note}</span>` : ''}
      </div>
      <div class="item-actions">
        <button class="btn small ghost" onclick="toggleSettlementRepaid('${s.id}')">${s.repaid?'标记为待还款':'标记为已还款'}</button>
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
  list.innerHTML = items.map(p=>`
    <div class="item-card">
      <div class="item-top">
        <div style="display:flex;gap:8px;align-items:flex-start;">
          <input type="checkbox" style="width:auto;margin-top:4px;" ${selectedPurchaseIds.has(p.id)?'checked':''} onchange="togglePurchaseSelect('${p.id}')" title="勾选后可合并成一笔还款记录">
          <div>
            <div class="item-title">${p.item}</div>
            <div class="item-sub">${p.date}${p.supplier ? ' · '+p.supplier : ''}${p.buyer ? ' · 采购人：'+p.buyer : ''}</div>
          </div>
        </div>
        <div class="item-title">${fmtByCurrency(p.totalCost, p.currency)}</div>
      </div>
      <div class="item-meta">
        <span>数量：<b>${p.qty} ${p.unit||''}</b></span>
        <span>单价：<b>${fmtByCurrency(p.unitPrice, p.currency)}</b></span>
        ${p.isAdvance ? `<span class="badge ${p.repaid?'paid':'unpaid'}">${p.repaid?'已还款':'待还款'}</span>` : ''}
        ${p.shopName ? `<span>商家：${p.shopName}</span>` : ''}
        ${p.productLink ? `<span><a href="${p.productLink}" target="_blank" rel="noopener">商品链接 ↗</a></span>` : ''}
        ${p.note ? `<span>备注：${p.note}</span>` : ''}
      </div>
      ${p.productPhoto ? `<img src="${p.productPhoto}" style="max-width:100px;max-height:100px;border-radius:8px;border:1px solid var(--border);margin-top:8px;display:block;">` : ''}
      <div class="item-actions">
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

function updateProductSuggestions(){
  const dl = document.getElementById('product-suggestions');
  const items = products.filter(p=>p.activityId===selectedActivityId);
  dl.innerHTML = items.map(p=>`<option value="${p.name}">`).join('');
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
        <input type="text" class="oi-product" list="product-suggestions" placeholder="选择或输入产品">
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

  const productInput = div.querySelector('.oi-product');
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
  productInput.addEventListener('input', ()=>{
    const match = products.find(p=>p.activityId===selectedActivityId && p.name.trim().toLowerCase()===productInput.value.trim().toLowerCase());
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
  });
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
    const product = row.querySelector('.oi-product').value.trim();
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
    contactPerson: document.getElementById('o-contact').value.trim() || '自己',
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
    ['o-name','o-contact','o-phone','o-note','o-address','o-delivertime'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('o-delivery-method').value = 'pickup';
    toggleAddressField();
    resetOrderItemRows();
    renderAll();
    showToast('订单已更新');
    return;
  }

  const rec = {
    id: uid(),
    invoiceNo: 'INV' + String(orders.length+1).padStart(4,'0'),
    ...commonFields,
    paymentStatus: 'unpaid',
    paidAmount: 0
  };
  const {error} = await sb.from('orders').insert(orderToRow(rec));
  if(error){ console.error(error); showToast('保存订单失败：'+error.message); return; }
  orders.push(rec);
  ['o-name','o-contact','o-phone','o-note','o-address','o-delivertime'].forEach(id=>document.getElementById(id).value='');
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
  updateProductSuggestions();

  document.getElementById('o-name').value = o.customerName || '';
  document.getElementById('o-contact').value = o.contactPerson || '';
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
    const productInput = row.querySelector('.oi-product');
    const qtyInput = row.querySelector('.oi-qty');
    const priceInput = row.querySelector('.oi-price');

    productInput.value = it.product;
    productInput.dispatchEvent(new Event('input'));

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
  ['o-name','o-contact','o-phone','o-note','o-address','o-delivertime'].forEach(id=>document.getElementById(id).value='');
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
          <div class="item-title">${o.customerName}</div>
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

function renderContactFilterOptions(){
  const sel = document.getElementById('order-contact-filter');
  const current = sel.value;
  const contacts = [...new Set(orders.map(o=>o.contactPerson).filter(Boolean))];
  sel.innerHTML = '<option value="">全部对接人</option>' + contacts.map(c=>`<option value="${c}">${c}</option>`).join('');
  if(contacts.includes(current)) sel.value = current;
}

function renderOrderList(){
  renderActivityRow('activity-list-orderlist', true);
  renderContactFilterOptions();
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
  items = items.sort((a,b)=> new Date(b.orderDate)-new Date(a.orderDate));
  const list = document.getElementById('orderlist-list');
  if(items.length===0){
    list.innerHTML = '<div class="empty">没有符合条件的订单</div>';
    return;
  }
  list.innerHTML = items.map(o=>orderCardHTML(o,true)).join('');
}

// ---------- Stats ----------
function renderStats(){
  renderActivityRow('activity-list-stats', true);
  const ords = filteredOrders();
  const purs = filteredPurchases();
  const revenue = ords.reduce((s,o)=>s+Number(o.totalPrice||0),0);
  const cost = purs.filter(p=>p.currency!=='RMB').reduce((s,p)=>s+Number(p.totalCost||0),0);
  const costRmb = purs.filter(p=>p.currency==='RMB').reduce((s,p)=>s+Number(p.totalCost||0),0);
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
  updateProductSuggestions();
  renderOrderList();
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

document.getElementById('p-qty').addEventListener('input', calcPurchaseTotal);
document.getElementById('p-price').addEventListener('input', calcPurchaseTotal);

// default dates
document.getElementById('p-date').value = new Date().toISOString().slice(0,10);
document.getElementById('o-orderdate').value = new Date().toISOString().slice(0,10);
resetOrderItemRows();

loadAll();
