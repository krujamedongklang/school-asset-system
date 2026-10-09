// ค่าเริ่มต้นของส่วนราชการและหน่วยงาน (สำหรับแบบฟอร์มพิมพ์)
const DEFAULT_ORG = 'สำนักงานส่งเสริมการศึกษานอกระบบและการศึกษาตามอัธยาศัย';
const DEFAULT_DEPT = 'สำนักงานส่งเสริมการศึกษานอกระบบและการศึกษาตามอัธยาศัยจังหวัดนครราชสีมา';

// ฟังก์ชันล้างข้อความ: ถ้าเป็นค่าว่าง หรือผู้ใช้พิมพ์จุด/ขีด/จุดไข่ปลาซ้ำๆ มา ให้แปลงเป็นค่าว่าง '' เพื่อให้เส้นประด้านล่างว่างเปล่า
function cleanFieldText(val) {
  if (val === undefined || val === null) return '';
  const str = String(val).trim();
  if (!str) return '';
  // ถ้ามีแต่จุด . หรือขีด _ หรือขีด - (ซ้ำๆ 2 ตัวขึ้นไป) หรือจุดไข่ปลา … ให้ถือว่าว่างเปล่า
  if (/^[\.\s_…]+$/.test(str) || /^-{2,}$/.test(str)) return '';
  return str;
}

let currentTab = 'asset';
let assetList = [];
let materialList = [];

// ชุดเก็บ ID รายการที่ถูกติ๊กเลือกสำหรับพิมพ์
let selectedAssetIds = new Set();
let selectedMaterialIds = new Set();

// รูปแบบการพิมพ์ครุภัณฑ์ ('single-pages' = แยกแผ่นละ 1 รายการ, 'combined-table' = รวมในตารางเดียว)
let assetPrintMode = 'single-pages';

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

    btnAsset.className = 'flex-1 sm:flex-initial text-center justify-center px-3 py-2 sm:px-4 sm:py-2 bg-gradient-to-r from-amber-400 via-amber-400 to-amber-500 text-red-950 font-bold rounded-xl shadow-md hover:from-amber-300 hover:to-amber-400 transition text-xs sm:text-sm whitespace-nowrap';
    btnMaterial.className = 'flex-1 sm:flex-initial text-center justify-center px-3 py-2 sm:px-4 sm:py-2 bg-red-950/70 hover:bg-red-800/80 text-amber-100 font-medium rounded-xl border border-amber-400/20 transition text-xs sm:text-sm whitespace-nowrap';
  } else {
    screenAsset.classList.add('hidden');
    screenMaterial.classList.remove('hidden');
    printAsset.classList.add('hidden');
    printAsset.classList.remove('block');
    printMaterial.classList.remove('hidden');
    printMaterial.classList.add('block');

    btnAsset.className = 'flex-1 sm:flex-initial text-center justify-center px-3 py-2 sm:px-4 sm:py-2 bg-red-950/70 hover:bg-red-800/80 text-amber-100 font-medium rounded-xl border border-amber-400/20 transition text-xs sm:text-sm whitespace-nowrap';
    btnMaterial.className = 'flex-1 sm:flex-initial text-center justify-center px-3 py-2 sm:px-4 sm:py-2 bg-gradient-to-r from-amber-400 via-amber-400 to-amber-500 text-red-950 font-bold rounded-xl shadow-md hover:from-amber-300 hover:to-amber-400 transition text-xs sm:text-sm whitespace-nowrap';
  }
}

// ==================== ส่วนราชการ & หน่วยงาน (สำหรับพิมพ์) ====================
function initOrgSettings() {
  const org = cleanFieldText(localStorage.getItem('gov_org')) || DEFAULT_ORG;
  const dept = cleanFieldText(localStorage.getItem('gov_dept')) || DEFAULT_DEPT;

  const orgMat = document.getElementById('org-name-material');
  const deptMat = document.getElementById('dept-name-material');
  if (orgMat) orgMat.innerHTML = org || '&nbsp;';
  if (deptMat) deptMat.innerHTML = dept || '&nbsp;';

  const inpOrg = document.getElementById('inp-org-name');
  const inpDept = document.getElementById('inp-dept-name');
  if (inpOrg) inpOrg.value = org;
  if (inpDept) inpDept.value = dept;
}

function saveOrgSettings(e) {
  e.preventDefault();
  const org = cleanFieldText(document.getElementById('inp-org-name').value) || DEFAULT_ORG;
  const dept = cleanFieldText(document.getElementById('inp-dept-name').value) || DEFAULT_DEPT;

  localStorage.setItem('gov_org', org);
  localStorage.setItem('gov_dept', dept);

  initOrgSettings();
  renderAssetPrint();
  closeModal('orgModal');
}

// ==================== หัวบัตรวัสดุ (สำหรับพิมพ์) ====================
function initMaterialMeta() {
  const meta = JSON.parse(localStorage.getItem('material_card_meta') || '{}');
  
  const setField = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    const clean = cleanFieldText(val);
    el.innerHTML = clean || '&nbsp;';
  };

  setField('disp-category', meta.category);
  setField('disp-code', meta.code);
  setField('disp-name', meta.name);
  setField('disp-minmax', meta.minmax);
  setField('disp-spec', meta.spec);
  setField('disp-location', meta.location);
  setField('disp-unit', meta.unit);

  document.getElementById('inp-meta-category').value = cleanFieldText(meta.category);
  document.getElementById('inp-meta-code').value = cleanFieldText(meta.code);
  document.getElementById('inp-meta-name').value = cleanFieldText(meta.name);
  document.getElementById('inp-meta-minmax').value = cleanFieldText(meta.minmax);
  document.getElementById('inp-meta-spec').value = cleanFieldText(meta.spec);
  document.getElementById('inp-meta-location').value = cleanFieldText(meta.location);
  document.getElementById('inp-meta-unit').value = cleanFieldText(meta.unit);
}

