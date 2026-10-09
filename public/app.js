// ค่าเริ่มต้นของส่วนราชการและหน่วยงาน (สำหรับแบบฟอร์มพิมพ์)
const DEFAULT_ORG = 'สำนักงานส่งเสริมการศึกษานอกระบบและการศึกษาตามอัธยาศัย';
const DEFAULT_DEPT = 'สำนักงานส่งเสริมการศึกษานอกระบบและการศึกษาตามอัธยาศัยจังหวัดนครราชสีมา';

let currentTab = 'asset';
let assetList = [];
let materialList = [];
let selectedAssetPrintId = 'all'; // 'all' หรือ ID ของครุภัณฑ์ที่ต้องการพิมพ์
let selectedAssetIndex = 0;

document.addEventListener('DOMContentLoaded', () => {
  initOrgSettings();
  initMaterialMeta();
  loadAssets();
  loadMaterials();

  // กำหนดวันปัจจุบันเป็นค่าเริ่มต้นในฟอร์ม
  const today = new Date().toISOString().split('T')[0];
  const aDate = document.getElementById('a_date');
  const mDate = document.getElementById('m_date');
  if (aDate) aDate.value = today;
  if (mDate) mDate.value = today;
});

// ==================== สลับแท็บ (Screen & Print Sync) ====================
function switchTab(tab) {
  currentTab = tab;
  const screenAsset = document.getElementById('tab-asset-screen');
  const screenMaterial = document.getElementById('tab-material-screen');
  const printAsset = document.getElementById('print-asset-section');
  const printMaterial = document.getElementById('print-material-section');
  const btnAsset = document.getElementById('tab-asset-btn');
  const btnMaterial = document.getElementById('tab-material-btn');

  if (tab === 'asset') {
    screenAsset.classList.remove('hidden');
    screenMaterial.classList.add('hidden');
    printAsset.classList.remove('hidden');
    printAsset.classList.add('block');
    printMaterial.classList.add('hidden');
    printMaterial.classList.remove('block');

    btnAsset.className = 'px-4 py-2 bg-indigo-700 rounded-lg font-semibold hover:bg-indigo-600 transition';
    btnMaterial.className = 'px-4 py-2 bg-indigo-950 rounded-lg font-semibold hover:bg-indigo-600 transition';
  } else {
    screenAsset.classList.add('hidden');
    screenMaterial.classList.remove('hidden');
    printAsset.classList.add('hidden');
    printAsset.classList.remove('block');
    printMaterial.classList.remove('hidden');
    printMaterial.classList.add('block');

    btnAsset.className = 'px-4 py-2 bg-indigo-950 rounded-lg font-semibold hover:bg-indigo-600 transition';
    btnMaterial.className = 'px-4 py-2 bg-indigo-700 rounded-lg font-semibold hover:bg-indigo-600 transition';
  }
}

// ==================== ส่วนราชการ & หน่วยงาน (สำหรับพิมพ์) ====================
function initOrgSettings() {
  const org = localStorage.getItem('gov_org') || DEFAULT_ORG;
  const dept = localStorage.getItem('gov_dept') || DEFAULT_DEPT;

  const orgAsset = document.getElementById('org-name-asset');
  const orgMat = document.getElementById('org-name-material');
  const deptAsset = document.getElementById('dept-name-asset');
  const deptMat = document.getElementById('dept-name-material');

  if (orgAsset) orgAsset.innerText = org;
  if (orgMat) orgMat.innerText = org;
  if (deptAsset) deptAsset.innerText = dept;
  if (deptMat) deptMat.innerText = dept;

  const inpOrg = document.getElementById('inp-org-name');
  const inpDept = document.getElementById('inp-dept-name');
  if (inpOrg) inpOrg.value = org;
  if (inpDept) inpDept.value = dept;
}

function saveOrgSettings(e) {
  e.preventDefault();
  const org = document.getElementById('inp-org-name').value.trim() || DEFAULT_ORG;
  const dept = document.getElementById('inp-dept-name').value.trim() || DEFAULT_DEPT;

  localStorage.setItem('gov_org', org);
  localStorage.setItem('gov_dept', dept);

  initOrgSettings();
  closeModal('orgModal');
}

