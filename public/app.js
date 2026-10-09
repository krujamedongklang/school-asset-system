// ค่าเริ่มต้นของส่วนราชการและหน่วยงาน (สำหรับแบบฟอร์มพิมพ์)
const DEFAULT_ORG = 'สำนักงานเขตพื้นที่การศึกษาประถมศึกษาตราด';
const DEFAULT_DEPT = 'โรงเรียนบ้านดงกลาง';

// ฟังก์ชันล้างข้อความ: ถ้าเป็นค่าว่าง หรือผู้ใช้พิมพ์จุด/ขีด/จุดไข่ปลาซ้ำๆ หรือเครื่องหมาย ? ให้แปลงเป็นค่าว่าง '' เพื่อให้เส้นประด้านล่างว่างเปล่า
function cleanFieldText(val) {
  if (val === undefined || val === null) return '';
  const str = String(val).trim();
  if (!str) return '';
  // ถ้ามีแต่จุด . หรือขีด _ หรือขีด - (ซ้ำๆ 2 ตัวขึ้นไป) หรือจุดไข่ปลา … หรือเครื่องหมาย ? ซ้ำๆ ให้ถือว่าว่างเปล่า
  if (/^[\.\s_…\?]+$/.test(str) || /^-{2,}$/.test(str)) return '';
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

// กำหนดเป้าหมายการพิมพ์ (asset, material, annualInspection, disposalReport)
let currentPrintTarget = 'asset';

function setPrintTarget(target) {
  currentPrintTarget = target;
  const sections = {
    asset: document.getElementById('print-asset-section'),
    material: document.getElementById('print-material-section'),
    annualInspection: document.getElementById('print-annual-inspection-section'),
    disposalReport: document.getElementById('print-disposal-report-section')
  };

  Object.entries(sections).forEach(([key, el]) => {
    if (!el) return;
    if (key === target) {
      el.classList.remove('hidden');
      el.classList.add('block');
    } else {
      el.classList.add('hidden');
      el.classList.remove('block');
    }
  });
}

window.addEventListener('afterprint', () => {
  setPrintTarget(currentTab === 'asset' ? 'asset' : 'material');
});

// ==================== ระบบสิทธิ์เข้าใช้งาน & AUTHENTICATION ====================
function getAuthToken() {
  return localStorage.getItem('school_auth_token') || sessionStorage.getItem('school_auth_token') || '';
}

function setAuthToken(token) {
  if (token) {
    localStorage.setItem('school_auth_token', token);
  } else {
    localStorage.removeItem('school_auth_token');
    sessionStorage.removeItem('school_auth_token');
  }
}

// Wrapper fetch พร้อมส่ง Authorization header อัตโนมัติ
async function authFetch(url, options = {}) {
  const token = getAuthToken();
  const headers = Object.assign({}, options.headers || {});
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    // ถ้าเซสชันหมดอายุหรือไม่ได้รับอนุญาต
    setAuthToken('');
    showLoginOverlay();
  }
  return res;
}

function showLoginOverlay() {
  const overlay = document.getElementById('login-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    const passInput = document.getElementById('login-password');
    if (passInput) {
      passInput.value = '';
      setTimeout(() => passInput.focus(), 150);
    }
  }
}

function hideLoginOverlay() {
  const overlay = document.getElementById('login-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
  }
}

function togglePasswordVisibility(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (icon) icon.textContent = '🙈';
  } else {
    input.type = 'password';
    if (icon) icon.textContent = '👁️';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const passInput = document.getElementById('login-password');
  const errorDiv = document.getElementById('login-error-msg');
  const btnSubmit = document.getElementById('btn-login-submit');

  if (errorDiv) {
    errorDiv.classList.add('hidden');
    errorDiv.textContent = '';
  }

  const password = (passInput ? passInput.value : '').trim();
  if (!password) {
    if (errorDiv) {
      errorDiv.textContent = 'กรุณากรอกรหัสผ่าน';
      errorDiv.classList.remove('hidden');
    }
    return;
  }

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span>กำลังเข้าสู่ระบบ...</span>';
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();

    if (res.ok && data.success && data.token) {
      setAuthToken(data.token);
      hideLoginOverlay();
      await loadAssets();
      await loadMaterials();
      await loadDatabaseStatus();
    } else {
      if (errorDiv) {
        errorDiv.textContent = data.error || 'รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง';
        errorDiv.classList.remove('hidden');
      }
      if (passInput) {
        passInput.focus();
        passInput.select();
      }
    }
  } catch (err) {
    if (errorDiv) {
      errorDiv.textContent = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้: ' + err.message;
      errorDiv.classList.remove('hidden');
    }
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = '<span>เข้าสู่ระบบ</span> <span>➔</span>';
    }
  }
}

async function logout() {
  if (!confirm('ต้องการออกจากระบบใช่หรือไม่?')) return;
  try {
    await authFetch('/api/auth/logout', { method: 'POST' });
  } catch (e) {}
  setAuthToken('');
  showLoginOverlay();
}

async function checkAuthAndInitialize() {
  const token = getAuthToken();
  if (!token) {
    showLoginOverlay();
    return;
  }

  try {
    const res = await fetch('/api/auth/verify', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok && data.authenticated) {
      hideLoginOverlay();
      await loadAssets();
      await loadMaterials();
      await loadDatabaseStatus();
    } else {
      setAuthToken('');
      showLoginOverlay();
    }
  } catch (err) {
    console.warn('Auth verify check failed:', err);
    showLoginOverlay();
  }
}

// ==================== เปลี่ยนรหัสผ่าน ====================
async function handleChangePassword(e) {
  e.preventDefault();
  const curPass = document.getElementById('inp-current-pass').value;
  const newPass = document.getElementById('inp-new-pass').value;
  const confPass = document.getElementById('inp-confirm-pass').value;
  const msgEl = document.getElementById('change-pass-msg');

  msgEl.classList.remove('hidden');

  if (newPass !== confPass) {
    msgEl.textContent = 'รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน';
    msgEl.className = 'text-xs p-2.5 rounded-xl text-center font-medium bg-rose-50 text-rose-800 border border-rose-200';
    return;
  }

  if (newPass.length < 4) {
    msgEl.textContent = 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร';
    msgEl.className = 'text-xs p-2.5 rounded-xl text-center font-medium bg-rose-50 text-rose-800 border border-rose-200';
    return;
  }

  try {
    const res = await authFetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: curPass, newPassword: newPass })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      msgEl.textContent = '✅ ' + (data.message || 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');
      msgEl.className = 'text-xs p-2.5 rounded-xl text-center font-medium bg-emerald-50 text-emerald-800 border border-emerald-200';
      document.getElementById('inp-current-pass').value = '';
      document.getElementById('inp-new-pass').value = '';
      document.getElementById('inp-confirm-pass').value = '';
      setTimeout(() => {
        closeModal('changePasswordModal');
        msgEl.classList.add('hidden');
      }, 1800);
    } else {
      msgEl.textContent = '❌ ' + (data.error || 'ไม่สามารถเปลี่ยนรหัสผ่านได้');
      msgEl.className = 'text-xs p-2.5 rounded-xl text-center font-medium bg-rose-50 text-rose-800 border border-rose-200';
    }
  } catch (err) {
    msgEl.textContent = '❌ เกิดข้อผิดพลาดในการเชื่อมต่อ: ' + err.message;
    msgEl.className = 'text-xs p-2.5 rounded-xl text-center font-medium bg-rose-50 text-rose-800 border border-rose-200';
  }
}

// ==================== CLOUD DATABASE (SUPABASE) MANAGEMENT ====================
let currentDbStatus = null;

async function loadDatabaseStatus() {
  try {
    const res = await authFetch('/api/database/status');
    if (res.ok) {
      const data = await res.json();
      currentDbStatus = data;
      updateDbStatusUI(data);
    }
  } catch (err) {
    console.warn('Could not fetch DB status:', err);
  }
}

function updateDbStatusUI(status) {
  const badge = document.getElementById('db-status-badge');
  const dot = document.getElementById('db-status-dot');
  const text = document.getElementById('db-status-text');

  const modalBox = document.getElementById('modal-db-status-box');
  const modalIcon = document.getElementById('modal-db-status-icon');
  const modalTitle = document.getElementById('modal-db-status-title');
  const modalDesc = document.getElementById('modal-db-status-desc');

  const isSupabase = status && status.mode === 'supabase' && status.supabase_connected;

  if (badge) {
    badge.className = 'hidden';
  }

  if (modalBox && modalIcon && modalTitle && modalDesc) {
    if (isSupabase) {
      modalBox.className = 'p-3.5 rounded-xl mb-4 text-xs flex items-start gap-3 bg-emerald-50 border border-emerald-200 text-emerald-950';
      modalIcon.textContent = '☁️';
      modalTitle.textContent = 'เชื่อมต่อ Cloud Database (Supabase) เรียบร้อยแล้ว';
      modalDesc.textContent = `ข้อมูลถูกจัดเก็บและซิงค์อย่างปลอดภัยบน Supabase (${status.supabase_url || 'Active'}) ข้อมูลไม่สูญหายแม้เซิร์ฟเวอร์รีสตาร์ท`;
    } else {
      modalBox.className = 'p-3.5 rounded-xl mb-4 text-xs flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-950';
      modalIcon.textContent = '💾';
      modalTitle.textContent = 'ใช้งานฐานข้อมูลสำรองภายในเครื่อง (SQLite)';
      modalDesc.textContent = 'ยังไม่ได้เชื่อมต่อ Supabase หรือยังไม่ได้ระบุ Project URL และ Key ข้อมูลเก็บใน school_assets.db';
    }
  }
}

