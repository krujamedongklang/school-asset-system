// ค่าเริ่มต้นของส่วนราชการและหน่วยงาน (สำหรับแบบฟอร์มพิมพ์)
const DEFAULT_ORG = 'สำนักงานส่งเสริมการศึกษานอกระบบและการศึกษาตามอัธยาศัย';
const DEFAULT_DEPT = 'สำนักงานส่งเสริมการศึกษานอกระบบและการศึกษาตามอัธยาศัยจังหวัดนครราชสีมา';

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

  const orgMat = document.getElementById('org-name-material');
  const deptMat = document.getElementById('dept-name-material');
  if (orgMat) orgMat.innerText = org;
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
  renderAssetPrint();
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

    renderAssetTable();
    updateAssetSelectionUI();
    renderAssetPrint();
  } catch (err) {
    console.error('Error loading assets:', err);
  }
}

// เรนเดอร์ตารางบนหน้าจอเว็บ (แบบเดิม 100% เพิ่มเติมคือช่องติ๊กเลือกด้านหน้า)
function renderAssetTable() {
  const screenTbody = document.getElementById('screen-asset-table-body');
  if (!screenTbody) return;
  screenTbody.innerHTML = '';

  assetList.forEach((item, index) => {
    const isSelected = selectedAssetIds.has(item.id);
    const tr = document.createElement('tr');
    tr.className = `hover:bg-indigo-50/50 border-b cursor-pointer transition ${isSelected ? 'bg-indigo-50/40' : ''}`;
    
    // คลิกแถวเพื่อเปิด/ปิดการติ๊กเลือก
    tr.onclick = (e) => {
      if (!e.target.closest('button, input')) {
        toggleAssetItemSelection(item.id);
      }
    };

    tr.innerHTML = `
      <td class="p-2 border text-center" onclick="event.stopPropagation()">
        <input type="checkbox" class="w-4 h-4 text-indigo-600 rounded cursor-pointer" 
          ${isSelected ? 'checked' : ''} 
          onchange="toggleAssetItemSelection(${item.id}, this.checked)">
      </td>
      <td class="p-2 border text-center font-medium">${index + 1}</td>
      <td class="p-2 border">${item.received_date || ''}</td>
      <td class="p-2 border font-semibold text-indigo-950">${item.asset_code || ''}</td>
      <td class="p-2 border font-medium">${item.asset_name || ''}</td>
      <td class="p-2 border text-slate-600">${item.spec || ''}</td>
      <td class="p-2 border">${item.doc_no || ''}</td>
      <td class="p-2 border text-right">${Number(item.cost).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
      <td class="p-2 border text-center">${item.useful_life}</td>
      <td class="p-2 border text-right text-slate-500">${Number(item.depr_per_year).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
      <td class="p-2 border text-right font-bold text-indigo-700">${Number(item.net_book_value).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
      <td class="p-2 border">${item.location || ''}</td>
      <td class="p-2 border text-center">
        <span class="px-2 py-0.5 rounded text-xs font-semibold ${item.status === 'ใช้งานได้ดี' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
          ${item.status}
        </span>
      </td>
      <td class="p-2 border">${item.responsible_person || ''}</td>
      <td class="p-2 border text-center whitespace-nowrap space-x-1" onclick="event.stopPropagation()">
        <button onclick="printSingleAsset(${item.id})" class="text-blue-600 hover:text-blue-800 p-1 font-semibold rounded hover:bg-blue-100 transition" title="พิมพ์บัตรรายการนี้เฉพาะใบเดียว">🖨️</button>
        <button onclick="editAsset(${item.id})" class="text-amber-600 hover:text-amber-800 p-1 font-semibold rounded hover:bg-amber-100 transition" title="แก้ไขรายการนี้">✏️</button>
        <button onclick="deleteAsset(${item.id})" class="text-red-500 hover:text-red-700 p-1 font-semibold rounded hover:bg-red-100 transition" title="ลบรายการ">🗑️</button>
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

// ติ๊กเลือกทั้งหมด หรือ ยกเลิกทั้งหมด
function toggleSelectAllAssets(isChecked) {
  if (isChecked) {
    assetList.forEach(a => selectedAssetIds.add(a.id));
  } else {
    selectedAssetIds.clear();
  }
  renderAssetTable();
  updateAssetSelectionUI();
  renderAssetPrint();
}

function selectAllAssets(select) {
  if (select) {
    assetList.forEach(a => selectedAssetIds.add(a.id));
  } else {
    selectedAssetIds.clear();
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
    if (assetList.length > 0 && count === assetList.length) {
      selectAllChk.checked = true;
      selectAllChk.indeterminate = false;
    } else if (count > 0 && count < assetList.length) {
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
  const org = localStorage.getItem('gov_org') || DEFAULT_ORG;
  const dept = localStorage.getItem('gov_dept') || DEFAULT_DEPT;
  const b = item ? (item.budget_source || 'เงินงบประมาณ') : 'เงินงบประมาณ';
  const m = item ? (item.acquisition_method || 'เฉพาะเจาะจง') : 'เฉพาะเจาะจง';

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
            <span class="font-normal flex-grow border-b border-dotted border-black min-w-[280px]">${org}</span>
          </div>
          <div class="flex">
            <span class="whitespace-nowrap font-medium">หน่วยงาน&nbsp;&nbsp;&nbsp;&nbsp;</span>
            <span class="font-normal flex-grow border-b border-dotted border-black min-w-[280px]">${dept}</span>
          </div>
        </div>
      </div>

      <!-- ข้อมูลหัวตาราง (5 บรรทัดตรงตามภาพ) -->
      <div class="text-[11px] text-black space-y-1.5 mb-2 leading-relaxed">
        <!-- แถวที่ 1: ประเภท | รหัส | ลักษณะ/สมบัติ | รุ่นแบบ -->
        <div class="grid grid-cols-12 gap-x-3 items-end">
          <div class="col-span-3 flex items-end">
            <span class="whitespace-nowrap font-medium">ประเภท&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${item?.category || 'ครุภัณฑ์คอมพิวเตอร์'}</span>
          </div>
          <div class="col-span-3 flex items-end">
            <span class="whitespace-nowrap font-medium">รหัส&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${item?.asset_code || ''}</span>
          </div>
          <div class="col-span-3 flex items-end">
            <span class="whitespace-nowrap font-medium">ลักษณะ/สมบัติ&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${item?.spec || item?.asset_name || ''}</span>
          </div>
          <div class="col-span-3 flex items-end">
            <span class="whitespace-nowrap font-medium">รุ่นแบบ&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${item?.model || ''}</span>
          </div>
        </div>

        <!-- แถวที่ 2: สถานที่ตั้ง/หน่วยที่รับผิดชอบ | ชื่อผู้ขาย/ผู้รับจ้าง/ผู้บริจาค -->
        <div class="grid grid-cols-12 gap-x-4 items-end">
          <div class="col-span-6 flex items-end">
            <span class="whitespace-nowrap font-medium">สถานที่ตั้ง/หน่วยที่รับผิดชอบ&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${item?.location || ''}</span>
          </div>
          <div class="col-span-6 flex items-end">
            <span class="whitespace-nowrap font-medium">ชื่อผู้ขาย/ผู้รับจ้าง/ผู้บริจาค&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${item?.vendor || ''}</span>
          </div>
        </div>

        <!-- แถวที่ 3: ที่อยู่ | โทรศัพท์ -->
        <div class="grid grid-cols-12 gap-x-4 items-end">
          <div class="col-span-8 flex items-end">
            <span class="whitespace-nowrap font-medium">ที่อยู่&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${item?.vendor_address || '...................................................................................................'}</span>
          </div>
          <div class="col-span-4 flex items-end">
            <span class="whitespace-nowrap font-medium">โทรศัพท์&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${item?.vendor_phone || '...................................................'}</span>
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
  const org = localStorage.getItem('gov_org') || DEFAULT_ORG;
  const dept = localStorage.getItem('gov_dept') || DEFAULT_DEPT;
  const firstItem = items[0] || null;
  const b = firstItem ? (firstItem.budget_source || 'เงินงบประมาณ') : 'เงินงบประมาณ';
  const m = firstItem ? (firstItem.acquisition_method || 'เฉพาะเจาะจง') : 'เฉพาะเจาะจง';

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
            <span class="font-normal flex-grow border-b border-dotted border-black min-w-[280px]">${org}</span>
          </div>
          <div class="flex">
            <span class="whitespace-nowrap font-medium">หน่วยงาน&nbsp;&nbsp;&nbsp;&nbsp;</span>
            <span class="font-normal flex-grow border-b border-dotted border-black min-w-[280px]">${dept}</span>
          </div>
        </div>
      </div>

      <div class="text-[11px] text-black space-y-1.5 mb-2 leading-relaxed">
        <div class="grid grid-cols-12 gap-x-3 items-end">
          <div class="col-span-3 flex items-end">
            <span class="whitespace-nowrap font-medium">ประเภท&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${items.length === 1 ? (firstItem?.category || '-') : 'รวมหลายประเภท'}</span>
          </div>
          <div class="col-span-3 flex items-end">
            <span class="whitespace-nowrap font-medium">รหัส&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${items.length === 1 ? firstItem.asset_code : 'ตามรายการในตาราง'}</span>
          </div>
          <div class="col-span-3 flex items-end">
            <span class="whitespace-nowrap font-medium">ลักษณะ/สมบัติ&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${items.length === 1 ? (firstItem.spec || firstItem.asset_name) : '-'}</span>
          </div>
          <div class="col-span-3 flex items-end">
            <span class="whitespace-nowrap font-medium">รุ่นแบบ&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${items.length === 1 ? firstItem.model : '-'}</span>
          </div>
        </div>

        <div class="grid grid-cols-12 gap-x-4 items-end">
          <div class="col-span-6 flex items-end">
            <span class="whitespace-nowrap font-medium">สถานที่ตั้ง/หน่วยที่รับผิดชอบ&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${items.length === 1 ? (firstItem?.location || '-') : 'ตามรายการในตาราง'}</span>
          </div>
          <div class="col-span-6 flex items-end">
            <span class="whitespace-nowrap font-medium">ชื่อผู้ขาย/ผู้รับจ้าง/ผู้บริจาค&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${items.length === 1 ? (firstItem?.vendor || '-') : '-'}</span>
          </div>
        </div>

        <div class="grid grid-cols-12 gap-x-4 items-end">
          <div class="col-span-8 flex items-end">
            <span class="whitespace-nowrap font-medium">ที่อยู่&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${items.length === 1 ? (firstItem?.vendor_address || '...................................') : '...................................................................................................'}</span>
          </div>
          <div class="col-span-4 flex items-end">
            <span class="whitespace-nowrap font-medium">โทรศัพท์&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${items.length === 1 ? (firstItem?.vendor_phone || '...................................') : '...................................................'}</span>
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

    renderMaterialTable();
    updateMaterialSelectionUI();
    renderMaterialPrint();
  } catch (err) {
    console.error('Error loading materials:', err);
  }
}

function renderMaterialTable() {
  const screenTbody = document.getElementById('screen-material-table-body');
  if (!screenTbody) return;
  screenTbody.innerHTML = '';

  materialList.forEach((item) => {
    const isSelected = selectedMaterialIds.has(item.id);
    const tr = document.createElement('tr');
    tr.className = `hover:bg-emerald-50/50 border-b cursor-pointer transition ${isSelected ? 'bg-emerald-50/30' : ''}`;
    
    tr.onclick = (e) => {
      if (!e.target.closest('button, input')) {
        toggleMaterialItemSelection(item.id);
      }
    };

    tr.innerHTML = `
      <td class="p-2 border text-center" onclick="event.stopPropagation()">
        <input type="checkbox" class="w-4 h-4 text-emerald-600 rounded cursor-pointer" 
          ${isSelected ? 'checked' : ''} 
          onchange="toggleMaterialItemSelection(${item.id}, this.checked)">
      </td>
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
      <td class="p-2 border text-center whitespace-nowrap space-x-1" onclick="event.stopPropagation()">
        <button onclick="editMaterial(${item.id})" class="text-amber-600 hover:text-amber-800 p-1 font-semibold rounded hover:bg-amber-100 transition" title="แก้ไขรายการนี้">✏️</button>
        <button onclick="deleteMaterial(${item.id})" class="text-red-500 hover:text-red-700 p-1 font-semibold rounded hover:bg-red-100 transition" title="ลบรายการ">🗑️</button>
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
  if (isChecked) {
    materialList.forEach(m => selectedMaterialIds.add(m.id));
  } else {
    selectedMaterialIds.clear();
  }
  renderMaterialTable();
  updateMaterialSelectionUI();
  renderMaterialPrint();
}

function selectAllMaterials(select) {
  if (select) {
    materialList.forEach(m => selectedMaterialIds.add(m.id));
  } else {
    selectedMaterialIds.clear();
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
    if (materialList.length > 0 && count === materialList.length) {
      selectAllChk.checked = true;
      selectAllChk.indeterminate = false;
    } else if (count > 0 && count < materialList.length) {
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
      <td class="text-right font-bold text-emerald-800 whitespace-nowrap">${item.total_amount ? Number(item.total_amount).toLocaleString('th-TH', {minimumFractionDigits: 2}) : ''}</td>
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