// ==================== หัวบัตรวัสดุ (สำหรับพิมพ์) ====================
function initMaterialMeta() {
  const meta = JSON.parse(localStorage.getItem('material_card_meta') || '{}');
  
  document.getElementById('disp-category').innerText = meta.category || '............................................................................................';
  document.getElementById('disp-code').innerText = meta.code || '........................................................................';
  document.getElementById('disp-name').innerText = meta.name || '............................................................................................';
  document.getElementById('disp-minmax').innerText = meta.minmax || '........................................................';
  document.getElementById('disp-spec').innerText = meta.spec || '............................................................................................';
  document.getElementById('disp-location').innerText = meta.location || '.......................................................................';
  document.getElementById('disp-unit').innerText = meta.unit || '.............................................';

  document.getElementById('inp-meta-category').value = meta.category || '';
  document.getElementById('inp-meta-code').value = meta.code || '';
  document.getElementById('inp-meta-name').value = meta.name || '';
  document.getElementById('inp-meta-minmax').value = meta.minmax || '';
  document.getElementById('inp-meta-spec').value = meta.spec || '';
  document.getElementById('inp-meta-location').value = meta.location || '';
  document.getElementById('inp-meta-unit').value = meta.unit || '';
}

function saveMaterialMeta(e) {
  e.preventDefault();
  const meta = {
    category: document.getElementById('inp-meta-category').value.trim(),
    code: document.getElementById('inp-meta-code').value.trim(),
    name: document.getElementById('inp-meta-name').value.trim(),
    minmax: document.getElementById('inp-meta-minmax').value.trim(),
    spec: document.getElementById('inp-meta-spec').value.trim(),
    location: document.getElementById('inp-meta-location').value.trim(),
    unit: document.getElementById('inp-meta-unit').value.trim()
  };
  localStorage.setItem('material_card_meta', JSON.stringify(meta));
  initMaterialMeta();
  closeModal('materialMetaModal');
}

// ==================== Helper แปลงวันที่แบบไทย ====================
function formatThaiDate(dateStr) {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-');
    const thaiMonths = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const thaiYear = parseInt(y) + 543;
    return `${parseInt(d)} ${thaiMonths[parseInt(m)]} ${thaiYear}`;
  }
  return dateStr;
}

// ==================== อัปเดตข้อมูลหัวบัตรสำหรับพิมพ์ ====================
function updateAssetHeaderCard(item) {
  if (!item) {
    document.getElementById('card-asset-category').innerText = 'ครุภัณฑ์คอมพิวเตอร์';
    document.getElementById('card-asset-code').innerText = '6730-007-0001-1-3/55';
    document.getElementById('card-asset-spec').innerText = 'เครื่องฉาย Projector';
    document.getElementById('card-asset-model').innerText = 'Acer';
    document.getElementById('card-asset-location').innerText = 'ย่าโม 1, ย่าโม 2';
    document.getElementById('card-asset-vendor').innerText = 'บริษัท เอเซอร์ คอมพิวเตอร์ จำกัด';
    document.getElementById('card-asset-address').innerText = '...................................................................................................';
    document.getElementById('card-asset-phone').innerText = '...................................................';
    
    setCheckbox('chk-budget-1', true);
    setCheckbox('chk-budget-2', false);
    setCheckbox('chk-budget-3', false);
    setCheckbox('chk-budget-4', false);

    setCheckbox('chk-method-1', false);
    setCheckbox('chk-method-2', false);
    setCheckbox('chk-method-3', true);
    setCheckbox('chk-method-4', false);
    return;
  }

  document.getElementById('card-asset-category').innerText = item.category || 'ครุภัณฑ์คอมพิวเตอร์';
  document.getElementById('card-asset-code').innerText = item.asset_code || '';
  document.getElementById('card-asset-spec').innerText = item.spec || item.asset_name || '';
  document.getElementById('card-asset-model').innerText = item.model || '';
  document.getElementById('card-asset-location').innerText = item.location || '';
  document.getElementById('card-asset-vendor').innerText = item.vendor || '';
  document.getElementById('card-asset-address').innerText = item.vendor_address || '...................................................................................................';
  document.getElementById('card-asset-phone').innerText = item.vendor_phone || '...................................................';

  const b = item.budget_source || 'เงินงบประมาณ';
  setCheckbox('chk-budget-1', b === 'เงินงบประมาณ');
  setCheckbox('chk-budget-2', b === 'เงินนอกงบประมาณ');
  setCheckbox('chk-budget-3', b === 'เงินบริจาค/เงินช่วยเหลือ');
  setCheckbox('chk-budget-4', b === 'อื่นๆ');

  const m = item.acquisition_method || 'เฉพาะเจาะจง';
  setCheckbox('chk-method-1', m === 'ประกาศเชิญชวน');
  setCheckbox('chk-method-2', m === 'คัดเลือก');
  setCheckbox('chk-method-3', m === 'เฉพาะเจาะจง');
  setCheckbox('chk-method-4', m === 'รับบริจาค');
}