async function handleSaveSupabaseConfig(e) {
  e.preventDefault();
  const urlInput = document.getElementById('inp-supabase-url');
  const keyInput = document.getElementById('inp-supabase-key');
  const msgEl = document.getElementById('supabase-save-msg');

  const url = (urlInput ? urlInput.value : '').trim();
  const key = (keyInput ? keyInput.value : '').trim();

  msgEl.className = 'text-xs p-2.5 rounded-xl text-center font-medium bg-slate-100 text-slate-700';
  msgEl.textContent = 'กำลังทดสอบเชื่อมต่อ Supabase...';
  msgEl.classList.remove('hidden');

  try {
    const res = await authFetch('/api/database/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, key })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      msgEl.className = 'text-xs p-2.5 rounded-xl text-center font-medium bg-emerald-50 text-emerald-800 border border-emerald-200';
      msgEl.textContent = '✅ ' + (data.message || 'เชื่อมต่อ Supabase สำเร็จ');
      await loadDatabaseStatus();
    } else {
      msgEl.className = 'text-xs p-2.5 rounded-xl text-center font-medium bg-rose-50 text-rose-800 border border-rose-200';
      msgEl.textContent = '❌ ' + (data.message || data.error || 'เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบ URL และ Key');
      await loadDatabaseStatus();
    }
  } catch (err) {
    msgEl.className = 'text-xs p-2.5 rounded-xl text-center font-medium bg-rose-50 text-rose-800 border border-rose-200';
    msgEl.textContent = '❌ เกิดข้อผิดพลาด: ' + err.message;
  }
}

async function handleSyncToSupabase() {
  if (!confirm('ยืนยันที่จะคัดลอกข้อมูลทั้งหมดจากเครื่องขึ้นไปยัง Supabase ตอนนี้หรือไม่?\n(ข้อมูลเดิมใน Supabase จะถูกแทนที่ด้วยข้อมูลล่าสุด)')) {
    return;
  }

  const btn = document.getElementById('btn-sync-supabase');
  const msgEl = document.getElementById('supabase-save-msg');

  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ กำลังซิงค์ข้อมูล...';
  }

  if (msgEl) {
    msgEl.className = 'text-xs p-2.5 rounded-xl text-center font-medium bg-amber-50 text-amber-800 border border-amber-200';
    msgEl.textContent = 'กำลังอัปโหลดข้อมูลขึ้น Supabase...';
    msgEl.classList.remove('hidden');
  }

  try {
    const res = await authFetch('/api/database/sync', { method: 'POST' });
    const data = await res.json();

    if (res.ok && data.success) {
      if (msgEl) {
        msgEl.className = 'text-xs p-2.5 rounded-xl text-center font-medium bg-emerald-50 text-emerald-800 border border-emerald-200';
        msgEl.textContent = '🚀 ' + (data.message || 'ซิงค์ข้อมูลขึ้น Supabase เรียบร้อยแล้ว');
      }
      alert(data.message || 'ซิงค์ข้อมูลขึ้น Supabase เรียบร้อยแล้ว');
      await loadAssets();
      await loadMaterials();
      await loadDatabaseStatus();
    } else {
      if (msgEl) {
        msgEl.className = 'text-xs p-2.5 rounded-xl text-center font-medium bg-rose-50 text-rose-800 border border-rose-200';
        msgEl.textContent = '❌ ' + (data.error || 'เกิดข้อผิดพลาดในการซิงค์');
      }
      alert('เกิดข้อผิดพลาด: ' + (data.error || 'ไม่สามารถซิงค์ข้อมูลได้'));
    }
  } catch (err) {
    if (msgEl) {
      msgEl.className = 'text-xs p-2.5 rounded-xl text-center font-medium bg-rose-50 text-rose-800 border border-rose-200';
      msgEl.textContent = '❌ เกิดข้อผิดพลาด: ' + err.message;
    }
    alert('เกิดข้อผิดพลาด: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🚀 ซิงค์ข้อมูลขึ้น Supabase';
    }
  }
}

// ==================== DOM READY ====================
document.addEventListener('DOMContentLoaded', async () => {
  initOrgSettings();
  initMaterialMeta();

  // กำหนดวันปัจจุบันเป็นค่าเริ่มต้นในฟอร์ม
  const today = new Date().toISOString().split('T')[0];
  const aDate = document.getElementById('a_date');
  const mDate = document.getElementById('m_date');
  if (aDate) aDate.value = today;
  if (mDate) mDate.value = today;

  // ตรวจสอบการเข้าสู่ระบบ
  await checkAuthAndInitialize();
});

// ==================== สลับแท็บ (Screen & Print Sync) ====================
function switchTab(tab) {
  currentTab = tab;
  const screenAsset = document.getElementById('tab-asset-screen');
  const screenMaterial = document.getElementById('tab-material-screen');
  const btnAsset = document.getElementById('tab-asset-btn');
  const btnMaterial = document.getElementById('tab-material-btn');

  if (tab === 'asset') {
    screenAsset.classList.remove('hidden');
    screenMaterial.classList.add('hidden');
    setPrintTarget('asset');

    btnAsset.className = 'flex-1 sm:flex-initial text-center justify-center px-3 py-2 sm:px-4 sm:py-2 bg-gradient-to-r from-amber-400 via-amber-400 to-amber-500 text-red-950 font-bold rounded-xl shadow-md hover:from-amber-300 hover:to-amber-400 transition text-xs sm:text-sm whitespace-nowrap';
    btnMaterial.className = 'flex-1 sm:flex-initial text-center justify-center px-3 py-2 sm:px-4 sm:py-2 bg-red-950/70 hover:bg-red-800/80 text-amber-100 font-medium rounded-xl border border-amber-400/20 transition text-xs sm:text-sm whitespace-nowrap';
  } else {
    screenAsset.classList.add('hidden');
    screenMaterial.classList.remove('hidden');
    setPrintTarget('material');

    btnAsset.className = 'flex-1 sm:flex-initial text-center justify-center px-3 py-2 sm:px-4 sm:py-2 bg-red-950/70 hover:bg-red-800/80 text-amber-100 font-medium rounded-xl border border-amber-400/20 transition text-xs sm:text-sm whitespace-nowrap';
    btnMaterial.className = 'flex-1 sm:flex-initial text-center justify-center px-3 py-2 sm:px-4 sm:py-2 bg-gradient-to-r from-amber-400 via-amber-400 to-amber-500 text-red-950 font-bold rounded-xl shadow-md hover:from-amber-300 hover:to-amber-400 transition text-xs sm:text-sm whitespace-nowrap';
  }
}

// ==================== ส่วนราชการ & หน่วยงาน (สำหรับพิมพ์) ====================
function initOrgSettings() {
  let org = cleanFieldText(localStorage.getItem('gov_org'));
  let dept = cleanFieldText(localStorage.getItem('gov_dept'));

  // ถ้ารายการมีเครื่องหมาย ? (UTF-8 เสียหาย) หรือเป็นหน่วยงานเก่า หรือยังว่าง ให้ปรับเป็นโรงเรียนบ้านดงกลาง / สพป.ตราด ทันที
  if (!org || org.includes('?') || org.includes('กศน.')) {
    org = DEFAULT_ORG;
    localStorage.setItem('gov_org', org);
  }
  if (!dept || dept.includes('?') || dept.includes('นครราชสีมา')) {
    dept = DEFAULT_DEPT;
    localStorage.setItem('gov_dept', dept);
  }

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
  let meta = {};
  try {
    meta = JSON.parse(localStorage.getItem('material_card_meta') || '{}');
  } catch(e) {
    meta = {};
  }

  // ล้างค่าที่อาจมีเครื่องหมาย ? เสียหาย
  Object.keys(meta).forEach(k => {
    if (typeof meta[k] === 'string' && meta[k].includes('?')) meta[k] = '';
  });
  
  const setField = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    const clean = cleanFieldText(val);
    el.innerHTML = safeThaiWordBreak(escapeHtml(clean)) || '&nbsp;';
  };

  setField('disp-category', meta.category);
  setField('disp-code', meta.code);
  setField('disp-name', meta.name);
  setField('disp-minmax', meta.minmax);
  setField('disp-spec', meta.spec);
  setField('disp-location', meta.location);
  setField('disp-unit', meta.unit);

  const setInput = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = cleanFieldText(val);
  };

  setInput('inp-meta-category', meta.category);
  setInput('inp-meta-code', meta.code);
  setInput('inp-meta-name', meta.name);
  setInput('inp-meta-minmax', meta.minmax);
  setInput('inp-meta-spec', meta.spec);
  setInput('inp-meta-location', meta.location);
  setInput('inp-meta-unit', meta.unit);
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
let assetStatusFilter = 'all';
let materialFiscalYear = '2570';
let materialMonth = 'all';

let assetSearchQuery = '';
let materialSearchQuery = '';

// ==================== ตัวช่วยข้อมูลจำหน่ายครุภัณฑ์ (Disposal Helpers) ====================
function extractDisposalInfo(item) {
  if (!item) return { reason: '', method: '', date: '', cleanRemark: '' };
  let reason = item.disposal_reason || '';
  let method = item.disposal_method || '';
  let date = item.disposal_date || '';
  let cleanRemark = item.remark || '';

  // ตรวจจับแท็ก [จำหน่าย: ... | วิธี: ... | วันที่: ...] ที่ฝังไว้ใน remark
  const match = cleanRemark.match(/\[จำหน่าย:\s*(.*?)\s*\|\s*วิธี:\s*(.*?)(?:\s*\|\s*วันที่:\s*(.*?))?\]/);
  if (match) {
    if (!reason) reason = match[1] || '';
    if (!method) method = match[2] || '';
    if (!date && match[3]) date = match[3] || '';
    cleanRemark = cleanRemark.replace(match[0], '').trim();
  }
  return { reason, method, date, cleanRemark };
}