function saveMaterialMeta(e) {
  e.preventDefault();
  const meta = {
    category: cleanFieldText(document.getElementById('inp-meta-category').value),
    code: cleanFieldText(document.getElementById('inp-meta-code').value),
    name: cleanFieldText(document.getElementById('inp-meta-name').value),
    minmax: cleanFieldText(document.getElementById('inp-meta-minmax').value),
    spec: cleanFieldText(document.getElementById('inp-meta-spec').value),
    location: cleanFieldText(document.getElementById('inp-meta-location').value),
    unit: cleanFieldText(document.getElementById('inp-meta-unit').value)
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

// ==================== ตัวแปรและฟังก์ชันระบบปีงบประมาณและค้นหา ====================
const START_FISCAL_YEAR = 2570; // เริ่มต้นที่ปีงบประมาณ 2570 (ปีงบ 70)
let assetFiscalYear = '2570';
let assetMonth = 'all';
let materialFiscalYear = '2570';
let materialMonth = 'all';

let assetSearchQuery = '';
let materialSearchQuery = '';

function getCurrentFiscalYear() {
  const now = new Date();
  const beYear = now.getFullYear() + 543;
  const month = now.getMonth() + 1;
  return month >= 10 ? beYear + 1 : beYear;
}

// แยกปีงบประมาณและเดือนจากวันที่ (ต.ค.-ธ.ค. นับเป็นปีงบของ พ.ศ. ถัดไป)
function getFiscalYearAndMonth(dateStr) {
  if (!dateStr) return { fiscalYear: null, month: null, beYear: null };
  let year, month;
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const parts = dateStr.split('-');
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
  } else {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { fiscalYear: null, month: null, beYear: null };
    year = d.getFullYear();
    month = d.getMonth() + 1;
  }

  const beYear = year < 2400 ? year + 543 : year;
  const fiscalYear = month >= 10 ? beYear + 1 : beYear;
  return { fiscalYear, month, beYear };
}

// รวมปีงบประมาณ เริ่มต้นที่ 2570 และเพิ่มปีถัดไปข้างหน้าอัตโนมัติ
function getAvailableFiscalYears(dataList, dateField) {
  const currentFY = getCurrentFiscalYear();
  const yearsSet = new Set();

  // ปีเริ่มต้น 2570 (ปีงบ 70) เสมอ
  yearsSet.add(START_FISCAL_YEAR);

  // เพิ่มปีปัจจุบัน และเพิ่มปีถัดไปข้างหน้าอัตโนมัติ
  const maxBase = Math.max(currentFY, START_FISCAL_YEAR);
  yearsSet.add(maxBase);
  yearsSet.add(maxBase + 1); // ปีถัดไปเพิ่มอัตโนมัติ

  // ดึงปีงบประมาณจากข้อมูลทั้งหมดในระบบ
  if (Array.isArray(dataList)) {
    dataList.forEach(item => {
      const dateVal = item[dateField];
      if (dateVal) {
        const { fiscalYear } = getFiscalYearAndMonth(dateVal);
        if (fiscalYear) {
          yearsSet.add(fiscalYear);
        }
      }
    });
  }

  return Array.from(yearsSet).sort((a, b) => b - a);
}

// อัปเดตตัวเลือกใน Dropdown ปีงบประมาณ
function populateFiscalYearOptions(tab) {
  const selectId = tab === 'asset' ? 'asset-fiscal-year-select' : 'material-fiscal-year-select';
  const selectEl = document.getElementById(selectId);
  if (!selectEl) return;

  const dataList = tab === 'asset' ? assetList : materialList;
  const dateField = tab === 'asset' ? 'received_date' : 'trans_date';
  const availableYears = getAvailableFiscalYears(dataList, dateField);
  const currentVal = tab === 'asset' ? assetFiscalYear : materialFiscalYear;

  selectEl.innerHTML = '';

  const optAll = document.createElement('option');
  optAll.value = 'all';
  optAll.innerText = 'ทุกปีงบประมาณ (ทั้งหมด)';
  selectEl.appendChild(optAll);

  availableYears.forEach(year => {
    const opt = document.createElement('option');
    opt.value = String(year);
    const shortYear = String(year).slice(-2);
    opt.innerText = `ปีงบประมาณ ${year} (ปีงบ ${shortYear})`;
    selectEl.appendChild(opt);
  });

  if (currentVal === 'all') {
    selectEl.value = 'all';
  } else if (availableYears.includes(parseInt(currentVal, 10))) {
    selectEl.value = currentVal;
  } else if (availableYears.includes(START_FISCAL_YEAR)) {
    selectEl.value = String(START_FISCAL_YEAR);
    if (tab === 'asset') assetFiscalYear = String(START_FISCAL_YEAR);
    else materialFiscalYear = String(START_FISCAL_YEAR);
  } else {
    selectEl.value = 'all';
    if (tab === 'asset') assetFiscalYear = 'all';
    else materialFiscalYear = 'all';
  }
}

function onAssetFilterChange() {
  const fySelect = document.getElementById('asset-fiscal-year-select');
  const mSelect = document.getElementById('asset-month-select');
  if (fySelect) assetFiscalYear = fySelect.value;
  if (mSelect) assetMonth = mSelect.value;
  renderAssetTable();
  updateAssetSelectionUI();
}

function onMaterialFilterChange() {
  const fySelect = document.getElementById('material-fiscal-year-select');
  const mSelect = document.getElementById('material-month-select');
  if (fySelect) materialFiscalYear = fySelect.value;
  if (mSelect) materialMonth = mSelect.value;
  renderMaterialTable();
  updateMaterialSelectionUI();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function onAssetSearch(val) {
  assetSearchQuery = val || '';
  renderAssetTable();
  updateAssetSelectionUI();
}

function clearAssetSearch() {
  assetSearchQuery = '';
  const inp = document.getElementById('asset-search-input');
  if (inp) inp.value = '';
  renderAssetTable();
  updateAssetSelectionUI();
}

function onMaterialSearch(val) {
  materialSearchQuery = val || '';
  renderMaterialTable();
  updateMaterialSelectionUI();
}

function clearMaterialSearch() {
  materialSearchQuery = '';
  const inp = document.getElementById('material-search-input');
  if (inp) inp.value = '';
  renderMaterialTable();
  updateMaterialSelectionUI();
}

function getFilteredAssets() {
  return assetList.filter(item => {
    // 1. กรองปีงบประมาณ
    if (assetFiscalYear !== 'all') {
      const { fiscalYear } = getFiscalYearAndMonth(item.received_date);
      if (String(fiscalYear) !== String(assetFiscalYear)) {
        return false;
      }
    }

    // 2. กรองเดือน
    if (assetMonth !== 'all') {
      const { month } = getFiscalYearAndMonth(item.received_date);
      if (String(month) !== String(assetMonth)) {
        return false;
      }
    }

    // 3. กรองคำค้นหา
    if (assetSearchQuery && assetSearchQuery.trim()) {
      const q = assetSearchQuery.trim().toLowerCase();
      const match =
        (item.asset_name && item.asset_name.toLowerCase().includes(q)) ||
        (item.asset_code && item.asset_code.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q)) ||
        (item.spec && item.spec.toLowerCase().includes(q)) ||
        (item.location && item.location.toLowerCase().includes(q)) ||
        (item.responsible_person && item.responsible_person.toLowerCase().includes(q)) ||
        (item.doc_no && item.doc_no.toLowerCase().includes(q)) ||
        (item.vendor && item.vendor.toLowerCase().includes(q)) ||
        (item.status && item.status.toLowerCase().includes(q));
      if (!match) return false;
    }

    return true;
  });
}

function getFilteredMaterials() {
  return materialList.filter(item => {
    // 1. กรองปีงบประมาณ
    if (materialFiscalYear !== 'all') {
      const { fiscalYear } = getFiscalYearAndMonth(item.trans_date);
      if (String(fiscalYear) !== String(materialFiscalYear)) {
        return false;
      }
    }

    // 2. กรองเดือน
    if (materialMonth !== 'all') {
      const { month } = getFiscalYearAndMonth(item.trans_date);
      if (String(month) !== String(materialMonth)) {
        return false;
      }
    }

    // 3. กรองคำค้นหา
    if (materialSearchQuery && materialSearchQuery.trim()) {
      const q = materialSearchQuery.trim().toLowerCase();
      const match =
        (item.party && item.party.toLowerCase().includes(q)) ||
        (item.doc_no && item.doc_no.toLowerCase().includes(q)) ||
        (item.budget_type && item.budget_type.toLowerCase().includes(q)) ||
        (item.remark && item.remark.toLowerCase().includes(q)) ||
        (item.trans_date && item.trans_date.toLowerCase().includes(q));
      if (!match) return false;
    }

    return true;
  });
}

// ==============================================================
// ทะเบียนคุมทรัพย์สิน (ครุภัณฑ์)
// ==============================================================
async function loadAssets() {
  try {
    const res = await fetch('/api/assets');
    assetList = await res.json();

    // เริ่มต้น: ติ๊กเลือกทุกรายการไว้เป็นค่าเริ่มต้น (ถ้ายังไม่ได้เลือก)
    if (selectedAssetIds.size === 0) {
      assetList.forEach(a => selectedAssetIds.add(a.id));
    } else {
      // ลบ ID ที่ไม่มีอยู่ออก
      const validIds = new Set(assetList.map(a => a.id));
      selectedAssetIds = new Set([...selectedAssetIds].filter(id => validIds.has(id)));
    }

    populateFiscalYearOptions('asset');
    renderAssetTable();
    updateAssetSelectionUI();
    renderAssetPrint();
  } catch (err) {
    console.error('Error loading assets:', err);
  }
}

// เรนเดอร์ตารางบนหน้าจอเว็บ (กรองตามปีงบประมาณ, เดือน, และคำค้นหาอัตโนมัติ)
function renderAssetTable() {
  const screenTbody = document.getElementById('screen-asset-table-body');
  if (!screenTbody) return;
  screenTbody.innerHTML = '';

  const list = getFilteredAssets();
  const clearBtn = document.getElementById('asset-search-clear-btn');
  const countSpan = document.getElementById('asset-search-result-count');

  if (clearBtn) {
    if (assetSearchQuery.trim()) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');
  }

  if (countSpan) {
    const isFiltered = assetFiscalYear !== 'all' || assetMonth !== 'all' || assetSearchQuery.trim();
    if (isFiltered) {
      countSpan.innerHTML = `แสดง <span class="font-bold text-amber-800">${list.length}</span> รายการ (จากทั้งหมด ${assetList.length} รายการ)`;
    } else {
      countSpan.innerHTML = `ทั้งหมด <span class="font-bold text-slate-700">${assetList.length}</span> รายการ`;
    }
  }

  if (list.length === 0) {
    const tr = document.createElement('tr');
    let msg = '🔍 ไม่พบรายการครุภัณฑ์ในเงื่อนไขที่เลือก';
    if (assetFiscalYear !== 'all') {
      msg += ` (ปีงบ ${String(assetFiscalYear).slice(-2)})`;
    }
    if (assetMonth !== 'all') {
      const monthNames = {'10':'ต.ค.','11':'พ.ย.','12':'ธ.ค.','1':'ม.ค.','2':'ก.พ.','3':'มี.ค.','4':'เม.ย.','5':'พ.ค.','6':'มิ.ย.','7':'ก.ค.','8':'ส.ค.','9':'ก.ย.'};
      msg += ` ประจำเดือน ${monthNames[assetMonth] || assetMonth}`;
    }
    if (assetSearchQuery.trim()) {
      msg += ` คำค้น "${escapeHtml(assetSearchQuery)}"`;
    }
    tr.innerHTML = `
      <td colspan="15" class="p-8 text-center text-slate-400 text-xs sm:text-sm">
        ${msg}
      </td>
    `;
    screenTbody.appendChild(tr);
    return;
  }

  list.forEach((item, index) => {
    const isSelected = selectedAssetIds.has(item.id);
    const tr = document.createElement('tr');
    tr.className = `hover:bg-amber-50/60 border-b border-amber-100/70 cursor-pointer transition ${isSelected ? 'bg-amber-50/40' : ''}`;
    
    // คลิกแถวเพื่อเปิด/ปิดการติ๊กเลือก
    tr.onclick = (e) => {
      if (!e.target.closest('button, input')) {
        toggleAssetItemSelection(item.id);
      }
    };

    tr.innerHTML = `
      <td class="p-2 border border-slate-200 text-center" onclick="event.stopPropagation()">
        <input type="checkbox" class="w-4 h-4 accent-amber-500 rounded cursor-pointer" 
          ${isSelected ? 'checked' : ''} 
          onchange="toggleAssetItemSelection(${item.id}, this.checked)">
      </td>
      <td class="p-2 border border-slate-200 text-center font-medium">${index + 1}</td>
      <td class="p-2 border border-slate-200">${item.received_date || ''}</td>
      <td class="p-2 border border-slate-200 font-bold text-red-950">${item.asset_code || ''}</td>
      <td class="p-2 border border-slate-200 font-medium">${item.asset_name || ''}</td>
      <td class="p-2 border border-slate-200 text-slate-600">${item.spec || ''}</td>
      <td class="p-2 border border-slate-200">${item.doc_no || ''}</td>
      <td class="p-2 border border-slate-200 text-right font-medium">${Number(item.cost).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
      <td class="p-2 border border-slate-200 text-center">${item.useful_life}</td>
      <td class="p-2 border border-slate-200 text-right text-slate-500">${Number(item.depr_per_year).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
      <td class="p-2 border border-slate-200 text-right font-bold text-red-900">${Number(item.net_book_value).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
      <td class="p-2 border border-slate-200">${item.location || ''}</td>
      <td class="p-2 border border-slate-200 text-center">
        <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold shadow-2xs ${item.status === 'ใช้งานได้ดี' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-rose-100 text-rose-800 border border-rose-300'}">
          ${item.status}
        </span>
      </td>
      <td class="p-2 border border-slate-200">${item.responsible_person || ''}</td>
      <td class="p-2 border border-slate-200 text-center whitespace-nowrap space-x-1" onclick="event.stopPropagation()">
        <button onclick="printSingleAsset(${item.id})" class="text-amber-600 hover:text-amber-800 p-1.5 font-semibold rounded-lg hover:bg-amber-100 transition shadow-2xs" title="พิมพ์บัตรรายการนี้เฉพาะใบเดียว">🖨️</button>
        <button onclick="editAsset(${item.id})" class="text-red-700 hover:text-red-900 p-1.5 font-semibold rounded-lg hover:bg-red-100 transition shadow-2xs" title="แก้ไขรายการนี้">✏️</button>
        <button onclick="deleteAsset(${item.id})" class="text-slate-400 hover:text-rose-600 p-1.5 font-semibold rounded-lg hover:bg-rose-50 transition shadow-2xs" title="ลบรายการ">🗑️</button>
      </td>
    `;
    screenTbody.appendChild(tr);
  });
}

// ติ๊กเลือก/ไม่เลือก แต่ละแถว
function toggleAssetItemSelection(id, explicitChecked = null) {
  if (explicitChecked !== null) {
    if (explicitChecked) selectedAssetIds.add(id);
    else selectedAssetIds.delete(id);
  } else {
    if (selectedAssetIds.has(id)) selectedAssetIds.delete(id);
    else selectedAssetIds.add(id);
  }
  renderAssetTable();
  updateAssetSelectionUI();
  renderAssetPrint();
}

// ติ๊กเลือกทั้งหมด หรือ ยกเลิกทั้งหมด (คำนึงถึงผลการค้นหา)
function toggleSelectAllAssets(isChecked) {
  const list = getFilteredAssets();
  if (isChecked) {
    list.forEach(a => selectedAssetIds.add(a.id));
  } else {
    list.forEach(a => selectedAssetIds.delete(a.id));
  }
  renderAssetTable();
  updateAssetSelectionUI();
  renderAssetPrint();
}

function selectAllAssets(select) {
  const list = getFilteredAssets();
  if (select) {
    list.forEach(a => selectedAssetIds.add(a.id));
  } else {
    list.forEach(a => selectedAssetIds.delete(a.id));
  }
  renderAssetTable();
  updateAssetSelectionUI();
  renderAssetPrint();
}

// อัปเดตข้อความ Badge และปุ่มพิมพ์
function updateAssetSelectionUI() {
  const count = selectedAssetIds.size;
  const badge = document.getElementById('asset-selected-badge');
  const countSpan = document.getElementById('asset-selected-count');
  const btnPrintText = document.getElementById('btn-print-text');
  const selectAllChk = document.getElementById('select-all-asset-chk');

  if (countSpan) countSpan.innerText = count;

  if (badge) {
    if (count > 0) badge.classList.remove('hidden');
    else badge.classList.add('hidden');
  }

  if (btnPrintText) {
    btnPrintText.innerText = count > 0 ? `พิมพ์รายการที่เลือก (${count} รายการ)` : 'พิมพ์รายการที่เลือก';
  }

  if (selectAllChk) {
    const list = getFilteredAssets();
    const visibleSelectedCount = list.filter(a => selectedAssetIds.has(a.id)).length;
    if (list.length > 0 && visibleSelectedCount === list.length) {
      selectAllChk.checked = true;
      selectAllChk.indeterminate = false;
    } else if (visibleSelectedCount > 0 && visibleSelectedCount < list.length) {
      selectAllChk.checked = false;
      selectAllChk.indeterminate = true;
    } else {
      selectAllChk.checked = false;
      selectAllChk.indeterminate = false;
    }
  }
}

function onAssetPrintModeChange() {
  const modeSelect = document.getElementById('asset-print-mode');
  if (modeSelect) assetPrintMode = modeSelect.value;
  renderAssetPrint();
}

// กดพิมพ์รายการที่ติ๊กเลือก (เช่น ติ๊กข้อ 1 กับ 5)
function printSelectedAssets() {
  if (selectedAssetIds.size === 0) {
    alert('กรุณาติ๊กเครื่องหมายถูก ☑️ หน้าแถวของรายการที่ต้องการพิมพ์อย่างน้อย 1 รายการครับ');
    return;
  }
  renderAssetPrint();
  window.print();
}

// กดพิมพ์เฉพาะรายการนั้นใบเดียวทันที (จากปุ่ม 🖨️ ในแถว)
function printSingleAsset(id) {
  const item = assetList.find(a => a.id === id);
  if (!item) return;
  const printAssetSection = document.getElementById('print-asset-section');
  if (printAssetSection) {
    printAssetSection.innerHTML = generateAssetCardHtml(item, false);
  }
  window.print();
}

// ==================== สร้าง HTML สำหรับบัตรพิมพ์ทะเบียนคุมทรัพย์สิน ====================
function renderAssetPrint() {
  const printAssetSection = document.getElementById('print-asset-section');
  if (!printAssetSection) return;

  const selectedItems = assetList.filter(a => selectedAssetIds.has(a.id));

  // ถ้าไม่ได้เลือกรายการใด ให้แสดงแผ่นว่างหรือรายการแรกเป็นตัวอย่าง
  if (selectedItems.length === 0) {
    printAssetSection.innerHTML = generateAssetCardHtml(assetList[0] || null, false);
    return;
  }

  if (assetPrintMode === 'single-pages') {
    // 📄 รูปแบบมาตรฐานราชการ: แยกพิมพ์ 1 แผ่นต่อ 1 ทะเบียนคุมครุภัณฑ์ (แต่ละแผ่นมีข้อมูลหัวบัตร + ตาราง 11 คอลัมน์ 15 บรรทัด)
    printAssetSection.innerHTML = selectedItems.map((item, idx) => {
      const isPageBreak = idx < selectedItems.length - 1;
      return generateAssetCardHtml(item, isPageBreak);
    }).join('');
  } else {
    // 📑 รูปแบบรวมในตารางเดียว: รายการที่เลือกทั้งหมดรวมอยู่ในตาราง 11 คอลัมน์แผ่นเดียวกัน
    printAssetSection.innerHTML = generateCombinedAssetCardHtml(selectedItems);
  }
}

// สร้าง HTML สำหรับ 1 บัตรทะเบียนคุมทรัพย์สิน (แบบฟอร์มตรงตามภาพถ่าย 100%)
function generateAssetCardHtml(item, isPageBreak = false) {
  const org = cleanFieldText(localStorage.getItem('gov_org')) || DEFAULT_ORG;
  const dept = cleanFieldText(localStorage.getItem('gov_dept')) || DEFAULT_DEPT;
  const b = item ? (item.budget_source || 'เงินงบประมาณ') : 'เงินงบประมาณ';
  const m = item ? (item.acquisition_method || 'เฉพาะเจาะจง') : 'เฉพาะเจาะจง';

  const category = cleanFieldText(item?.category) || 'ครุภัณฑ์คอมพิวเตอร์';
  const assetCode = cleanFieldText(item?.asset_code);
  const spec = cleanFieldText(item?.spec || item?.asset_name);
  const model = cleanFieldText(item?.model);
  const location = cleanFieldText(item?.location);
  const vendor = cleanFieldText(item?.vendor);
  const vendorAddress = cleanFieldText(item?.vendor_address);
  const vendorPhone = cleanFieldText(item?.vendor_phone);

  return `
    <div class="print-asset-card ${isPageBreak ? 'page-break' : ''}">
      <!-- Title -->
      <div class="text-center my-1">
        <h2 class="text-[17px] font-bold text-black tracking-wide">
          ทะเบียนคุมทรัพย์สิน
        </h2>
      </div>

      <!-- ส่วนราชการ / หน่วยงาน ชิดขวา -->
      <div class="flex justify-end mb-2 text-[11px] text-black">
        <div class="text-left w-auto space-y-0.5">
          <div class="flex">
            <span class="whitespace-nowrap font-medium">ส่วนราชการ&nbsp;&nbsp;</span>
            <span class="font-normal flex-grow border-b border-dotted border-black min-w-[280px]">${org || '&nbsp;'}</span>
          </div>
          <div class="flex">
            <span class="whitespace-nowrap font-medium">หน่วยงาน&nbsp;&nbsp;&nbsp;&nbsp;</span>
            <span class="font-normal flex-grow border-b border-dotted border-black min-w-[280px]">${dept || '&nbsp;'}</span>
          </div>
        </div>
      </div>

      <!-- ข้อมูลหัวตาราง (5 บรรทัดตรงตามภาพ) -->
      <div class="text-[11px] text-black space-y-1.5 mb-2 leading-relaxed">
        <!-- แถวที่ 1: ประเภท | รหัส | ลักษณะ/สมบัติ | รุ่นแบบ -->
        <div class="grid grid-cols-12 gap-x-3 items-end">
          <div class="col-span-3 flex items-end">
            <span class="whitespace-nowrap font-medium">ประเภท&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${category || '&nbsp;'}</span>
          </div>
          <div class="col-span-3 flex items-end">
            <span class="whitespace-nowrap font-medium">รหัส&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${assetCode || '&nbsp;'}</span>
          </div>
          <div class="col-span-3 flex items-end">
            <span class="whitespace-nowrap font-medium">ลักษณะ/สมบัติ&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${spec || '&nbsp;'}</span>
          </div>
          <div class="col-span-3 flex items-end">
            <span class="whitespace-nowrap font-medium">รุ่นแบบ&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${model || '&nbsp;'}</span>
          </div>
        </div>

        <!-- แถวที่ 2: สถานที่ตั้ง/หน่วยที่รับผิดชอบ | ชื่อผู้ขาย/ผู้รับจ้าง/ผู้บริจาค -->
        <div class="grid grid-cols-12 gap-x-4 items-end">
          <div class="col-span-6 flex items-end">
            <span class="whitespace-nowrap font-medium">สถานที่ตั้ง/หน่วยที่รับผิดชอบ&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${location || '&nbsp;'}</span>
          </div>
          <div class="col-span-6 flex items-end">
            <span class="whitespace-nowrap font-medium">ชื่อผู้ขาย/ผู้รับจ้าง/ผู้บริจาค&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${vendor || '&nbsp;'}</span>
          </div>
        </div>

        <!-- แถวที่ 3: ที่อยู่ | โทรศัพท์ -->
        <div class="grid grid-cols-12 gap-x-4 items-end">
          <div class="col-span-8 flex items-end">
            <span class="whitespace-nowrap font-medium">ที่อยู่&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${vendorAddress || '&nbsp;'}</span>
          </div>
          <div class="col-span-4 flex items-end">
            <span class="whitespace-nowrap font-medium">โทรศัพท์&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${vendorPhone || '&nbsp;'}</span>
          </div>
        </div>

        <!-- แถวที่ 4: ประเภทเงิน (Checkboxes) -->
        <div class="flex flex-wrap items-center gap-x-6">
          <span class="font-medium">ประเภทเงิน</span>
          <label class="flex items-center gap-1.5">
            <span class="text-sm font-bold leading-none">${b === 'เงินงบประมาณ' ? '☑' : '☐'}</span>
            <span>เงินงบประมาณ</span>
          </label>
          <label class="flex items-center gap-1.5">
            <span class="text-sm font-bold leading-none">${b === 'เงินนอกงบประมาณ' ? '☑' : '☐'}</span>
            <span>เงินนอกงบประมาณ</span>
          </label>
          <label class="flex items-center gap-1.5">
            <span class="text-sm font-bold leading-none">${b === 'เงินบริจาค/เงินช่วยเหลือ' ? '☑' : '☐'}</span>
            <span>เงินบริจาค/เงินช่วยเหลือ</span>
          </label>
          <label class="flex items-center gap-1.5">
            <span class="text-sm font-bold leading-none">${b === 'อื่นๆ' ? '☑' : '☐'}</span>
            <span>อื่นๆ</span>
          </label>
        </div>

        <!-- แถวที่ 5: วิธีการได้มา (Checkboxes) -->
        <div class="flex flex-wrap items-center gap-x-6">
          <span class="font-medium">วิธีการได้มา</span>
          <label class="flex items-center gap-1.5">
            <span class="text-sm font-bold leading-none">${m === 'ประกาศเชิญชวน' ? '☑' : '☐'}</span>
            <span>ประกาศเชิญชวน</span>
          </label>
          <label class="flex items-center gap-1.5">
            <span class="text-sm font-bold leading-none">${m === 'คัดเลือก' ? '☑' : '☐'}</span>
            <span>คัดเลือก</span>
          </label>
          <label class="flex items-center gap-1.5">
            <span class="text-sm font-bold leading-none">${m === 'เฉพาะเจาะจง' ? '☑' : '☐'}</span>
            <span>เฉพาะเจาะจง</span>
          </label>
          <label class="flex items-center gap-1.5">
            <span class="text-sm font-bold leading-none">${m === 'รับบริจาค' ? '☑' : '☐'}</span>
            <span>รับบริจาค</span>
          </label>
        </div>
      </div>

      <!-- ตาราง 11 คอลัมน์ตรงตามภาพเป๊ะๆ -->
      <table class="form-table w-full text-[11px]">
        <thead>
          <tr class="bg-white text-center font-bold">
            <th class="w-16">วัน เดือน ปี</th>
            <th class="w-20">ที่เอกสาร</th>
            <th class="min-w-[140px]">รายการ</th>
            <th class="w-16">จำนวนหน่วย</th>
            <th class="w-24 leading-tight">ราคาต่อ หน่วย/<br>ชุด/กลุ่ม</th>
            <th class="w-24">มูลค่ารวม</th>
            <th class="w-16">อายุใช้งาน</th>
            <th class="w-16 leading-tight">อัตราค่า<br>เสื่อมราคา</th>
            <th class="w-24 leading-tight">ค่าเสื่อม<br>ราคา</th>
            <th class="w-24 leading-tight">มูลค่า<br>สุทธิ</th>
            <th class="w-28">หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          ${generateAssetTableRowsHtml(item ? [item] : [])}
        </tbody>
      </table>
    </div>
  `;
}

// สร้าง HTML สำหรับรวมรายการในตารางเดียว
function generateCombinedAssetCardHtml(items) {
  const org = cleanFieldText(localStorage.getItem('gov_org')) || DEFAULT_ORG;
  const dept = cleanFieldText(localStorage.getItem('gov_dept')) || DEFAULT_DEPT;
  const firstItem = items[0] || null;
  const b = firstItem ? (firstItem.budget_source || 'เงินงบประมาณ') : 'เงินงบประมาณ';
  const m = firstItem ? (firstItem.acquisition_method || 'เฉพาะเจาะจง') : 'เฉพาะเจาะจง';

  const category = items.length === 1 ? (cleanFieldText(firstItem?.category) || '-') : 'รวมหลายประเภท';
  const assetCode = items.length === 1 ? (cleanFieldText(firstItem?.asset_code) || '') : 'ตามรายการในตาราง';
  const spec = items.length === 1 ? (cleanFieldText(firstItem?.spec || firstItem?.asset_name) || '') : '-';
  const model = items.length === 1 ? (cleanFieldText(firstItem?.model) || '') : '-';
  const location = items.length === 1 ? (cleanFieldText(firstItem?.location) || '') : 'ตามรายการในตาราง';
  const vendor = items.length === 1 ? (cleanFieldText(firstItem?.vendor) || '') : '-';
  const vendorAddress = items.length === 1 ? cleanFieldText(firstItem?.vendor_address) : '';
  const vendorPhone = items.length === 1 ? cleanFieldText(firstItem?.vendor_phone) : '';

  return `
    <div class="print-asset-card">
      <div class="text-center my-1">
        <h2 class="text-[17px] font-bold text-black tracking-wide">
          ทะเบียนคุมทรัพย์สิน (พิมพ์รวม ${items.length} รายการ)
        </h2>
      </div>

      <div class="flex justify-end mb-2 text-[11px] text-black">
        <div class="text-left w-auto space-y-0.5">
          <div class="flex">
            <span class="whitespace-nowrap font-medium">ส่วนราชการ&nbsp;&nbsp;</span>
            <span class="font-normal flex-grow border-b border-dotted border-black min-w-[280px]">${org || '&nbsp;'}</span>
          </div>
          <div class="flex">
            <span class="whitespace-nowrap font-medium">หน่วยงาน&nbsp;&nbsp;&nbsp;&nbsp;</span>
            <span class="font-normal flex-grow border-b border-dotted border-black min-w-[280px]">${dept || '&nbsp;'}</span>
          </div>
        </div>
      </div>

      <div class="text-[11px] text-black space-y-1.5 mb-2 leading-relaxed">
        <div class="grid grid-cols-12 gap-x-3 items-end">
          <div class="col-span-3 flex items-end">
            <span class="whitespace-nowrap font-medium">ประเภท&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${category || '&nbsp;'}</span>
          </div>
          <div class="col-span-3 flex items-end">
            <span class="whitespace-nowrap font-medium">รหัส&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${assetCode || '&nbsp;'}</span>
          </div>
          <div class="col-span-3 flex items-end">
            <span class="whitespace-nowrap font-medium">ลักษณะ/สมบัติ&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${spec || '&nbsp;'}</span>
          </div>
          <div class="col-span-3 flex items-end">
            <span class="whitespace-nowrap font-medium">รุ่นแบบ&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${model || '&nbsp;'}</span>
          </div>
        </div>

        <div class="grid grid-cols-12 gap-x-4 items-end">
          <div class="col-span-6 flex items-end">
            <span class="whitespace-nowrap font-medium">สถานที่ตั้ง/หน่วยที่รับผิดชอบ&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${location || '&nbsp;'}</span>
          </div>
          <div class="col-span-6 flex items-end">
            <span class="whitespace-nowrap font-medium">ชื่อผู้ขาย/ผู้รับจ้าง/ผู้บริจาค&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${vendor || '&nbsp;'}</span>
          </div>
        </div>

        <div class="grid grid-cols-12 gap-x-4 items-end">
          <div class="col-span-8 flex items-end">
            <span class="whitespace-nowrap font-medium">ที่อยู่&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${vendorAddress || '&nbsp;'}</span>
          </div>
          <div class="col-span-4 flex items-end">
            <span class="whitespace-nowrap font-medium">โทรศัพท์&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${vendorPhone || '&nbsp;'}</span>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-x-6">
          <span class="font-medium">ประเภทเงิน</span>
          <label class="flex items-center gap-1.5">
            <span class="text-sm font-bold leading-none">${b === 'เงินงบประมาณ' ? '☑' : '☐'}</span>
            <span>เงินงบประมาณ</span>
          </label>
          <label class="flex items-center gap-1.5">
            <span class="text-sm font-bold leading-none">${b === 'เงินนอกงบประมาณ' ? '☑' : '☐'}</span>
            <span>เงินนอกงบประมาณ</span>
          </label>
          <label class="flex items-center gap-1.5">
            <span class="text-sm font-bold leading-none">${b === 'เงินบริจาค/เงินช่วยเหลือ' ? '☑' : '☐'}</span>
            <span>เงินบริจาค/เงินช่วยเหลือ</span>
          </label>
          <label class="flex items-center gap-1.5">
            <span class="text-sm font-bold leading-none">${b === 'อื่นๆ' ? '☑' : '☐'}</span>
            <span>อื่นๆ</span>
          </label>
        </div>

        <div class="flex flex-wrap items-center gap-x-6">
          <span class="font-medium">วิธีการได้มา</span>
          <label class="flex items-center gap-1.5">
            <span class="text-sm font-bold leading-none">${m === 'ประกาศเชิญชวน' ? '☑' : '☐'}</span>
            <span>ประกาศเชิญชวน</span>
          </label>
          <label class="flex items-center gap-1.5">
            <span class="text-sm font-bold leading-none">${m === 'คัดเลือก' ? '☑' : '☐'}</span>
            <span>คัดเลือก</span>
          </label>
          <label class="flex items-center gap-1.5">
            <span class="text-sm font-bold leading-none">${m === 'เฉพาะเจาะจง' ? '☑' : '☐'}</span>
            <span>เฉพาะเจาะจง</span>
          </label>
          <label class="flex items-center gap-1.5">
            <span class="text-sm font-bold leading-none">${m === 'รับบริจาค' ? '☑' : '☐'}</span>
            <span>รับบริจาค</span>
          </label>
        </div>
      </div>

      <table class="form-table w-full text-[11px]">
        <thead>
          <tr class="bg-white text-center font-bold">
            <th class="w-16">วัน เดือน ปี</th>
            <th class="w-20">ที่เอกสาร</th>
            <th class="min-w-[140px]">รายการ</th>
            <th class="w-16">จำนวนหน่วย</th>
            <th class="w-24 leading-tight">ราคาต่อ หน่วย/<br>ชุด/กลุ่ม</th>
            <th class="w-24">มูลค่ารวม</th>
            <th class="w-16">อายุใช้งาน</th>
            <th class="w-16 leading-tight">อัตราค่า<br>เสื่อมราคา</th>
            <th class="w-24 leading-tight">ค่าเสื่อม<br>ราคา</th>
            <th class="w-24 leading-tight">มูลค่า<br>สุทธิ</th>
            <th class="w-28">หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          ${generateAssetTableRowsHtml(items)}
        </tbody>
      </table>
    </div>
  `;
}

function generateAssetTableRowsHtml(items) {
  let html = '';
  const TARGET_ROWS = 15;
  items.forEach((item) => {
    html += `
      <tr>
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
      </tr>
    `;
  });

  const emptyRowsCount = Math.max(0, TARGET_ROWS - items.length);
  for (let i = 0; i < emptyRowsCount; i++) {
    html += `
      <tr class="empty-row">
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
      </tr>
    `;
  }
  return html;
}

// ==================== ฟังก์ชัน Modal และ CRUD ครุภัณฑ์ ====================
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
    asset_name: cleanFieldText(document.getElementById('a_name').value),
    asset_code: cleanFieldText(document.getElementById('a_code').value),
    category: cleanFieldText(document.getElementById('a_category').value) || 'ครุภัณฑ์คอมพิวเตอร์',
    spec: cleanFieldText(document.getElementById('a_spec').value),
    model: cleanFieldText(document.getElementById('a_model').value),
    received_date: document.getElementById('a_date').value,
    doc_no: cleanFieldText(document.getElementById('a_doc').value),
    qty: parseInt(document.getElementById('a_qty').value) || 1,
    cost: parseFloat(document.getElementById('a_cost').value) || 0,
    useful_life: parseInt(document.getElementById('a_life').value) || 5,
    location: cleanFieldText(document.getElementById('a_location').value),
    status: document.getElementById('a_status').value,
    vendor: cleanFieldText(document.getElementById('a_vendor').value),
    vendor_address: cleanFieldText(document.getElementById('a_vendor_address').value),
    vendor_phone: cleanFieldText(document.getElementById('a_vendor_phone').value),
    budget_source: document.getElementById('a_budget_source').value,
    acquisition_method: document.getElementById('a_acquisition_method').value,
    responsible_person: cleanFieldText(document.getElementById('a_person').value),
    remark: cleanFieldText(document.getElementById('a_remark').value)
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
  selectedAssetIds.delete(id);
  loadAssets();
}

