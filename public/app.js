// ค่าเริ่มต้นของส่วนราชการ
const DEFAULT_ORG = 'มหาวิทยาลัยราชภัฏพระนคร';
const DEFAULT_DEPT = '.......................................................';

let currentTab = 'asset';

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

// ==================== การจัดการส่วนราชการ & หน่วยงาน (สำหรับพิมพ์) ====================
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
  if (inpDept) inpDept.value = (dept === DEFAULT_DEPT) ? '' : dept;
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

// ==================== การจัดการหัวบัตรวัสดุ (สำหรับพิมพ์) ====================
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

// ==================== แปลงวันที่แบบไทย ====================
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

// ==================== ทะเบียนคุมทรัพย์สิน (ครุภัณฑ์) ====================
async function loadAssets() {
  try {
    const res = await fetch('/api/assets');
    const data = await res.json();

    // 1. เรนเดอร์บนหน้าจอ Dashboard (UI ตามที่คุณชอบ)
    const screenTbody = document.getElementById('screen-asset-table-body');
    screenTbody.innerHTML = '';

    data.forEach((item, index) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 border-b';
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
        <td class="p-2 border text-center">
          <button onclick="deleteAsset(${item.id})" class="text-red-500 hover:text-red-700 px-1" title="ลบรายการ">🗑️</button>
        </td>
      `;
      screenTbody.appendChild(tr);
    });

    // 2. เรนเดอร์สำหรับสั่งพิมพ์ (แบบฟอร์มเอกสารหมายเลข ๓ - 15 คอลัมน์ เติมครบ 15 แถว)
    const printTbody = document.getElementById('print-asset-table-body');
    printTbody.innerHTML = '';
    const TARGET_ROWS = 15;

    data.forEach((item, index) => {
      const isGood = item.status === 'ใช้งานได้ดี' ? '✓' : '';
      const isDamaged = item.status === 'ชำรุด' ? '✓' : '';
      const isRepair = (item.status === 'รอซ่อม' || item.status === 'ชำรุดรอซ่อม') ? '✓' : '';
      const isDisposed = item.status === 'ขอจำหน่าย' ? '✓' : '';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-center font-normal">${index + 1}</td>
        <td class="text-center whitespace-nowrap">${formatThaiDate(item.received_date)}</td>
        <td class="text-center font-medium">${item.asset_code || ''}</td>
        <td class="text-left">${item.asset_name || ''}</td>
        <td class="text-left">${item.spec || ''}</td>
        <td class="text-center">${item.doc_no || ''}</td>
        <td class="text-right whitespace-nowrap">${item.cost ? Number(item.cost).toLocaleString('th-TH', {minimumFractionDigits: 2}) : ''}</td>
        <td class="text-center">${item.useful_life || ''}</td>
        <td class="text-left">${item.location || ''}</td>
        <td class="text-center font-bold text-sm leading-none">${isGood}</td>
        <td class="text-center font-bold text-sm leading-none">${isDamaged}</td>
        <td class="text-center font-bold text-sm leading-none">${isRepair}</td>
        <td class="text-center font-bold text-sm leading-none">${isDisposed}</td>
        <td class="text-left">${item.vendor || ''}</td>
        <td class="text-left">${item.responsible_person || ''}</td>
      `;
      printTbody.appendChild(tr);
    });

    // เติมแถวว่างให้ครบ 15 แถวสำหรับการพิมพ์
    const emptyRowsCount = Math.max(0, TARGET_ROWS - data.length);
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
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
      `;
      printTbody.appendChild(tr);
    }

  } catch (err) {
    console.error('Error loading assets:', err);
  }
}

async function saveAsset(e) {
  e.preventDefault();
  const body = {
    asset_code: document.getElementById('a_code').value.trim(),
    received_date: document.getElementById('a_date').value,
    asset_name: document.getElementById('a_name').value.trim(),
    spec: document.getElementById('a_spec').value.trim(),
    doc_no: document.getElementById('a_doc').value.trim(),
    cost: parseFloat(document.getElementById('a_cost').value) || 0,
    useful_life: parseInt(document.getElementById('a_life').value) || 5,
    location: document.getElementById('a_location').value.trim(),
    status: document.getElementById('a_status').value,
    vendor: document.getElementById('a_vendor').value.trim(),
    responsible_person: document.getElementById('a_person').value.trim()
  };

  await fetch('/api/assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  closeModal('assetModal');
  document.getElementById('form-asset').reset();
  document.getElementById('a_date').value = new Date().toISOString().split('T')[0];
  loadAssets();
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
    const data = await res.json();

    // 1. เรนเดอร์บนหน้าจอ Dashboard (UI ตามที่คุณชอบ)
    const screenTbody = document.getElementById('screen-material-table-body');
    screenTbody.innerHTML = '';

    data.forEach((item) => {
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
        <td class="p-2 border text-center">
          <button onclick="deleteMaterial(${item.id})" class="text-red-500 hover:text-red-700 px-1" title="ลบรายการ">🗑️</button>
        </td>
      `;
      screenTbody.appendChild(tr);
    });

    // 2. เรนเดอร์สำหรับสั่งพิมพ์ (แบบฟอร์มเอกสารหมายเลข ๓ - 11 คอลัมน์ เติมครบ 15 แถว)
    const printTbody = document.getElementById('print-material-table-body');
    printTbody.innerHTML = '';
    const TARGET_ROWS = 15;

    data.forEach((item, index) => {
      const openStock = (index === 0 && item.opening_stock > 0) ? item.opening_stock : (item.opening_stock || '');
      const qtyIn = item.qty_in > 0 ? item.qty_in : '';
      const qtyOut = item.qty_out > 0 ? item.qty_out : '';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-center whitespace-nowrap">${formatThaiDate(item.trans_date)}</td>
        <td class="text-left">${item.party || ''}</td>
        <td class="text-center">${item.doc_no || ''}</td>
        <td class="text-left">${item.budget_type || ''}</td>
        <td class="text-center">${openStock}</td>
        <td class="text-center font-medium">${qtyIn}</td>
        <td class="text-center font-medium">${qtyOut}</td>
        <td class="text-center font-bold">${item.balance}</td>
        <td class="text-right whitespace-nowrap">${item.unit_price ? Number(item.unit_price).toLocaleString('th-TH', {minimumFractionDigits: 2}) : ''}</td>
        <td class="text-right font-medium whitespace-nowrap">${item.total_amount ? Number(item.total_amount).toLocaleString('th-TH', {minimumFractionDigits: 2}) : ''}</td>
        <td class="text-left">${item.remark || ''}</td>
      `;
      printTbody.appendChild(tr);
    });

    // เติมแถวว่างให้ครบ 15 แถวสำหรับการพิมพ์
    const emptyRowsCount = Math.max(0, TARGET_ROWS - data.length);
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

async function saveMaterial(e) {
  e.preventDefault();
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

  await fetch('/api/materials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  closeModal('materialModal');
  document.getElementById('form-material').reset();
  document.getElementById('m_date').value = new Date().toISOString().split('T')[0];
  loadMaterials();
}

async function deleteMaterial(id) {
  if (!confirm('ยืนยันที่จะลบรายการวัสดุนี้หรือไม่?')) return;
  await fetch(`/api/materials/${id}`, { method: 'DELETE' });
  loadMaterials();
}

// ==================== สำรอง & กู้คืนข้อมูล (Backup & Restore) ====================
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