// ป้องกันคำภาษาไทยขาดท่อน/ตัดคำผิดกลางคำ (ใช้ Unicode Word Joiner U+2060 และ Non-breaking tags)
function safeThaiWordBreak(text) {
  if (!text) return '';
  return String(text)
    // ผูกคำว่า "วันที่" ไม่ให้แยกท่อนเป็น "วัน" กับ "ที่"
    .replace(/วันที่/g, 'วัน\u2060ที่')
    .replace(/ชำรุด/g, 'ชำ\u2060รุด')
    .replace(/เสื่อมสภาพ/g, 'เสื่อม\u2060สภาพ')
    .replace(/ขายทอดตลาด/g, 'ขาย\u2060ทอด\u2060ตลาด')
    .replace(/สามารถ/g, 'สา\u2060มารถ')
    .replace(/ผู้รับผิดชอบ/g, 'ผู้\u2060รับ\u2060ผิด\u2060ชอบ')
    .replace(/ประจำปี/g, 'ประจำ\u2060ปี')
    .replace(/ราคาต่อหน่วย/g, 'ราคา\u2060ต่อ\u2060หน่วย')
    .replace(/มูลค่าสุทธิ/g, 'มูล\u2060ค่า\u2060สุทธิ')
    .replace(/ค่าเสื่อมราคา/g, 'ค่า\u2060เสื่อม\u2060ราคา');
}

// จัดรูปแบบการแสดงผลช่องหมายเหตุสำหรับพิมพ์ ป้องกันข้อความอัดกันจนคำขาด
function renderPrintRemark(remark, fallbackLocation = '') {
  const text = (remark || fallbackLocation || '').trim();
  if (!text) return '-';

  // ตรวจจับกรณีมีแท็กขอจำหน่าย [จำหน่าย: ... | วิธี: ... | วันที่: ...]
  const match = text.match(/\[จำหน่าย:\s*(.*?)\s*\|\s*วิธี:\s*(.*?)(?:\s*\|\s*วันที่:\s*(.*?))?\]\s*(.*)/);
  if (match) {
    const reason = match[1] || '';
    const method = match[2] || '';
    const date = match[3] || '';
    const extra = (match[4] || '').trim();

    return `
      <div class="space-y-0.5 leading-tight text-[10px]">
        <div><span class="font-bold text-rose-800">[ขอจำหน่าย]</span> ${safeThaiWordBreak(escapeHtml(reason))}</div>
        <div class="whitespace-nowrap text-slate-800"><span class="font-medium">วิธี:</span> ${safeThaiWordBreak(escapeHtml(method))}</div>
        ${date ? `<div class="whitespace-nowrap text-slate-800"><span class="font-medium">วันที่:</span> ${formatThaiDate(date)}</div>` : ''}
        ${extra ? `<div class="text-slate-600 text-[9.5px]">${safeThaiWordBreak(escapeHtml(extra))}</div>` : ''}
      </div>
    `.trim();
  }

  return `<div class="leading-snug text-[10.5px]">${safeThaiWordBreak(escapeHtml(text))}</div>`;
}

function onAssetStatusChange(status) {
  const group = document.getElementById('disposal-fields-group');
  if (!group) return;
  const isDisposal = (status === 'ชำรุด/เสื่อมสภาพ (ขอจำหน่าย)' || status === 'จำหน่ายแล้ว' || status === 'สูญหาย');
  if (isDisposal) {
    group.classList.remove('hidden');
    const dDate = document.getElementById('a_disposal_date');
    if (dDate && !dDate.value) {
      dDate.value = new Date().toISOString().split('T')[0];
    }
  } else {
    group.classList.add('hidden');
  }
}

function getAssetStatusBadge(status) {
  const s = status || 'ใช้งานได้ดี';
  if (s === 'ใช้งานได้ดี') {
    return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs whitespace-nowrap">🟢 ใช้งานได้ดี</span>`;
  } else if (s.includes('ซ่อม')) {
    return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs whitespace-nowrap">🟠 ชำรุด (ซ่อมได้)</span>`;
  } else if (s.includes('ขอจำหน่าย')) {
    return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs whitespace-nowrap animate-pulse">🔴 ขอจำหน่าย</span>`;
  } else if (s.includes('จำหน่ายแล้ว') || s.includes('แทงจำหน่าย')) {
    return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-800 border border-slate-400 shadow-2xs whitespace-nowrap">⚫ จำหน่ายแล้ว</span>`;
  } else if (s.includes('สูญหาย')) {
    return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-100 text-purple-800 border border-purple-300 shadow-2xs whitespace-nowrap">⚪ สูญหาย</span>`;
  }
  return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs whitespace-nowrap">${escapeHtml(s)}</span>`;
}

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
  const statusSelect = document.getElementById('asset-status-select');
  if (fySelect) assetFiscalYear = fySelect.value;
  if (mSelect) assetMonth = mSelect.value;
  if (statusSelect) assetStatusFilter = statusSelect.value;
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

    // 3. กรองสภาพ/สถานะ
    if (assetStatusFilter !== 'all') {
      const s = (item.status || '').trim();
      if (assetStatusFilter === 'good' && s !== 'ใช้งานได้ดี') return false;
      if (assetStatusFilter === 'repair' && !s.includes('ซ่อม')) return false;
      if (assetStatusFilter === 'disposal' && !s.includes('ขอจำหน่าย')) return false;
      if (assetStatusFilter === 'disposed' && !s.includes('จำหน่ายแล้ว') && !s.includes('แทงจำหน่าย')) return false;
      if (assetStatusFilter === 'lost' && !s.includes('สูญหาย')) return false;
    }

    // 4. กรองคำค้นหา
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
        (item.status && item.status.toLowerCase().includes(q)) ||
        (item.remark && item.remark.toLowerCase().includes(q));
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
    const res = await authFetch('/api/assets');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        assetList = data;
        localStorage.setItem('cached_assets', JSON.stringify(assetList));
      }
    } else {
      throw new Error('Server status ' + res.status);
    }
  } catch (err) {
    console.warn('Could not fetch assets from server, using local cache:', err);
    const cached = localStorage.getItem('cached_assets');
    if (cached) {
      try { assetList = JSON.parse(cached); } catch(e) {}
    }
  }

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
        ${getAssetStatusBadge(item.status)}
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
  setPrintTarget('asset');
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
  setPrintTarget('asset');
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
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${safeThaiWordBreak(escapeHtml(category)) || '&nbsp;'}</span>
          </div>
          <div class="col-span-3 flex items-end">
            <span class="whitespace-nowrap font-medium">รหัส&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${escapeHtml(assetCode) || '&nbsp;'}</span>
          </div>
          <div class="col-span-3 flex items-end">
            <span class="whitespace-nowrap font-medium">ลักษณะ/สมบัติ&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${safeThaiWordBreak(escapeHtml(spec)) || '&nbsp;'}</span>
          </div>
          <div class="col-span-3 flex items-end">
            <span class="whitespace-nowrap font-medium">รุ่นแบบ&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${safeThaiWordBreak(escapeHtml(model)) || '&nbsp;'}</span>
          </div>
        </div>

        <!-- แถวที่ 2: สถานที่ตั้ง/หน่วยที่รับผิดชอบ | ชื่อผู้ขาย/ผู้รับจ้าง/ผู้บริจาค -->
        <div class="grid grid-cols-12 gap-x-4 items-end">
          <div class="col-span-6 flex items-end">
            <span class="whitespace-nowrap font-medium">สถานที่ตั้ง/หน่วยที่รับผิดชอบ&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${safeThaiWordBreak(escapeHtml(location)) || '&nbsp;'}</span>
          </div>
          <div class="col-span-6 flex items-end">
            <span class="whitespace-nowrap font-medium">ชื่อผู้ขาย/ผู้รับจ้าง/ผู้บริจาค&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${safeThaiWordBreak(escapeHtml(vendor)) || '&nbsp;'}</span>
          </div>
        </div>

        <!-- แถวที่ 3: ที่อยู่ | โทรศัพท์ -->
        <div class="grid grid-cols-12 gap-x-4 items-end">
          <div class="col-span-8 flex items-end">
            <span class="whitespace-nowrap font-medium">ที่อยู่&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${safeThaiWordBreak(escapeHtml(vendorAddress)) || '&nbsp;'}</span>
          </div>
          <div class="col-span-4 flex items-end">
            <span class="whitespace-nowrap font-medium">โทรศัพท์&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${escapeHtml(vendorPhone) || '&nbsp;'}</span>
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
            <th class="min-w-[145px] w-36">หมายเหตุ</th>
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
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${safeThaiWordBreak(escapeHtml(category)) || '&nbsp;'}</span>
          </div>
          <div class="col-span-3 flex items-end">
            <span class="whitespace-nowrap font-medium">รหัส&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${escapeHtml(assetCode) || '&nbsp;'}</span>
          </div>
          <div class="col-span-3 flex items-end">
            <span class="whitespace-nowrap font-medium">ลักษณะ/สมบัติ&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${safeThaiWordBreak(escapeHtml(spec)) || '&nbsp;'}</span>
          </div>
          <div class="col-span-3 flex items-end">
            <span class="whitespace-nowrap font-medium">รุ่นแบบ&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${safeThaiWordBreak(escapeHtml(model)) || '&nbsp;'}</span>
          </div>
        </div>

        <div class="grid grid-cols-12 gap-x-4 items-end">
          <div class="col-span-6 flex items-end">
            <span class="whitespace-nowrap font-medium">สถานที่ตั้ง/หน่วยที่รับผิดชอบ&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${safeThaiWordBreak(escapeHtml(location)) || '&nbsp;'}</span>
          </div>
          <div class="col-span-6 flex items-end">
            <span class="whitespace-nowrap font-medium">ชื่อผู้ขาย/ผู้รับจ้าง/ผู้บริจาค&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${safeThaiWordBreak(escapeHtml(vendor)) || '&nbsp;'}</span>
          </div>
        </div>

        <div class="grid grid-cols-12 gap-x-4 items-end">
          <div class="col-span-8 flex items-end">
            <span class="whitespace-nowrap font-medium">ที่อยู่&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${safeThaiWordBreak(escapeHtml(vendorAddress)) || '&nbsp;'}</span>
          </div>
          <div class="col-span-4 flex items-end">
            <span class="whitespace-nowrap font-medium">โทรศัพท์&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow min-h-[16px] px-1 font-normal">${escapeHtml(vendorPhone) || '&nbsp;'}</span>
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
            <th class="min-w-[145px] w-36">หมายเหตุ</th>
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
        <td class="text-left font-medium">${safeThaiWordBreak(escapeHtml(item.asset_name || ''))}</td>
        <td class="text-center">${item.qty || 1}</td>
        <td class="text-right whitespace-nowrap">${item.cost ? Number(item.cost).toLocaleString('th-TH', {minimumFractionDigits: 2}) : '-'}</td>
        <td class="text-right whitespace-nowrap">${item.total_cost ? Number(item.total_cost).toLocaleString('th-TH', {minimumFractionDigits: 2}) : '-'}</td>
        <td class="text-center">${item.useful_life ? item.useful_life + ' ปี' : ''}</td>
        <td class="text-center">${item.depr_rate || '20%'}</td>
        <td class="text-right whitespace-nowrap text-slate-600">${item.acc_depr ? Number(item.acc_depr).toLocaleString('th-TH', {minimumFractionDigits: 2}) : '0.00'}</td>
        <td class="text-right font-bold text-black whitespace-nowrap">${item.net_book_value ? Number(item.net_book_value).toLocaleString('th-TH', {minimumFractionDigits: 2}) : '-'}</td>
        <td class="text-left">${renderPrintRemark(item.remark, item.location)}</td>
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
  document.getElementById('a_status').value = 'ใช้งานได้ดี';
  const rSel = document.getElementById('a_disposal_reason');
  const mSel = document.getElementById('a_disposal_method');
  const dInp = document.getElementById('a_disposal_date');
  if (rSel) rSel.value = 'ชำรุดจนไม่สามารถซ่อมแซมได้';
  if (mSel) mSel.value = 'ขายทอดตลาด';
  if (dInp) dInp.value = new Date().toISOString().split('T')[0];
  onAssetStatusChange('ใช้งานได้ดี');
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

  const dispInfo = extractDisposalInfo(item);
  const rSel = document.getElementById('a_disposal_reason');
  const mSel = document.getElementById('a_disposal_method');
  const dInp = document.getElementById('a_disposal_date');
  if (rSel) rSel.value = dispInfo.reason || 'ชำรุดจนไม่สามารถซ่อมแซมได้';
  if (mSel) mSel.value = dispInfo.method || 'ขายทอดตลาด';
  if (dInp) dInp.value = dispInfo.date || (new Date().toISOString().split('T')[0]);
  document.getElementById('a_remark').value = dispInfo.cleanRemark || '';

  onAssetStatusChange(item.status || 'ใช้งานได้ดี');
  openModal('assetModal');
}