// ==============================================================
// บัญชีคุมวัสดุ
// ==============================================================
async function loadMaterials() {
  try {
    const res = await fetch('/api/materials');
    materialList = await res.json();

    if (selectedMaterialIds.size === 0) {
      materialList.forEach(m => selectedMaterialIds.add(m.id));
    } else {
      const validIds = new Set(materialList.map(m => m.id));
      selectedMaterialIds = new Set([...selectedMaterialIds].filter(id => validIds.has(id)));
    }

    populateFiscalYearOptions('material');
    renderMaterialTable();
    updateMaterialSelectionUI();
    renderMaterialPrint();
  } catch (err) {
    console.error('Error loading materials:', err);
  }
}

// เรนเดอร์ตารางบนหน้าจอเว็บ (กรองตามปีงบประมาณ, เดือน, และคำค้นหาอัตโนมัติ)
function renderMaterialTable() {
  const screenTbody = document.getElementById('screen-material-table-body');
  if (!screenTbody) return;
  screenTbody.innerHTML = '';

  const list = getFilteredMaterials();
  const clearBtn = document.getElementById('material-search-clear-btn');
  const countSpan = document.getElementById('material-search-result-count');

  if (clearBtn) {
    if (materialSearchQuery.trim()) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');
  }

  if (countSpan) {
    const isFiltered = materialFiscalYear !== 'all' || materialMonth !== 'all' || materialSearchQuery.trim();
    if (isFiltered) {
      countSpan.innerHTML = `แสดง <span class="font-bold text-amber-800">${list.length}</span> รายการ (จากทั้งหมด ${materialList.length} รายการ)`;
    } else {
      countSpan.innerHTML = `ทั้งหมด <span class="font-bold text-slate-700">${materialList.length}</span> รายการ`;
    }
  }

  if (list.length === 0) {
    const tr = document.createElement('tr');
    let msg = '🔍 ไม่พบรายการวัสดุในเงื่อนไขที่เลือก';
    if (materialFiscalYear !== 'all') {
      msg += ` (ปีงบ ${String(materialFiscalYear).slice(-2)})`;
    }
    if (materialMonth !== 'all') {
      const monthNames = {'10':'ต.ค.','11':'พ.ย.','12':'ธ.ค.','1':'ม.ค.','2':'ก.พ.','3':'มี.ค.','4':'เม.ย.','5':'พ.ค.','6':'มิ.ย.','7':'ก.ค.','8':'ส.ค.','9':'ก.ย.'};
      msg += ` ประจำเดือน ${monthNames[materialMonth] || materialMonth}`;
    }
    if (materialSearchQuery.trim()) {
      msg += ` คำค้น "${escapeHtml(materialSearchQuery)}"`;
    }
    tr.innerHTML = `
      <td colspan="13" class="p-8 text-center text-slate-400 text-xs sm:text-sm">
        ${msg}
      </td>
    `;
    screenTbody.appendChild(tr);
    return;
  }

  list.forEach((item) => {
    const isSelected = selectedMaterialIds.has(item.id);
    const tr = document.createElement('tr');
    tr.className = `hover:bg-amber-50/60 border-b border-amber-100/70 cursor-pointer transition ${isSelected ? 'bg-amber-50/40' : ''}`;
    
    tr.onclick = (e) => {
      if (!e.target.closest('button, input')) {
        toggleMaterialItemSelection(item.id);
      }
    };

    tr.innerHTML = `
      <td class="p-2 border border-slate-200 text-center" onclick="event.stopPropagation()">
        <input type="checkbox" class="w-4 h-4 accent-amber-500 rounded cursor-pointer" 
          ${isSelected ? 'checked' : ''} 
          onchange="toggleMaterialItemSelection(${item.id}, this.checked)">
      </td>
      <td class="p-2 border border-slate-200">${item.trans_date || ''}</td>
      <td class="p-2 border border-slate-200 font-semibold text-slate-900">${item.party || ''}</td>
      <td class="p-2 border border-slate-200">${item.doc_no || ''}</td>
      <td class="p-2 border border-slate-200">${item.budget_type || ''}</td>
      <td class="p-2 border border-slate-200 text-center">${item.opening_stock || 0}</td>
      <td class="p-2 border border-slate-200 text-center text-emerald-700 font-semibold">${item.qty_in || 0}</td>
      <td class="p-2 border border-slate-200 text-center text-rose-700 font-semibold">${item.qty_out || 0}</td>
      <td class="p-2 border border-slate-200 text-center font-bold bg-amber-50/70 text-slate-900">${item.balance}</td>
      <td class="p-2 border border-slate-200 text-right">${Number(item.unit_price).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
      <td class="p-2 border border-slate-200 text-right font-bold text-amber-900">${Number(item.total_amount).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
      <td class="p-2 border border-slate-200 text-slate-500">${item.remark || ''}</td>
      <td class="p-2 border border-slate-200 text-center whitespace-nowrap space-x-1" onclick="event.stopPropagation()">
        <button onclick="editMaterial(${item.id})" class="text-red-700 hover:text-red-900 p-1.5 font-semibold rounded-lg hover:bg-red-100 transition shadow-2xs" title="แก้ไขรายการนี้">✏️</button>
        <button onclick="deleteMaterial(${item.id})" class="text-slate-400 hover:text-rose-600 p-1.5 font-semibold rounded-lg hover:bg-rose-50 transition shadow-2xs" title="ลบรายการ">🗑️</button>
      </td>
    `;
    screenTbody.appendChild(tr);
  });
}