function setCheckbox(id, isChecked) {
  const el = document.getElementById(id);
  if (el) {
    el.innerText = isChecked ? '☑' : '☐';
  }
}

// ==================== การจัดการพิมพ์แบบเลือกได้ ====================
function updateAssetPrintDropdown() {
  const select = document.getElementById('asset-print-select');
  if (!select) return;

  const currentVal = selectedAssetPrintId;
  select.innerHTML = '<option value="all">📋 พิมพ์รวมทุกรายการ</option>';

  assetList.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = String(item.id);
    opt.textContent = `🏷️ [${item.asset_code || '-'}] ${item.asset_name}`;
    select.appendChild(opt);
  });

  if (currentVal && (currentVal === 'all' || assetList.some(a => String(a.id) === String(currentVal)))) {
    select.value = currentVal;
  } else {
    select.value = 'all';
    selectedAssetPrintId = 'all';
  }
}

function onAssetPrintSelectChange(val) {
  selectedAssetPrintId = val;
  renderAssetPrint();
}

function printSingleAsset(id) {
  selectedAssetPrintId = String(id);
  const select = document.getElementById('asset-print-select');
  if (select) select.value = selectedAssetPrintId;
  renderAssetPrint();
  window.print();
}

function triggerPrintAsset() {
  renderAssetPrint();
  window.print();
}