async function saveAsset(e) {
  e.preventDefault();
  const editId = document.getElementById('edit_asset_id').value;
  const status = document.getElementById('a_status').value;
  const dispReason = cleanFieldText(document.getElementById('a_disposal_reason')?.value);
  const dispMethod = cleanFieldText(document.getElementById('a_disposal_method')?.value);
  const dispDate = cleanFieldText(document.getElementById('a_disposal_date')?.value);
  let rawRemark = cleanFieldText(document.getElementById('a_remark').value);

  let fullRemark = rawRemark;
  if (status === 'ชำรุด/เสื่อมสภาพ (ขอจำหน่าย)' || status === 'จำหน่ายแล้ว' || status === 'สูญหาย') {
    if (dispReason || dispMethod || dispDate) {
      fullRemark = `[จำหน่าย: ${dispReason || '-'} | วิธี: ${dispMethod || '-'}${dispDate ? ` | วันที่: ${dispDate}` : ''}] ${rawRemark}`.trim();
    }
  }

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
    status: status,
    vendor: cleanFieldText(document.getElementById('a_vendor').value),
    vendor_address: cleanFieldText(document.getElementById('a_vendor_address').value),
    vendor_phone: cleanFieldText(document.getElementById('a_vendor_phone').value),
    budget_source: document.getElementById('a_budget_source').value,
    acquisition_method: document.getElementById('a_acquisition_method').value,
    responsible_person: cleanFieldText(document.getElementById('a_person').value),
    remark: fullRemark
  };

  const url = editId ? `/api/assets/${editId}` : '/api/assets';
  const method = editId ? 'PUT' : 'POST';

  const res = await authFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (res.ok) {
    closeModal('assetModal');
    loadAssets();
  } else {
    const err = await res.json().catch(() => ({}));
    alert('เกิดข้อผิดพลาด: ' + (err.error || 'ไม่สามารถบันทึกได้'));
  }
}

async function deleteAsset(id) {
  if (!id) return;
  const item = assetList.find(a => String(a.id) === String(id));
  const itemName = item ? (item.asset_name || item.asset_code || 'รายการนี้') : 'รายการนี้';

  if (!confirm(`ยืนยันที่จะลบ "${itemName}" หรือไม่?\nข้อมูลจะถูกลบออกจากระบบ`)) {
    return;
  }

  // 1. นำออกจาก memory และ local storage ทันทีเพื่อให้หน้าจออัปเดตตอบสนองทันใจ
  assetList = assetList.filter(a => String(a.id) !== String(id));
  localStorage.setItem('cached_assets', JSON.stringify(assetList));
  selectedAssetIds.delete(Number(id));
  selectedAssetIds.delete(id);

  // 2. อัปเดตหน้าจอทันที
  populateFiscalYearOptions('asset');
  renderAssetTable();
  updateAssetSelectionUI();
  renderAssetPrint();

  try {
    // 3. ส่งคำขอลบไปยังเซิร์ฟเวอร์
    const res = await authFetch(`/api/assets/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert('เกิดข้อผิดพลาดจากเซิร์ฟเวอร์: ' + (err.error || res.statusText));
      await loadAssets();
      return;
    }

    // 4. ซิงค์ข้อมูลล่าสุดกับเซิร์ฟเวอร์
    const refreshedRes = await authFetch('/api/assets');
    if (refreshedRes.ok) {
      const refreshedData = await refreshedRes.json();
      if (Array.isArray(refreshedData)) {
        assetList = refreshedData;
        localStorage.setItem('cached_assets', JSON.stringify(assetList));
        populateFiscalYearOptions('asset');
        renderAssetTable();
        updateAssetSelectionUI();
        renderAssetPrint();
      }
    }
  } catch (err) {
    console.error('Delete error:', err);
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์: ' + err.message);
    await loadAssets();
  }
}

// ==============================================================
// บัญชีคุมวัสดุ
// ==============================================================
async function loadMaterials() {
  try {
    const res = await authFetch('/api/materials');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        materialList = data;
        localStorage.setItem('cached_materials', JSON.stringify(materialList));
      }
    } else {
      throw new Error('Server status ' + res.status);
    }
  } catch (err) {
    console.warn('Could not fetch materials from server, using local cache:', err);
    const cached = localStorage.getItem('cached_materials');
    if (cached) {
      try { materialList = JSON.parse(cached); } catch(e) {}
    }
  }

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
  setPrintTarget('material');
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
      <td class="text-left font-medium">${safeThaiWordBreak(escapeHtml(item.party || ''))}</td>
      <td class="text-center whitespace-nowrap">${escapeHtml(item.doc_no || '')}</td>
      <td class="text-left">${safeThaiWordBreak(escapeHtml(item.budget_type || ''))}</td>
      <td class="text-center">${openStock}</td>
      <td class="text-center text-green-700 font-semibold">${qtyIn}</td>
      <td class="text-center text-red-700 font-semibold">${qtyOut}</td>
      <td class="text-center font-bold bg-slate-50">${item.balance}</td>
      <td class="text-right whitespace-nowrap">${item.unit_price ? Number(item.unit_price).toLocaleString('th-TH', {minimumFractionDigits: 2}) : ''}</td>
      <td class="text-right font-bold text-black whitespace-nowrap">${item.total_amount ? Number(item.total_amount).toLocaleString('th-TH', {minimumFractionDigits: 2}) : ''}</td>
      <td class="text-left">${renderPrintRemark(item.remark, '')}</td>
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

  const res = await authFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (res.ok) {
    closeModal('materialModal');
    loadMaterials();
  } else {
    const err = await res.json().catch(() => ({}));
    alert('เกิดข้อผิดพลาด: ' + (err.error || 'ไม่สามารถบันทึกได้'));
  }
}

async function deleteMaterial(id) {
  if (!id) return;
  const item = materialList.find(m => String(m.id) === String(id));
  const itemName = item ? (item.party || item.doc_no || 'รายการนี้') : 'รายการนี้';

  if (!confirm(`ยืนยันที่จะลบ "${itemName}" หรือไม่?\nข้อมูลจะถูกลบออกจากระบบ`)) {
    return;
  }

  materialList = materialList.filter(m => String(m.id) !== String(id));
  localStorage.setItem('cached_materials', JSON.stringify(materialList));
  selectedMaterialIds.delete(Number(id));
  selectedMaterialIds.delete(id);

  populateFiscalYearOptions('material');
  renderMaterialTable();
  updateMaterialSelectionUI();
  renderMaterialPrint();

  try {
    const res = await authFetch(`/api/materials/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert('เกิดข้อผิดพลาดจากเซิร์ฟเวอร์: ' + (err.error || res.statusText));
      await loadMaterials();
      return;
    }

    const refreshedRes = await authFetch('/api/materials');
    if (refreshedRes.ok) {
      const refreshedData = await refreshedRes.json();
      if (Array.isArray(refreshedData)) {
        materialList = refreshedData;
        localStorage.setItem('cached_materials', JSON.stringify(materialList));
        populateFiscalYearOptions('material');
        renderMaterialTable();
        updateMaterialSelectionUI();
        renderMaterialPrint();
      }
    }
  } catch (err) {
    console.error('Delete material error:', err);
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์: ' + err.message);
    await loadMaterials();
  }
}