function toggleMaterialItemSelection(id, explicitChecked = null) {
  if (explicitChecked !== null) {
    if (explicitChecked) selectedMaterialIds.add(id);
    else selectedMaterialIds.delete(id);
  } else {
    if (selectedMaterialIds.has(id)) selectedMaterialIds.delete(id);
    else selectedMaterialIds.add(id);
  }
  renderMaterialTable();
  updateMaterialSelectionUI();
  renderMaterialPrint();
}

function toggleSelectAllMaterials(isChecked) {
  const list = getFilteredMaterials();
  if (isChecked) {
    list.forEach(m => selectedMaterialIds.add(m.id));
  } else {
    list.forEach(m => selectedMaterialIds.delete(m.id));
  }
  renderMaterialTable();
  updateMaterialSelectionUI();
  renderMaterialPrint();
}

function selectAllMaterials(select) {
  const list = getFilteredMaterials();
  if (select) {
    list.forEach(m => selectedMaterialIds.add(m.id));
  } else {
    list.forEach(m => selectedMaterialIds.delete(m.id));
  }
  renderMaterialTable();
  updateMaterialSelectionUI();
  renderMaterialPrint();
}

function updateMaterialSelectionUI() {
  const count = selectedMaterialIds.size;
  const badge = document.getElementById('material-selected-badge');
  const countSpan = document.getElementById('material-selected-count');
  const btnPrintText = document.getElementById('btn-print-material-text');
  const selectAllChk = document.getElementById('select-all-material-chk');

  if (countSpan) countSpan.innerText = count;

  if (badge) {
    if (count > 0) badge.classList.remove('hidden');
    else badge.classList.add('hidden');
  }

  if (btnPrintText) {
    btnPrintText.innerText = count > 0 ? `พิมพ์บัญชีคุมวัสดุ (${count} รายการ)` : 'พิมพ์บัญชีคุมวัสดุ (PDF)';
  }

  if (selectAllChk) {
    const list = getFilteredMaterials();
    const visibleSelectedCount = list.filter(m => selectedMaterialIds.has(m.id)).length;
    if (list.length > 0 && visibleSelectedCount === list.length) {
      selectAllChk.checked = true;
      selectAllChk.indeterminate = false;
    } else if (visibleSelectedCount > 0 && visibleSelectedCount < list.length) {
      selectAllChk.checked = false;
      selectAllChk.indeterminate = true;
    } else {
      selectAllChk.checked = false;
      selectAllChk.indeterminate = false;
    }
  }
}