function renderAssetPrint() {
  const printTbody = document.getElementById('print-asset-table-body');
  if (!printTbody) return;
  printTbody.innerHTML = '';
  const TARGET_ROWS = 15;

  let printItems = [];

  if (selectedAssetPrintId === 'all') {
    // พิมพ์รวมทุกรายการ
    printItems = assetList;
    if (assetList.length > 0) {
      updateAssetHeaderCard(assetList[selectedAssetIndex] || assetList[0]);
    } else {
      updateAssetHeaderCard(null);
    }
  } else {
    // พิมพ์เฉพาะรายการที่เลือก (บัตรเดี่ยวตามแบบฟอร์มราชการ)
    const found = assetList.find(a => String(a.id) === String(selectedAssetPrintId));
    if (found) {
      printItems = [found];
      updateAssetHeaderCard(found);
    } else {
      printItems = assetList;
      updateAssetHeaderCard(assetList[0] || null);
    }
  }

  printItems.forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="text-center font-normal whitespace-nowrap">${formatThaiDate(item.received_date)}</td>
      <td class="text-center font-normal">${item.doc_no || ''}</td>
      <td class="text-left font-medium">${item.asset_name || ''}</td>
      <td class="text-center">${item.qty || 1}</td>
      <td class="text-right whitespace-nowrap">${item.cost ? Number(item.cost).toLocaleString('th-TH', {minimumFractionDigits: 2}) : '-'}</td>
      <td class="text-right whitespace-nowrap">${item.total_cost ? Number(item.total_cost).toLocaleString('th-TH', {minimumFractionDigits: 2}) : '-'}</td>
      <td class="text-center">${item.useful_life ? item.useful_life + ' ปี' : ''}</td>
      <td class="text-center">${item.depr_rate || '20%'}</td>
      <td class="text-right whitespace-nowrap text-slate-600">${item.acc_depr ? Number(item.acc_depr).toLocaleString('th-TH', {minimumFractionDigits: 2}) : '0.00'}</td>
      <td class="text-right font-bold text-black whitespace-nowrap">${item.net_book_value ? Number(item.net_book_value).toLocaleString('th-TH', {minimumFractionDigits: 2}) : '-'}</td>
      <td class="text-left">${item.remark || item.location || ''}</td>
    `;
    printTbody.appendChild(tr);
  });

  // เติมแถวว่างให้ครบ 15 แถวสำหรับการพิมพ์
  const emptyRowsCount = Math.max(0, TARGET_ROWS - printItems.length);
  for (let i = 0; i < emptyRowsCount; i++) {
    const tr = document.createElement('tr');
    tr.className = 'empty-row';
    tr.innerHTML = `
      <td class="text-center">&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
    `;
    printTbody.appendChild(tr);
  }
}

// ==================== ทะเบียนคุมทรัพย์สิน (ครุภัณฑ์) ====================
async function loadAssets() {
  try {
    const res = await fetch('/api/assets');
    assetList = await res.json();

    // 1. เรนเดอร์บนหน้าจอหลัก (Screen View - แบบเดิมที่คุณชอบ 100%)
    const screenTbody = document.getElementById('screen-asset-table-body');
    screenTbody.innerHTML = '';

    assetList.forEach((item, index) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 border-b cursor-pointer';
      tr.onclick = (e) => {
        // เมื่อคลิกแถวในหน้าจอ จะอัปเดตหัวบัตรพิมพ์ตามรายการนี้
        if (!e.target.closest('button')) {
          selectedAssetIndex = index;
          if (selectedAssetPrintId === 'all') {
            updateAssetHeaderCard(item);
          }
        }
      };

      tr.innerHTML = `
        <td class="p-2 border text-center">${index + 1}</td>
        <td class="p-2 border">${item.received_date || ''}</td>
        <td class="p-2 border font-semibold">${item.asset_code || ''}</td>
        <td class="p-2 border">${item.asset_name || ''}</td>
        <td class="p-2 border">${item.spec || ''}</td>
        <td class="p-2 border">${item.doc_no || ''}</td>
        <td class="p-2 border text-right">${Number(item.cost).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
        <td class="p-2 border text-center">${item.useful_life}</td>
        <td class="p-2 border text-right text-slate-500">${Number(item.depr_per_year).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
        <td class="p-2 border text-right font-bold text-indigo-700">${Number(item.net_book_value).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
        <td class="p-2 border">${item.location || ''}</td>
        <td class="p-2 border text-center">
          <span class="px-2 py-0.5 rounded text-xs ${item.status === 'ใช้งานได้ดี' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
            ${item.status}
          </span>
        </td>
        <td class="p-2 border">${item.responsible_person || ''}</td>
        <td class="p-2 border text-center whitespace-nowrap space-x-1">
          <button onclick="printSingleAsset(${item.id})" class="text-blue-600 hover:text-blue-800 p-1 font-semibold rounded hover:bg-blue-50" title="พิมพ์บัตรรายการนี้">🖨️</button>
          <button onclick="editAsset(${item.id})" class="text-amber-600 hover:text-amber-800 p-1 font-semibold rounded hover:bg-amber-50" title="แก้ไขรายการนี้">✏️</button>
          <button onclick="deleteAsset(${item.id})" class="text-red-500 hover:text-red-700 p-1 font-semibold rounded hover:bg-red-50" title="ลบรายการ">🗑️</button>
        </td>
      `;
      screenTbody.appendChild(tr);
    });

    // 2. อัปเดต Dropdown เลือกพิมพ์
    updateAssetPrintDropdown();

    // 3. เรนเดอร์ส่วนพิมพ์
    renderAssetPrint();

  } catch (err) {
    console.error('Error loading assets:', err);
  }
}

function openAddAssetModal() {
  document.getElementById('edit_asset_id').value = '';
  document.getElementById('modal-asset-title').innerText = '➕ ลงทะเบียนครุภัณฑ์ใหม่';
  document.getElementById('modal-asset-submit-btn').innerText = '💾 บันทึกข้อมูล';
  document.getElementById('form-asset').reset();
  document.getElementById('a_date').value = new Date().toISOString().split('T')[0];
  document.getElementById('a_qty').value = '1';
  document.getElementById('a_life').value = '5';
  openModal('assetModal');
}

function editAsset(id) {
  const item = assetList.find(a => a.id === id);
  if (!item) return;

  document.getElementById('edit_asset_id').value = item.id;
  document.getElementById('modal-asset-title').innerText = '✏️ แก้ไขข้อมูลครุภัณฑ์';
  document.getElementById('modal-asset-submit-btn').innerText = '💾 บันทึกการแก้ไข';

  document.getElementById('a_name').value = item.asset_name || '';
  document.getElementById('a_code').value = item.asset_code || '';
  document.getElementById('a_category').value = item.category || '';
  document.getElementById('a_spec').value = item.spec || '';
  document.getElementById('a_model').value = item.model || '';
  document.getElementById('a_date').value = item.received_date || '';
  document.getElementById('a_doc').value = item.doc_no || '';
  document.getElementById('a_qty').value = item.qty || 1;
  document.getElementById('a_cost').value = item.cost || 0;
  document.getElementById('a_life').value = item.useful_life || 5;
  document.getElementById('a_location').value = item.location || '';
  document.getElementById('a_status').value = item.status || 'ใช้งานได้ดี';
  document.getElementById('a_vendor').value = item.vendor || '';
  document.getElementById('a_person').value = item.responsible_person || '';
  document.getElementById('a_vendor_address').value = item.vendor_address || '';
  document.getElementById('a_vendor_phone').value = item.vendor_phone || '';
  document.getElementById('a_budget_source').value = item.budget_source || 'เงินงบประมาณ';
  document.getElementById('a_acquisition_method').value = item.acquisition_method || 'เฉพาะเจาะจง';
  document.getElementById('a_remark').value = item.remark || '';

  openModal('assetModal');
}

async function saveAsset(e) {
  e.preventDefault();
  const editId = document.getElementById('edit_asset_id').value;
  const body = {
    asset_name: document.getElementById('a_name').value.trim(),
    asset_code: document.getElementById('a_code').value.trim(),
    category: document.getElementById('a_category').value.trim() || 'ครุภัณฑ์คอมพิวเตอร์',
    spec: document.getElementById('a_spec').value.trim(),
    model: document.getElementById('a_model').value.trim(),
    received_date: document.getElementById('a_date').value,
    doc_no: document.getElementById('a_doc').value.trim(),
    qty: parseInt(document.getElementById('a_qty').value) || 1,
    cost: parseFloat(document.getElementById('a_cost').value) || 0,
    useful_life: parseInt(document.getElementById('a_life').value) || 5,
    location: document.getElementById('a_location').value.trim(),
    status: document.getElementById('a_status').value,
    vendor: document.getElementById('a_vendor').value.trim(),
    vendor_address: document.getElementById('a_vendor_address').value.trim(),
    vendor_phone: document.getElementById('a_vendor_phone').value.trim(),
    budget_source: document.getElementById('a_budget_source').value,
    acquisition_method: document.getElementById('a_acquisition_method').value,
    responsible_person: document.getElementById('a_person').value.trim(),
    remark: document.getElementById('a_remark').value.trim()
  };

  const url = editId ? `/api/assets/${editId}` : '/api/assets';
  const method = editId ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (res.ok) {
    closeModal('assetModal');
    loadAssets();
  } else {
    const err = await res.json();
    alert('เกิดข้อผิดพลาด: ' + (err.error || 'ไม่สามารถบันทึกได้'));
  }
}

async function deleteAsset(id) {
  if (!confirm('ยืนยันที่จะลบรายการครุภัณฑ์นี้หรือไม่?')) return;
  await fetch(`/api/assets/${id}`, { method: 'DELETE' });
  loadAssets();
}

// ==================== บัญชีคุมวัสดุ ====================
async function loadMaterials() {
  try {
    const res = await fetch('/api/materials');
    materialList = await res.json();

    // 1. หน้าจอหลัก (Screen View)
    const screenTbody = document.getElementById('screen-material-table-body');
    screenTbody.innerHTML = '';

    materialList.forEach((item) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 border-b';
      tr.innerHTML = `
        <td class="p-2 border">${item.trans_date || ''}</td>
        <td class="p-2 border font-semibold">${item.party || ''}</td>
        <td class="p-2 border">${item.doc_no || ''}</td>
        <td class="p-2 border">${item.budget_type || ''}</td>
        <td class="p-2 border text-center">${item.opening_stock || 0}</td>
        <td class="p-2 border text-center text-green-600 font-semibold">${item.qty_in || 0}</td>
        <td class="p-2 border text-center text-red-600 font-semibold">${item.qty_out || 0}</td>
        <td class="p-2 border text-center font-bold bg-slate-100">${item.balance}</td>
        <td class="p-2 border text-right">${Number(item.unit_price).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
        <td class="p-2 border text-right font-bold text-emerald-700">${Number(item.total_amount).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
        <td class="p-2 border text-slate-500">${item.remark || ''}</td>
        <td class="p-2 border text-center whitespace-nowrap space-x-1">
          <button onclick="editMaterial(${item.id})" class="text-amber-600 hover:text-amber-800 p-1 font-semibold rounded hover:bg-amber-50" title="แก้ไขรายการนี้">✏️</button>
          <button onclick="deleteMaterial(${item.id})" class="text-red-500 hover:text-red-700 p-1 font-semibold rounded hover:bg-red-50" title="ลบรายการ">🗑️</button>
        </td>
      `;
      screenTbody.appendChild(tr);
    });

    // 2. สำหรับพิมพ์
    const printTbody = document.getElementById('print-material-table-body');
    printTbody.innerHTML = '';
    const TARGET_ROWS = 15;

    materialList.forEach((item, index) => {
      const openStock = (index === 0 && item.opening_stock > 0) ? item.opening_stock : (item.opening_stock || '');
      const qtyIn = item.qty_in > 0 ? item.qty_in : '';
      const qtyOut = item.qty_out > 0 ? item.qty_out : '';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-center whitespace-nowrap">${formatThaiDate(item.trans_date)}</td>
        <td class="text-left font-medium">${item.party || ''}</td>
        <td class="text-center">${item.doc_no || ''}</td>
        <td class="text-left">${item.budget_type || ''}</td>
        <td class="text-center">${openStock}</td>
        <td class="text-center text-green-700 font-semibold">${qtyIn}</td>
        <td class="text-center text-red-700 font-semibold">${qtyOut}</td>
        <td class="text-center font-bold bg-slate-50">${item.balance}</td>
        <td class="text-right whitespace-nowrap">${item.unit_price ? Number(item.unit_price).toLocaleString('th-TH', {minimumFractionDigits: 2}) : ''}</td>
        <td class="text-right font-bold text-emerald-800 whitespace-nowrap">${item.total_amount ? Number(item.total_amount).toLocaleString('th-TH', {minimumFractionDigits: 2}) : ''}</td>
        <td class="text-left">${item.remark || ''}</td>
      `;
      printTbody.appendChild(tr);
    });

    const emptyRowsCount = Math.max(0, TARGET_ROWS - materialList.length);
    for (let i = 0; i < emptyRowsCount; i++) {
      const tr = document.createElement('tr');
      tr.className = 'empty-row';
      tr.innerHTML = `
        <td class="text-center">&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
      `;
      printTbody.appendChild(tr);
    }
  } catch (err) {
    console.error('Error loading materials:', err);
  }
}

function openAddMaterialModal() {
  document.getElementById('edit_material_id').value = '';
  document.getElementById('modal-material-title').innerText = '➕ บันทึกรายการบัญชีคุมวัสดุ';
  document.getElementById('modal-material-submit-btn').innerText = '💾 บันทึกข้อมูล';
  document.getElementById('form-material').reset();
  document.getElementById('m_date').value = new Date().toISOString().split('T')[0];
  document.getElementById('m_open').value = '0';
  document.getElementById('m_in').value = '0';
  document.getElementById('m_out').value = '0';
  openModal('materialModal');
}

function editMaterial(id) {
  const item = materialList.find(m => m.id === id);
  if (!item) return;

  document.getElementById('edit_material_id').value = item.id;
  document.getElementById('modal-material-title').innerText = '✏️ แก้ไขรายการบัญชีคุมวัสดุ';
  document.getElementById('modal-material-submit-btn').innerText = '💾 บันทึกการแก้ไข';

  document.getElementById('m_date').value = item.trans_date || '';
  document.getElementById('m_party').value = item.party || '';
  document.getElementById('m_doc').value = item.doc_no || '';
  document.getElementById('m_budget').value = item.budget_type || '';
  document.getElementById('m_open').value = item.opening_stock || 0;
  document.getElementById('m_price').value = item.unit_price || 0;
  document.getElementById('m_in').value = item.qty_in || 0;
  document.getElementById('m_out').value = item.qty_out || 0;
  document.getElementById('m_remark').value = item.remark || '';

  openModal('materialModal');
}

async function saveMaterial(e) {
  e.preventDefault();
  const editId = document.getElementById('edit_material_id').value;
  const body = {
    trans_date: document.getElementById('m_date').value,
    material_code: '',
    material_name: '',
    party: document.getElementById('m_party').value.trim(),
    doc_no: document.getElementById('m_doc').value.trim(),
    budget_type: document.getElementById('m_budget').value.trim(),
    opening_stock: parseInt(document.getElementById('m_open').value) || 0,
    qty_in: parseInt(document.getElementById('m_in').value) || 0,
    qty_out: parseInt(document.getElementById('m_out').value) || 0,
    unit_price: parseFloat(document.getElementById('m_price').value) || 0,
    remark: document.getElementById('m_remark').value.trim()
  };

  const url = editId ? `/api/materials/${editId}` : '/api/materials';
  const method = editId ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (res.ok) {
    closeModal('materialModal');
    loadMaterials();
  } else {
    const err = await res.json();
    alert('เกิดข้อผิดพลาด: ' + (err.error || 'ไม่สามารถบันทึกได้'));
  }
}

async function deleteMaterial(id) {
  if (!confirm('ยืนยันที่จะลบรายการวัสดุนี้หรือไม่?')) return;
  await fetch(`/api/materials/${id}`, { method: 'DELETE' });
  loadMaterials();
}

// ==================== สำรอง & กู้คืนข้อมูล ====================
async function exportBackup() {
  try {
    const res = await fetch('/api/backup');
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `สำรองข้อมูลพัสดุ_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการดาวน์โหลดข้อมูลสำรอง');
  }
}

async function importBackup() {
  const fileInput = document.getElementById('restore-file-input');
  if (!fileInput.files || fileInput.files.length === 0) {
    alert('กรุณาเลือกไฟล์ .json ที่ต้องการกู้คืนข้อมูล');
    return;
  }

  const file = fileInput.files[0];
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.assets || !data.materials) {
        alert('ไฟล์สำรองไม่ถูกต้อง (ไม่พบข้อมูล assets หรือ materials)');
        return;
      }

      if (!confirm('ยืนยันที่จะกู้คืนข้อมูลหรือไม่? ข้อมูลปัจจุบันในระบบจะถูกแทนที่ด้วยข้อมูลจากไฟล์นี้')) {
        return;
      }

      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const resData = await res.json();

      if (res.ok) {
        alert(resData.message || 'กู้คืนข้อมูลสำเร็จ');
        closeModal('restoreModal');
        fileInput.value = '';
        loadAssets();
        loadMaterials();
      } else {
        alert('เกิดข้อผิดพลาด: ' + resData.error);
      }
    } catch (err) {
      alert('ไม่สามารถอ่านไฟล์ได้ กรุณาตรวจสอบว่าเป็นไฟล์ JSON ที่ถูกต้อง');
    }
  };
  reader.readAsText(file);
}

// ==================== Modal Helpers ====================
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}