// ==================== สำรอง & กู้คืนข้อมูล ====================
async function exportBackup() {
  try {
    const res = await authFetch('/api/backup');
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

      const res = await authFetch('/api/restore', {
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

// ==============================================================
// 4. รายงานผลการตรวจสอบพัสดุประจำปีงบประมาณ (ระเบียบฯ พ.ศ. ๒๕๖๐ ข้อ ๒๑๓)
// ==============================================================
function getInspectionAssets(fiscalYear) {
  if (fiscalYear === 'all') return [...assetList];
  return assetList.filter(item => {
    const { fiscalYear: fy } = getFiscalYearAndMonth(item.received_date);
    return String(fy) === String(fiscalYear);
  });
}

function openAnnualInspectionModal() {
  const selectEl = document.getElementById('ai-fiscal-year');
  if (selectEl) {
    const availableYears = getAvailableFiscalYears(assetList, 'received_date');
    selectEl.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.innerText = 'ทุกปีงบประมาณ (สะสมทั้งหมด)';
    selectEl.appendChild(optAll);

    availableYears.forEach(year => {
      const opt = document.createElement('option');
      opt.value = String(year);
      const shortYear = String(year).slice(-2);
      opt.innerText = `ปีงบประมาณ ${year} (ปีงบ ${shortYear})`;
      selectEl.appendChild(opt);
    });

    if (assetFiscalYear && assetFiscalYear !== 'all') {
      selectEl.value = assetFiscalYear;
    } else if (availableYears.includes(START_FISCAL_YEAR)) {
      selectEl.value = String(START_FISCAL_YEAR);
    }
  }

  // โหลดรายชื่อและข้อมูลที่บันทึกไว้ใน localStorage
  const chair = localStorage.getItem('ai_chair_name') || '';
  const mem1 = localStorage.getItem('ai_member1_name') || '';
  const mem2 = localStorage.getItem('ai_member2_name') || '';
  let director = localStorage.getItem('ai_director_name') || '';
  if (!director) director = 'ผู้อำนวยการโรงเรียนบ้านดงกลาง';

  const orderNo = localStorage.getItem('ai_order_no') || '45/2570';
  const docNo = localStorage.getItem('ai_doc_no') || 'ศธ 04153.25/...';

  const inpChair = document.getElementById('ai-chair-name');
  const inpMem1 = document.getElementById('ai-member1-name');
  const inpMem2 = document.getElementById('ai-member2-name');
  const inpDir = document.getElementById('ai-director-name');
  const inpOrder = document.getElementById('ai-order-no');
  const inpDoc = document.getElementById('ai-doc-no');
  const inpOrderDate = document.getElementById('ai-order-date');
  const inpInspectDate = document.getElementById('ai-inspect-date');

  if (inpChair) inpChair.value = chair;
  if (inpMem1) inpMem1.value = mem1;
  if (inpMem2) inpMem2.value = mem2;
  if (inpDir) inpDir.value = director;
  if (inpOrder) inpOrder.value = orderNo;
  if (inpDoc) inpDoc.value = docNo;

  const today = new Date().toISOString().split('T')[0];
  if (inpOrderDate && !inpOrderDate.value) inpOrderDate.value = today;
  if (inpInspectDate && !inpInspectDate.value) inpInspectDate.value = today;

  updateAnnualInspectionPreview();
  openModal('annualInspectionModal');
}

function updateAnnualInspectionPreview() {
  const fySelect = document.getElementById('ai-fiscal-year');
  const fy = fySelect ? fySelect.value : 'all';
  const list = getInspectionAssets(fy);

  let totalCost = 0;
  let goodCount = 0, goodCost = 0;
  let repairCount = 0, repairCost = 0;
  let disposalCount = 0, disposalCost = 0;
  let lostCount = 0, lostCost = 0;

  list.forEach(item => {
    const cost = parseFloat(item.cost) || 0;
    totalCost += cost;
    const s = (item.status || '').trim();
    if (s === 'ใช้งานได้ดี') {
      goodCount++;
      goodCost += cost;
    } else if (s.includes('ซ่อม')) {
      repairCount++;
      repairCost += cost;
    } else if (s.includes('ขอจำหน่าย') || s.includes('จำหน่ายแล้ว')) {
      disposalCount++;
      disposalCost += cost;
    } else if (s.includes('สูญหาย')) {
      lostCount++;
      lostCost += cost;
    } else {
      goodCount++;
      goodCost += cost;
    }
  });

  const sumTotal = document.getElementById('ai-sum-total');
  const sumTotalVal = document.getElementById('ai-sum-total-val');
  const sumGood = document.getElementById('ai-sum-good');
  const sumGoodVal = document.getElementById('ai-sum-good-val');
  const sumRepair = document.getElementById('ai-sum-repair');
  const sumRepairVal = document.getElementById('ai-sum-repair-val');
  const sumDisposal = document.getElementById('ai-sum-disposal');
  const sumDisposalVal = document.getElementById('ai-sum-disposal-val');

  if (sumTotal) sumTotal.innerText = `${list.length} รายการ`;
  if (sumTotalVal) sumTotalVal.innerText = `${Number(totalCost).toLocaleString('th-TH', {minimumFractionDigits: 2})} บาท`;
  if (sumGood) sumGood.innerText = `${goodCount} รายการ`;
  if (sumGoodVal) sumGoodVal.innerText = `${Number(goodCost).toLocaleString('th-TH', {minimumFractionDigits: 2})} บาท`;
  if (sumRepair) sumRepair.innerText = `${repairCount} รายการ`;
  if (sumRepairVal) sumRepairVal.innerText = `${Number(repairCost).toLocaleString('th-TH', {minimumFractionDigits: 2})} บาท`;
  if (sumDisposal) sumDisposal.innerText = `${disposalCount} รายการ`;
  if (sumDisposalVal) sumDisposalVal.innerText = `${Number(disposalCost).toLocaleString('th-TH', {minimumFractionDigits: 2})} บาท`;
}

function handlePrintAnnualInspection(e) {
  e.preventDefault();
  const fySelect = document.getElementById('ai-fiscal-year');
  const fiscalYear = fySelect ? fySelect.value : 'all';
  const orderNo = cleanFieldText(document.getElementById('ai-order-no').value) || '45/2570';
  const orderDate = document.getElementById('ai-order-date').value || new Date().toISOString().split('T')[0];
  const inspectDate = document.getElementById('ai-inspect-date').value || new Date().toISOString().split('T')[0];
  const docNo = cleanFieldText(document.getElementById('ai-doc-no').value) || 'ศธ 04153.25/...';
  const chair = cleanFieldText(document.getElementById('ai-chair-name').value);
  const mem1 = cleanFieldText(document.getElementById('ai-member1-name').value);
  const mem2 = cleanFieldText(document.getElementById('ai-member2-name').value);
  const director = cleanFieldText(document.getElementById('ai-director-name').value) || 'ผู้อำนวยการโรงเรียนบ้านดงกลาง';

  // บันทึกความจำลง localStorage อัตโนมัติ
  localStorage.setItem('ai_chair_name', chair);
  localStorage.setItem('ai_member1_name', mem1);
  localStorage.setItem('ai_member2_name', mem2);
  localStorage.setItem('ai_director_name', director);
  localStorage.setItem('ai_order_no', orderNo);
  localStorage.setItem('ai_doc_no', docNo);

  const items = getInspectionAssets(fiscalYear);
  const printSection = document.getElementById('print-annual-inspection-section');
  if (printSection) {
    printSection.innerHTML = generateAnnualInspectionPrintHtml(fiscalYear, orderNo, orderDate, inspectDate, docNo, chair, mem1, mem2, director, items);
  }

  setPrintTarget('annualInspection');
  closeModal('annualInspectionModal');
  window.print();
}

function generateAnnualInspectionPrintHtml(fiscalYear, orderNo, orderDate, inspectDate, docNo, chair, mem1, mem2, director, items) {
  const org = cleanFieldText(localStorage.getItem('gov_org')) || DEFAULT_ORG;
  const dept = cleanFieldText(localStorage.getItem('gov_dept')) || DEFAULT_DEPT;
  const fyDisplay = fiscalYear === 'all' ? 'ทั้งหมด (สะสม)' : fiscalYear;

  let totalCost = 0, totalNet = 0;
  let goodCount = 0, goodCost = 0;
  let repairCount = 0, repairCost = 0;
  let disposalCount = 0, disposalCost = 0;
  let lostCount = 0, lostCost = 0;

  items.forEach(item => {
    const cost = parseFloat(item.cost) || 0;
    const net = parseFloat(item.net_book_value) || 0;
    totalCost += cost;
    totalNet += net;
    const s = (item.status || '').trim();
    if (s === 'ใช้งานได้ดี') {
      goodCount++;
      goodCost += cost;
    } else if (s.includes('ซ่อม')) {
      repairCount++;
      repairCost += cost;
    } else if (s.includes('ขอจำหน่าย') || s.includes('จำหน่ายแล้ว')) {
      disposalCount++;
      disposalCost += cost;
    } else if (s.includes('สูญหาย')) {
      lostCount++;
      lostCost += cost;
    } else {
      goodCount++;
      goodCost += cost;
    }
  });

  // สร้างแถวตารางแนบท้าย
  const tableRowsHtml = items.map((item, idx) => {
    const s = (item.status || '').trim();
    const isGood = s === 'ใช้งานได้ดี';
    const isRepair = s.includes('ซ่อม');
    const isDisposal = s.includes('ขอจำหน่าย') || s.includes('จำหน่ายแล้ว');
    const isLost = s.includes('สูญหาย');

    return `
      <tr>
        <td class="text-center font-normal">${idx + 1}</td>
        <td class="text-left font-medium whitespace-nowrap">${escapeHtml(item.asset_code || '')}</td>
        <td class="text-left font-medium">${safeThaiWordBreak(escapeHtml(item.asset_name || ''))} ${item.spec ? `<span class="text-[9px] text-slate-600 block">(${safeThaiWordBreak(escapeHtml(item.spec))})</span>` : ''}</td>
        <td class="text-center whitespace-nowrap">${formatThaiDate(item.received_date)}</td>
        <td class="text-center">${item.useful_life ? item.useful_life + ' ปี' : '-'}</td>
        <td class="text-right whitespace-nowrap">${Number(item.cost || 0).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
        <td class="text-right whitespace-nowrap font-semibold">${Number(item.net_book_value || 0).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
        <td class="text-left text-[10px]">${safeThaiWordBreak(escapeHtml(item.location || item.responsible_person || '-'))}</td>
        <td class="text-center whitespace-nowrap text-[10px]">
          ${isGood ? '☑ ใช้ได้ดี' : (isRepair ? '☑ ชำรุดซ่อมได้' : (isDisposal ? '☑ ขอจำหน่าย' : (isLost ? '☑ สูญหาย' : escapeHtml(s))))}
        </td>
        <td class="text-left text-[9px]">${renderPrintRemark(item.remark, '')}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="print-asset-card page-break">
      <!-- บันทึกข้อความ รายงานผลการตรวจสอบพัสดุประจำปี (หน้า 1) -->
      <div class="border-b-2 border-black pb-2 mb-3">
        <div class="flex items-center justify-between">
          <div class="w-20">
            <span class="text-3xl font-bold">🦅</span>
          </div>
          <div class="text-center flex-grow">
            <h1 class="text-2xl font-bold tracking-widest text-black">บันทึกข้อความ</h1>
          </div>
          <div class="w-24 text-right text-[10px] text-slate-600">
            (ระเบียบกระทรวงการคลังฯ พ.ศ. ๒๕๖๐ ข้อ ๒๑๓)
          </div>
        </div>
        
        <div class="grid grid-cols-12 gap-y-1.5 text-xs text-black mt-2">
          <div class="col-span-8 flex items-end">
            <span class="font-bold whitespace-nowrap">ส่วนราชการ&nbsp;&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow px-1 font-medium">${dept} ${org}</span>
          </div>
          <div class="col-span-4 flex items-end justify-end">
            <span class="font-bold whitespace-nowrap">โทร.&nbsp;&nbsp;</span>
            <span class="border-b border-dotted border-black w-28 px-1 text-center font-medium">-</span>
          </div>
          <div class="col-span-6 flex items-end">
            <span class="font-bold whitespace-nowrap">ที่&nbsp;&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow px-1 font-medium">${docNo}</span>
          </div>
          <div class="col-span-6 flex items-end justify-end">
            <span class="font-bold whitespace-nowrap">วันที่&nbsp;&nbsp;</span>
            <span class="border-b border-dotted border-black w-48 px-1 text-center font-medium">${formatThaiDate(inspectDate)}</span>
          </div>
          <div class="col-span-12 flex items-end mt-0.5">
            <span class="font-bold whitespace-nowrap">เรื่อง&nbsp;&nbsp;</span>
            <span class="font-bold flex-grow px-1">รายงานผลการตรวจสอบพัสดุประจำปีงบประมาณ พ.ศ. ${fyDisplay}</span>
          </div>
        </div>
      </div>

      <div class="text-xs text-black space-y-2 mb-3 leading-relaxed">
        <div>
          <span class="font-bold">เรียน&nbsp;&nbsp;</span>
          <span>${director}</span>
        </div>
        <div class="pl-8 text-justify">
          ตามคำสั่ง ${dept} ที่ ${orderNo} ลงวันที่ ${formatThaiDate(orderDate)} ได้แต่งตั้งคณะกรรมการตรวจสอบพัสดุประจำปีงบประมาณ พ.ศ. ${fyDisplay} เพื่อดำเนินการตรวจสอบการรับจ่ายพัสดุและตรวจนับพัสดุคงเหลือ ณ วันสิ้นปีงบประมาณ (๓๐ กันยายน) นั้น
        </div>
        <div class="pl-8 text-justify">
          บัดนี้ คณะกรรมการได้ดำเนินการตรวจสอบพัสดุและตรวจนับครุภัณฑ์ของโรงเรียนเสร็จสิ้นเรียบร้อยแล้ว จึงขอรายงานผลการตรวจสอบพัสดุประจำปีงบประมาณ พ.ศ. ${fyDisplay} ปรากฏผลการตรวจนับ ดังนี้:
        </div>
        <div class="pl-12 space-y-1 my-1">
          <div>๑. ครุภัณฑ์ทั้งหมด จำนวน <b class="border-b border-dotted border-black px-2">${items.length}</b> รายการ รวมมูลค่า <b class="border-b border-dotted border-black px-2">${Number(totalCost).toLocaleString('th-TH', {minimumFractionDigits: 2})}</b> บาท (มูลค่าสุทธิ <b class="border-b border-dotted border-black px-2">${Number(totalNet).toLocaleString('th-TH', {minimumFractionDigits: 2})}</b> บาท)</div>
          <div>๒. ครุภัณฑ์ที่อยู่ในสภาพใช้งานได้ดี จำนวน <b class="border-b border-dotted border-black px-2">${goodCount}</b> รายการ รวมมูลค่า <b class="border-b border-dotted border-black px-2">${Number(goodCost).toLocaleString('th-TH', {minimumFractionDigits: 2})}</b> บาท</div>
          <div>๓. ครุภัณฑ์ที่ชำรุดแต่สามารถซ่อมแซมได้ จำนวน <b class="border-b border-dotted border-black px-2">${repairCount}</b> รายการ รวมมูลค่า <b class="border-b border-dotted border-black px-2">${Number(repairCost).toLocaleString('th-TH', {minimumFractionDigits: 2})}</b> บาท</div>
          <div>๔. ครุภัณฑ์ที่ชำรุด/เสื่อมสภาพ สมควรขอจำหน่าย จำนวน <b class="border-b border-dotted border-black px-2">${disposalCount}</b> รายการ รวมมูลค่า <b class="border-b border-dotted border-black px-2">${Number(disposalCost).toLocaleString('th-TH', {minimumFractionDigits: 2})}</b> บาท</div>
          ${lostCount > 0 ? `<div>๕. ครุภัณฑ์สูญหาย จำนวน <b class="border-b border-dotted border-black px-2">${lostCount}</b> รายการ รวมมูลค่า <b class="border-b border-dotted border-black px-2">${Number(lostCost).toLocaleString('th-TH', {minimumFractionDigits: 2})}</b> บาท</div>` : ''}
        </div>
        <div class="pl-8 text-justify">
          รายละเอียดรายการครุภัณฑ์ทั้งหมดปรากฏตามบัญชีรายละเอียดแนบท้ายรายงานนี้
        </div>
        <div class="pl-8 text-justify">
          จึงเรียนมาเพื่อโปรดทราบและพิจารณา
        </div>
      </div>

      <!-- ลายมือชื่อคณะกรรมการ 3 ท่าน -->
      <div class="grid grid-cols-3 gap-2 text-xs text-black text-center my-4">
        <div class="space-y-1">
          <div>(ลงชื่อ).....................................................ประธานกรรมการ</div>
          <div>( ${chair || '.....................................................'} )</div>
          <div class="text-[11px] text-slate-600">ประธานกรรมการตรวจสอบพัสดุ</div>
        </div>
        <div class="space-y-1">
          <div>(ลงชื่อ).....................................................กรรมการ</div>
          <div>( ${mem1 || '.....................................................'} )</div>
          <div class="text-[11px] text-slate-600">กรรมการตรวจสอบพัสดุ</div>
        </div>
        <div class="space-y-1">
          <div>(ลงชื่อ).....................................................กรรมการและเลขานุการ</div>
          <div>( ${mem2 || '.....................................................'} )</div>
          <div class="text-[11px] text-slate-600">กรรมการและเลขานุการ</div>
        </div>
      </div>

      <!-- ความเห็น / คำสั่งผู้อำนวยการโรงเรียน -->
      <div class="border border-black p-2.5 text-xs text-black rounded-none mt-2 max-w-xl mx-auto">
        <div class="font-bold mb-1">ความเห็น / คำสั่งของผู้อำนวยการโรงเรียน:</div>
        <div class="flex items-center gap-6 my-1 pl-2 font-medium">
          <label class="flex items-center gap-1.5"><span>☑</span> <span>ทราบ / เห็นชอบตามรายงานของคณะกรรมการ</span></label>
          <label class="flex items-center gap-1.5"><span>☐</span> <span>อื่นๆ .................................................</span></label>
        </div>
        <div class="text-center mt-3 space-y-1">
          <div>(ลงชื่อ)....................................................................</div>
          <div>( ${director} )</div>
          <div class="text-[11px]">ผู้อำนวยการ${dept}</div>
          <div class="text-[11px]">วันที่ ........ เดือน .................... พ.ศ. ............</div>
        </div>
      </div>
    </div>

    <!-- บัญชีรายละเอียดแนบท้ายรายงานผลการตรวจสอบพัสดุประจำปี (หน้า 2 เป็นต้นไป) -->
    <div class="print-asset-card">
      <div class="text-center mb-2">
        <h2 class="text-base font-bold text-black">บัญชีรายละเอียดการตรวจสอบพัสดุประจำปีงบประมาณ พ.ศ. ${fyDisplay}</h2>
        <div class="text-xs text-slate-700">${dept} ${org} (ตรวจนับ ณ วันที่ ${formatThaiDate(inspectDate)})</div>
      </div>

      <table class="form-table w-full text-[10px]">
        <thead>
          <tr class="bg-white font-bold text-center">
            <th class="w-7">ลำดับ</th>
            <th class="w-32">เลขทะเบียนครุภัณฑ์</th>
            <th class="min-w-[140px]">รายการ / คุณลักษณะ</th>
            <th class="w-16">วันที่ได้มา</th>
            <th class="w-14">อายุใช้งาน</th>
            <th class="w-20 leading-tight">ราคาต่อหน่วย<br>(บาท)</th>
            <th class="w-20 leading-tight">มูลค่าสุทธิ<br>(บาท)</th>
            <th class="w-28">สถานที่ตั้ง / ผู้รับผิดชอบ</th>
            <th class="w-24">ผลการตรวจสอบ</th>
            <th class="w-24">หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml || '<tr><td colspan="10" class="text-center p-4">ไม่มีรายการครุภัณฑ์</td></tr>'}
        </tbody>
        <tfoot>
          <tr class="font-bold text-black bg-slate-50">
            <td colspan="5" class="text-center p-1 font-bold">รวมทั้งสิ้น ${items.length} รายการ</td>
            <td class="text-right p-1 whitespace-nowrap">${Number(totalCost).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
            <td class="text-right p-1 whitespace-nowrap">${Number(totalNet).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
            <td colspan="3" class="text-center p-1 text-[10px] font-normal text-slate-600">
              (ใช้งานได้ดี ${goodCount} | ชำรุดซ่อมได้ ${repairCount} | ขอจำหน่าย ${disposalCount} | สูญหาย ${lostCount})
            </td>
          </tr>
        </tfoot>
      </table>

      <div class="flex justify-between items-center text-[10px] text-black mt-3 pt-2 border-t border-slate-300">
        <div>คณะกรรมการตรวจสอบพัสดุได้ร่วมกันตรวจนับถูกต้องตรงตามความเป็นจริง</div>
        <div class="flex gap-4">
          <span>(ลงชื่อ)........................................ประธาน</span>
          <span>(ลงชื่อ)........................................กรรมการ</span>
          <span>(ลงชื่อ)........................................เลขานุการ</span>
        </div>
      </div>
    </div>
  `;
}

// ==============================================================
// 5. รายงานขออนุมัติจำหน่ายครุภัณฑ์ชำรุด/เสื่อมสภาพ (ระเบียบฯ พ.ศ. ๒๕๖๐ ข้อ ๒๑๕)
// ==============================================================
function getDisposalAssets(fiscalYear = 'all') {
  return assetList.filter(item => {
    const s = (item.status || '').trim();
    const isDisposal = s.includes('ขอจำหน่าย') || s.includes('จำหน่ายแล้ว');
    if (!isDisposal) return false;

    if (fiscalYear !== 'all') {
      const { fiscalYear: fy } = getFiscalYearAndMonth(item.received_date);
      if (String(fy) !== String(fiscalYear)) return false;
    }
    return true;
  });
}

function openDisposalReportModal() {
  const selectEl = document.getElementById('dr-fiscal-year');
  if (selectEl) {
    const availableYears = getAvailableFiscalYears(assetList, 'received_date');
    selectEl.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.innerText = 'ทุกปีงบประมาณ (รายการที่ขอจำหน่ายทั้งหมด)';
    selectEl.appendChild(optAll);

    availableYears.forEach(year => {
      const opt = document.createElement('option');
      opt.value = String(year);
      const shortYear = String(year).slice(-2);
      opt.innerText = `ปีงบประมาณ ${year} (ปีงบ ${shortYear})`;
      selectEl.appendChild(opt);
    });
    selectEl.value = 'all';
  }

  const officer = localStorage.getItem('dr_officer_name') || '';
  const head = localStorage.getItem('dr_head_name') || '';
  let director = localStorage.getItem('dr_director_name') || localStorage.getItem('ai_director_name') || '';
  if (!director) director = 'ผู้อำนวยการโรงเรียนบ้านดงกลาง';
  const docNo = localStorage.getItem('dr_doc_no') || 'ศธ 04153.25/...';

  const inpOff = document.getElementById('dr-officer-name');
  const inpHd = document.getElementById('dr-head-name');
  const inpDir = document.getElementById('dr-director-name');
  const inpDoc = document.getElementById('dr-doc-no');
  const inpRepDate = document.getElementById('dr-report-date');

  if (inpOff) inpOff.value = officer;
  if (inpHd) inpHd.value = head;
  if (inpDir) inpDir.value = director;
  if (inpDoc) inpDoc.value = docNo;

  const today = new Date().toISOString().split('T')[0];
  if (inpRepDate && !inpRepDate.value) inpRepDate.value = today;

  updateDisposalReportPreview();
  openModal('disposalReportModal');
}

function updateDisposalReportPreview() {
  const fySelect = document.getElementById('dr-fiscal-year');
  const fy = fySelect ? fySelect.value : 'all';
  const list = getDisposalAssets(fy);

  let totalCost = 0;
  let totalNet = 0;

  list.forEach(item => {
    totalCost += parseFloat(item.cost) || 0;
    totalNet += parseFloat(item.net_book_value) || 0;
  });

  const countSpan = document.getElementById('dr-eligible-count');
  const costSpan = document.getElementById('dr-eligible-cost');
  const netSpan = document.getElementById('dr-eligible-net');
  const tbody = document.getElementById('dr-preview-table-body');
  const btnSubmit = document.getElementById('btn-print-disposal-submit');

  if (countSpan) countSpan.innerText = list.length;
  if (costSpan) costSpan.innerText = Number(totalCost).toLocaleString('th-TH', {minimumFractionDigits: 2});
  if (netSpan) netSpan.innerText = Number(totalNet).toLocaleString('th-TH', {minimumFractionDigits: 2});

  if (tbody) {
    if (list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="p-4 text-center text-slate-400">
            ℹ️ ยังไม่มีรายการครุภัณฑ์ที่มีสถานะ "ชำรุด/เสื่อมสภาพ (ขอจำหน่าย)" หรือ "จำหน่ายแล้ว"<br>
            <span class="text-[10px] text-amber-700">สามารถกดปุ่ม ✏️ แก้ไขรายการในตารางครุภัณฑ์เพื่อเปลี่ยนสถานะเป็น "ขอจำหน่าย" ได้</span>
          </td>
        </tr>
      `;
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.classList.add('opacity-50', 'cursor-not-allowed');
      }
    } else {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.classList.remove('opacity-50', 'cursor-not-allowed');
      }
      tbody.innerHTML = list.map((item, idx) => {
        const info = extractDisposalInfo(item);
        return `
          <tr class="hover:bg-rose-50/50 border-b border-slate-100">
            <td class="p-1.5 text-center">${idx + 1}</td>
            <td class="p-1.5 font-medium text-red-950">${escapeHtml(item.asset_code || '')}</td>
            <td class="p-1.5 font-medium">${escapeHtml(item.asset_name || '')}</td>
            <td class="p-1.5 text-right">${Number(item.cost || 0).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
            <td class="p-1.5 text-right font-bold text-red-900">${Number(item.net_book_value || 0).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
            <td class="p-1.5 text-slate-700">${escapeHtml(info.reason || 'ชำรุดจนไม่สามารถซ่อมแซมได้')}</td>
            <td class="p-1.5 font-semibold text-rose-800">${escapeHtml(info.method || 'ขายทอดตลาด')}</td>
          </tr>
        `;
      }).join('');
    }
  }
}

function handlePrintDisposalReport(e) {
  e.preventDefault();
  const fySelect = document.getElementById('dr-fiscal-year');
  const fiscalYear = fySelect ? fySelect.value : 'all';
  const reportDate = document.getElementById('dr-report-date').value || new Date().toISOString().split('T')[0];
  const docNo = cleanFieldText(document.getElementById('dr-doc-no').value) || 'ศธ 04153.25/...';
  const officer = cleanFieldText(document.getElementById('dr-officer-name').value);
  const head = cleanFieldText(document.getElementById('dr-head-name').value);
  const director = cleanFieldText(document.getElementById('dr-director-name').value) || 'ผู้อำนวยการโรงเรียนบ้านดงกลาง';

  // บันทึกความจำลง localStorage อัตโนมัติ
  localStorage.setItem('dr_officer_name', officer);
  localStorage.setItem('dr_head_name', head);
  localStorage.setItem('dr_director_name', director);
  localStorage.setItem('dr_doc_no', docNo);

  const items = getDisposalAssets(fiscalYear);
  if (items.length === 0) {
    alert('ไม่มีรายการครุภัณฑ์ที่เข้าเกณฑ์ขอจำหน่าย กรุณาแก้ไขสถานะครุภัณฑ์ในตารางเป็น "ชำรุด/เสื่อมสภาพ (ขอจำหน่าย)" ก่อนครับ');
    return;
  }

  const printSection = document.getElementById('print-disposal-report-section');
  if (printSection) {
    printSection.innerHTML = generateDisposalReportPrintHtml(fiscalYear, reportDate, docNo, officer, head, director, items);
  }

  setPrintTarget('disposalReport');
  closeModal('disposalReportModal');
  window.print();
}

function generateDisposalReportPrintHtml(fiscalYear, reportDate, docNo, officer, head, director, items) {
  const org = cleanFieldText(localStorage.getItem('gov_org')) || DEFAULT_ORG;
  const dept = cleanFieldText(localStorage.getItem('gov_dept')) || DEFAULT_DEPT;
  const fyDisplay = fiscalYear === 'all' ? '' : `ประจำปีงบประมาณ พ.ศ. ${fiscalYear}`;

  let totalCost = 0;
  let totalNet = 0;

  items.forEach(item => {
    totalCost += parseFloat(item.cost) || 0;
    totalNet += parseFloat(item.net_book_value) || 0;
  });

  const tableRowsHtml = items.map((item, idx) => {
    const info = extractDisposalInfo(item);
    return `
      <tr>
        <td class="text-center font-normal">${idx + 1}</td>
        <td class="text-left font-medium whitespace-nowrap">${escapeHtml(item.asset_code || '')}</td>
        <td class="text-left font-medium">${safeThaiWordBreak(escapeHtml(item.asset_name || ''))} ${item.spec ? `<span class="text-[9px] text-slate-600 block">(${safeThaiWordBreak(escapeHtml(item.spec))})</span>` : ''}</td>
        <td class="text-center whitespace-nowrap">${formatThaiDate(item.received_date)}</td>
        <td class="text-center">${item.useful_life ? item.useful_life + ' ปี' : '-'}</td>
        <td class="text-right whitespace-nowrap">${Number(item.cost || 0).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
        <td class="text-right whitespace-nowrap font-bold">${Number(item.net_book_value || 0).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
        <td class="text-left">${safeThaiWordBreak(escapeHtml(info.reason || 'ชำรุดจนไม่สามารถซ่อมแซมได้'))}</td>
        <td class="text-center font-semibold whitespace-nowrap">${safeThaiWordBreak(escapeHtml(info.method || 'ขายทอดตลาด'))}</td>
        <td class="text-left text-[9px]">${renderPrintRemark(info.cleanRemark, '')}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="print-asset-card page-break">
      <!-- บันทึกข้อความ ขออนุมัติจำหน่ายครุภัณฑ์ (หน้า 1) -->
      <div class="border-b-2 border-black pb-2 mb-3">
        <div class="flex items-center justify-between">
          <div class="w-20">
            <span class="text-3xl font-bold">🦅</span>
          </div>
          <div class="text-center flex-grow">
            <h1 class="text-2xl font-bold tracking-widest text-black">บันทึกข้อความ</h1>
          </div>
          <div class="w-24 text-right text-[10px] text-slate-600">
            (ระเบียบกระทรวงการคลังฯ พ.ศ. ๒๕๖๐ ข้อ ๒๑๕)
          </div>
        </div>
        
        <div class="grid grid-cols-12 gap-y-1.5 text-xs text-black mt-2">
          <div class="col-span-8 flex items-end">
            <span class="font-bold whitespace-nowrap">ส่วนราชการ&nbsp;&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow px-1 font-medium">${dept} ${org}</span>
          </div>
          <div class="col-span-4 flex items-end justify-end">
            <span class="font-bold whitespace-nowrap">โทร.&nbsp;&nbsp;</span>
            <span class="border-b border-dotted border-black w-28 px-1 text-center font-medium">-</span>
          </div>
          <div class="col-span-6 flex items-end">
            <span class="font-bold whitespace-nowrap">ที่&nbsp;&nbsp;</span>
            <span class="border-b border-dotted border-black flex-grow px-1 font-medium">${docNo}</span>
          </div>
          <div class="col-span-6 flex items-end justify-end">
            <span class="font-bold whitespace-nowrap">วันที่&nbsp;&nbsp;</span>
            <span class="border-b border-dotted border-black w-48 px-1 text-center font-medium">${formatThaiDate(reportDate)}</span>
          </div>
          <div class="col-span-12 flex items-end mt-0.5">
            <span class="font-bold whitespace-nowrap">เรื่อง&nbsp;&nbsp;</span>
            <span class="font-bold flex-grow px-1">ขออนุมัติจำหน่ายพัสดุและครุภัณฑ์ชำรุด / เสื่อมสภาพ ${fyDisplay}</span>
          </div>
        </div>
      </div>

      <div class="text-xs text-black space-y-2 mb-3 leading-relaxed">
        <div>
          <span class="font-bold">เรียน&nbsp;&nbsp;</span>
          <span>${director}</span>
        </div>
        <div class="pl-8 text-justify">
          ด้วยเจ้าหน้าที่พัสดุได้ดำเนินการตรวจสอบพัสดุและครุภัณฑ์ของ${dept} ปรากฏว่ามีครุภัณฑ์ที่ชำรุด เสื่อมสภาพตามอายุการใช้งาน จนไม่สามารถใช้งานในราชการต่อไปได้ หรือหากซ่อมแซมแล้วจะไม่คุ้มค่าต่อทางราชการ จำนวนทั้งสิ้น <b class="border-b border-dotted border-black px-2">${items.length}</b> รายการ ราคาทุนรวม <b class="border-b border-dotted border-black px-2">${Number(totalCost).toLocaleString('th-TH', {minimumFractionDigits: 2})}</b> บาท มูลค่าสุทธิคงเหลือตามบัญชี <b class="border-b border-dotted border-black px-2">${Number(totalNet).toLocaleString('th-TH', {minimumFractionDigits: 2})}</b> บาท
        </div>
        <div class="pl-8 text-justify">
          เพื่อให้การบริหารพัสดุเป็นไปตามระเบียบกระทรวงการคลังว่าด้วยการจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. ๒๕๖๐ ข้อ ๒๑๕ จึงเห็นสมควรขออนุมัติจำหน่ายพัสดุดังกล่าวออกจากบัญชีหรือทะเบียนคุมทรัพย์สิน โดยเสนอวิธีการจำหน่ายตามที่ระบุในบัญชีรายละเอียดแนบท้ายนี้
        </div>
        <div class="pl-8 text-justify">
          จึงเรียนมาเพื่อโปรดพิจารณาอนุมัติการจำหน่ายพัสดุและครุภัณฑ์ดังกล่าว
        </div>
      </div>

      <!-- ลายมือชื่อเจ้าหน้าที่พัสดุ และหัวหน้าเจ้าหน้าที่พัสดุ -->
      <div class="grid grid-cols-2 gap-8 text-xs text-black text-center my-5">
        <div class="space-y-1">
          <div>(ลงชื่อ).....................................................ผู้เสนอขอจำหน่าย</div>
          <div>( ${officer || '.....................................................'} )</div>
          <div class="text-[11px] text-slate-600">เจ้าหน้าที่พัสดุ</div>
        </div>
        <div class="space-y-1">
          <div>(ลงชื่อ).....................................................ผู้เห็นชอบ</div>
          <div>( ${head || '.....................................................'} )</div>
          <div class="text-[11px] text-slate-600">หัวหน้าเจ้าหน้าที่พัสดุ</div>
        </div>
      </div>

      <!-- คำสั่ง / การอนุมัติของผู้อำนวยการโรงเรียน -->
      <div class="border border-black p-3 text-xs text-black rounded-none mt-3 max-w-xl mx-auto">
        <div class="font-bold mb-1">คำสั่ง / การอนุมัติของผู้อำนวยการโรงเรียน:</div>
        <div class="flex items-center gap-6 my-1.5 pl-2 font-medium">
          <label class="flex items-center gap-1.5"><span>☑</span> <span>อนุมัติให้ดำเนินการจำหน่ายตามที่เสนอ</span></label>
          <label class="flex items-center gap-1.5"><span>☐</span> <span>อื่นๆ .................................................</span></label>
        </div>
        <div class="text-center mt-3 space-y-1">
          <div>(ลงชื่อ)....................................................................</div>
          <div>( ${director} )</div>
          <div class="text-[11px]">ผู้อำนวยการ${dept}</div>
          <div class="text-[11px]">วันที่ ........ เดือน .................... พ.ศ. ............</div>
        </div>
      </div>
    </div>

    <!-- บัญชีรายละเอียดครุภัณฑ์ขออนุมัติจำหน่ายแนบท้าย (หน้า 2 เป็นต้นไป) -->
    <div class="print-asset-card">
      <div class="text-center mb-2">
        <h2 class="text-base font-bold text-black">บัญชีรายละเอียดครุภัณฑ์ที่ขออนุมัติจำหน่าย ${fyDisplay}</h2>
        <div class="text-xs text-slate-700">${dept} ${org}</div>
      </div>

      <table class="form-table w-full text-[10px]">
        <thead>
          <tr class="bg-white font-bold text-center">
            <th class="w-7">ลำดับ</th>
            <th class="w-32">เลขทะเบียนครุภัณฑ์</th>
            <th class="min-w-[140px]">รายการ / คุณลักษณะ</th>
            <th class="w-16">วันที่ได้มา</th>
            <th class="w-14">อายุใช้งาน</th>
            <th class="w-20 leading-tight">ราคาทุน<br>(บาท)</th>
            <th class="w-20 leading-tight">มูลค่าสุทธิ<br>(บาท)</th>
            <th class="w-36">สภาพและสาเหตุที่ขอจำหน่าย</th>
            <th class="w-24">วิธีการจำหน่ายที่เสนอ</th>
            <th class="w-24">หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml || '<tr><td colspan="10" class="text-center p-4">ไม่มีรายการขอจำหน่าย</td></tr>'}
        </tbody>
        <tfoot>
          <tr class="font-bold text-black bg-slate-50">
            <td colspan="5" class="text-center p-1 font-bold">รวมทั้งสิ้น ${items.length} รายการ</td>
            <td class="text-right p-1 whitespace-nowrap">${Number(totalCost).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
            <td class="text-right p-1 whitespace-nowrap">${Number(totalNet).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
            <td colspan="3" class="text-center p-1 text-[10px] font-normal text-slate-600">
              เสนอจำหน่ายตามระเบียบ มท./กค. ๒๕๖๐ ข้อ ๒๑๕
            </td>
          </tr>
        </tfoot>
      </table>

      <div class="flex justify-between items-center text-[10px] text-black mt-3 pt-2 border-t border-slate-300">
        <div>ขอรับรองว่ารายการครุภัณฑ์ข้างต้นมีสภาพชำรุด/เสื่อมสภาพตามที่รายงานจริง</div>
        <div class="flex gap-6">
          <span>(ลงชื่อ)....................................เจ้าหน้าที่พัสดุ</span>
          <span>(ลงชื่อ)....................................หัวหน้าเจ้าหน้าที่</span>
          <span>(ลงชื่อ)....................................ผู้อนุมัติ</span>
        </div>
      </div>
    </div>
  `;
}