function printSelectedMaterials() {
  if (selectedMaterialIds.size === 0) {
    alert('กรุณาติ๊กเลือกรายการในตารางเพื่อพิมพ์ หรือกด "เลือกทั้งหมด" ครับ');
    return;
  }
  renderMaterialPrint();
  window.print();
}

function renderMaterialPrint() {
  const printTbody = document.getElementById('print-material-table-body');
  if (!printTbody) return;
  printTbody.innerHTML = '';
  const TARGET_ROWS = 15;

  const printData = materialList.filter(m => selectedMaterialIds.has(m.id));

  printData.forEach((item, index) => {
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
      <td class="text-right font-bold text-black whitespace-nowrap">${item.total_amount ? Number(item.total_amount).toLocaleString('th-TH', {minimumFractionDigits: 2}) : ''}</td>
      <td class="text-left">${item.remark || ''}</td>
    `;
    printTbody.appendChild(tr);
  });

  const emptyRowsCount = Math.max(0, TARGET_ROWS - printData.length);
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

// ==================== ฟังก์ชัน Modal และ CRUD วัสดุ ====================
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
    party: cleanFieldText(document.getElementById('m_party').value),
    doc_no: cleanFieldText(document.getElementById('m_doc').value),
    budget_type: cleanFieldText(document.getElementById('m_budget').value),
    opening_stock: parseInt(document.getElementById('m_open').value) || 0,
    qty_in: parseInt(document.getElementById('m_in').value) || 0,
    qty_out: parseInt(document.getElementById('m_out').value) || 0,
    unit_price: parseFloat(document.getElementById('m_price').value) || 0,
    remark: cleanFieldText(document.getElementById('m_remark').value)
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
  selectedMaterialIds.delete(id);
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

// ==================== System Menu Dropdown Helpers ====================
function toggleSystemMenu() {
  const dropdown = document.getElementById('system-menu-dropdown');
  const arrow = document.getElementById('system-menu-arrow');
  if (!dropdown) return;
  const isHidden = dropdown.classList.contains('hidden');
  if (isHidden) {
    dropdown.classList.remove('hidden');
    if (arrow) arrow.classList.add('rotate-180');
  } else {
    dropdown.classList.add('hidden');
    if (arrow) arrow.classList.remove('rotate-180');
  }
}

function closeSystemMenu() {
  const dropdown = document.getElementById('system-menu-dropdown');
  const arrow = document.getElementById('system-menu-arrow');
  if (dropdown) dropdown.classList.add('hidden');
  if (arrow) arrow.classList.remove('rotate-180');
}

// ปิดเมนูดรอปดาวน์เมื่อคลิกนอกพื้นที่
document.addEventListener('click', (e) => {
  const container = document.getElementById('system-menu-container');
  if (container && !container.contains(e.target)) {
    closeSystemMenu();
  }
});
