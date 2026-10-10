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

// กำหนดเป้าหมายการพิมพ์ (asset, material, annualInspection, disposalReport, qrSticker)
let currentPrintTarget = 'asset';

// ==================== ระบบแจ้งเตือนลอย (Floating Toast Notification) ====================
function showToast(message, type = 'info', duration = 3200) {
  const container = document.getElementById('toast-container');
  if (!container) {
    console.log(`[Toast ${type}]`, message);
    return;
  }

  const toast = document.createElement('div');
  toast.className = 'toast-animate pointer-events-auto flex items-center gap-2.5 px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-2xl shadow-xl backdrop-blur-md border text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer';

  let icon = 'ℹ️';
  let themeClass = 'bg-slate-900/95 text-white border-slate-700/70 shadow-slate-950/20';
  if (type === 'success') {
    icon = '✅';
    themeClass = 'bg-emerald-950/95 text-emerald-100 border-emerald-500/50 shadow-emerald-950/30';
  } else if (type === 'error' || type === 'danger') {
    icon = '❌';
    themeClass = 'bg-rose-950/95 text-rose-100 border-rose-500/50 shadow-rose-950/30';
  } else if (type === 'warning') {
    icon = '⚠️';
    themeClass = 'bg-amber-950/95 text-amber-100 border-amber-500/50 shadow-amber-950/30';
  }

  toast.className += ` ${themeClass}`;
  toast.innerHTML = `
    <span class="text-base shrink-0">${icon}</span>
    <span class="flex-1 leading-snug">${escapeHtml(message)}</span>
    <button type="button" class="text-white/60 hover:text-white ml-1 text-sm font-bold shrink-0">&times;</button>
  `;

  const closeToast = () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px) scale(0.96)';
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 200);
  };

  toast.onclick = closeToast;
  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(closeToast, duration);
  }
}

function applyStickerPrintPageStyle() {
  let styleEl = document.getElementById('sticker-print-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'sticker-print-style';
    document.head.appendChild(styleEl);
  }
  styleEl.innerHTML = `
    @media print {
      @page {
        size: A4 portrait !important;
        margin: 6mm 6mm !important;
      }
    }
  `;
}

function removeStickerPrintPageStyle() {
  const styleEl = document.getElementById('sticker-print-style');
  if (styleEl) styleEl.remove();
}

function setPrintTarget(target) {
  currentPrintTarget = target;
  const sections = {
    asset: document.getElementById('print-asset-section'),
    material: document.getElementById('print-material-section'),
    annualInspection: document.getElementById('print-annual-inspection-section'),
    disposalReport: document.getElementById('print-disposal-report-section'),
    qrSticker: document.getElementById('print-qr-sticker-section')
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
  removeStickerPrintPageStyle();
  setPrintTarget(currentTab === 'asset' ? 'asset' : 'material');
});

// ==================== ระบบสิทธิ์เข้าใช้งาน & AUTHENTICATION (MULTI-USER & RBAC) ====================
let currentUser = null;

function getAuthToken() {
  return localStorage.getItem('school_auth_token') || sessionStorage.getItem('school_auth_token') || '';
}

function setAuthToken(token) {
  if (token) {
    localStorage.setItem('school_auth_token', token);
  } else {
    localStorage.removeItem('school_auth_token');
    sessionStorage.removeItem('school_auth_token');
    localStorage.removeItem('cached_current_user');
    currentUser = null;
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
  document.documentElement.classList.add('needs-login');
  const overlay = document.getElementById('login-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    overlay.style.display = 'flex';
    switchLoginAuthMode('login');
    const uInput = document.getElementById('login-username');
    if (uInput) {
      setTimeout(() => uInput.focus(), 150);
    }
  }
}

function hideLoginOverlay() {
  document.documentElement.classList.remove('needs-login');
  const overlay = document.getElementById('login-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
    overlay.style.display = 'none';
  }
}

function switchLoginAuthMode(mode) {
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const tabLoginBtn = document.getElementById('tab-login-mode-btn');
  const tabRegBtn = document.getElementById('tab-register-mode-btn');
  const loginErr = document.getElementById('login-error-msg');
  const regMsg = document.getElementById('reg-msg');

  if (loginErr) loginErr.classList.add('hidden');
  if (regMsg) regMsg.classList.add('hidden');

  if (mode === 'register') {
    if (formLogin) formLogin.classList.add('hidden');
    if (formRegister) formRegister.classList.remove('hidden');
    if (tabLoginBtn) {
      tabLoginBtn.className = 'flex-1 py-1.5 text-xs font-semibold text-slate-500 hover:text-red-900 rounded-xl transition cursor-pointer';
    }
    if (tabRegBtn) {
      tabRegBtn.className = 'flex-1 py-1.5 text-xs font-bold rounded-xl transition bg-white text-emerald-800 shadow-xs cursor-pointer';
    }
    const nameInput = document.getElementById('reg-fullname');
    if (nameInput) setTimeout(() => nameInput.focus(), 100);
  } else {
    if (formLogin) formLogin.classList.remove('hidden');
    if (formRegister) formRegister.classList.add('hidden');
    if (tabLoginBtn) {
      tabLoginBtn.className = 'flex-1 py-1.5 text-xs font-bold rounded-xl transition bg-white text-red-950 shadow-xs cursor-pointer';
    }
    if (tabRegBtn) {
      tabRegBtn.className = 'flex-1 py-1.5 text-xs font-semibold text-slate-500 hover:text-red-900 rounded-xl transition cursor-pointer';
    }
    const passInput = document.getElementById('login-password');
    if (passInput) setTimeout(() => passInput.focus(), 100);
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
  const usernameInput = document.getElementById('login-username');
  const passInput = document.getElementById('login-password');
  const errorDiv = document.getElementById('login-error-msg');
  const btnSubmit = document.getElementById('btn-login-submit');

  if (errorDiv) {
    errorDiv.classList.add('hidden');
    errorDiv.textContent = '';
  }

  const username = (usernameInput ? usernameInput.value : '').trim();
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
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (res.ok && data.success && data.token) {
      setAuthToken(data.token);
      currentUser = data.user || null;
      if (currentUser) {
        localStorage.setItem('cached_current_user', JSON.stringify(currentUser));
      }
      updateNavbarUserPill();
      applyUserPermissionsToUI();
      hideLoginOverlay();
      await loadAssets();
      await loadMaterials();
      await loadDatabaseStatus();
      if (currentUser && currentUser.role === 'admin') {
        checkPendingUsersCount();
      }
    } else {
      if (errorDiv) {
        errorDiv.textContent = data.error || 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง';
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

async function handleRegister(e) {
  e.preventDefault();
  const fullName = document.getElementById('reg-fullname').value.trim();
  const position = document.getElementById('reg-position').value.trim();
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value.trim();
  const confirmPassword = document.getElementById('reg-confirmpassword').value.trim();
  const msgEl = document.getElementById('reg-msg');
  const btn = document.getElementById('btn-reg-submit');

  if (password !== confirmPassword) {
    msgEl.className = 'text-xs p-2.5 rounded-xl font-medium text-center bg-rose-50 text-rose-700 border border-rose-200';
    msgEl.textContent = '❌ รหัสผ่านทั้งสองช่องไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง';
    msgEl.classList.remove('hidden');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>กำลังส่งข้อมูล...</span>';
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, position, username, password })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      msgEl.className = 'text-xs p-3 rounded-xl font-medium text-center bg-emerald-50 text-emerald-800 border border-emerald-300 leading-relaxed';
      msgEl.innerHTML = `✅ <b>ลงทะเบียนสำเร็จ!</b><br>${data.message}`;
      msgEl.classList.remove('hidden');
      document.getElementById('form-register').reset();
      setTimeout(() => {
        switchLoginAuthMode('login');
        const loginErr = document.getElementById('login-error-msg');
        if (loginErr) {
          loginErr.className = 'text-xs p-3 rounded-xl font-medium text-center bg-emerald-50 text-emerald-800 border border-emerald-300';
          loginErr.innerHTML = '✅ ลงทะเบียนเรียบร้อยแล้ว กรุณาแจ้งผู้ดูแลระบบเพื่อเปิดสิทธิ์การใช้งาน';
          loginErr.classList.remove('hidden');
        }
      }, 3500);
    } else {
      msgEl.className = 'text-xs p-2.5 rounded-xl font-medium text-center bg-rose-50 text-rose-700 border border-rose-200';
      msgEl.textContent = '❌ ' + (data.error || 'เกิดข้อผิดพลาดในการลงทะเบียน');
      msgEl.classList.remove('hidden');
    }
  } catch (err) {
    msgEl.className = 'text-xs p-2.5 rounded-xl font-medium text-center bg-rose-50 text-rose-700 border border-rose-200';
    msgEl.textContent = '❌ เกิดข้อผิดพลาด: ' + err.message;
    msgEl.classList.remove('hidden');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>ส่งคำขอลงทะเบียน</span> <span>➔</span>';
    }
  }
}

function updateNavbarUserPill() {
  const pill = document.getElementById('nav-user-pill');
  const nameEl = document.getElementById('nav-user-name');
  const roleEl = document.getElementById('nav-user-role-badge');
  const menuUserEl = document.getElementById('menu-dropdown-user-name');
  if (!pill) return;

  if (!currentUser) {
    pill.classList.add('hidden');
    return;
  }

  pill.classList.remove('hidden');
  pill.classList.add('flex');

  const rawName = currentUser.fullName || currentUser.username || 'ผู้ใช้งาน';
  // ตัดข้อความซ้ำซ้อน เช่น "(แอดมิน)" หรือ "(admin)" ออกจากชื่อแสดงผล
  const cleanName = rawName.replace(/\s*\((?:แอดมิน|admin)\)/gi, '').trim();

  if (nameEl) {
    nameEl.textContent = cleanName;
    nameEl.title = rawName;
  }

  if (menuUserEl) {
    menuUserEl.textContent = rawName;
  }

  if (roleEl) {
    if (currentUser.role === 'admin') {
      roleEl.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-red-950 shadow-2xs whitespace-nowrap';
      roleEl.textContent = '👑 แอดมิน';
    } else if (currentUser.canEdit && currentUser.canDelete) {
      roleEl.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-400 text-emerald-950 shadow-2xs whitespace-nowrap';
      roleEl.textContent = '✏️ เจ้าหน้าที่';
    } else if (currentUser.canEdit) {
      roleEl.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-300 text-sky-950 shadow-2xs whitespace-nowrap';
      roleEl.textContent = '✏️ แก้ไขได้';
    } else {
      roleEl.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-800 shadow-2xs whitespace-nowrap';
      roleEl.textContent = '👁️ ทั่วไป';
    }
  }
}

function applyUserPermissionsToUI() {
  const isAdmin = currentUser && currentUser.role === 'admin';
  const canAdd = isAdmin || (currentUser && currentUser.canAdd);

  // ควบคุมเมนู Admin
  const btnUserMgmt = document.getElementById('menu-btn-user-mgmt');
  const btnOrg = document.getElementById('menu-btn-org');
  const btnSupabase = document.getElementById('menu-btn-supabase');
  const sectionBackup = document.getElementById('menu-section-backup');

  if (btnUserMgmt) btnUserMgmt.style.display = isAdmin ? 'flex' : 'none';
  if (btnOrg) btnOrg.style.display = isAdmin ? 'flex' : 'none';
  if (btnSupabase) btnSupabase.style.display = isAdmin ? 'flex' : 'none';
  if (sectionBackup) sectionBackup.style.display = isAdmin ? 'block' : 'none';

  // ควบคุมปุ่มเพิ่มรายการ
  const btnAddAsset = document.getElementById('btn-add-asset');
  const btnAddMaterial = document.getElementById('btn-add-material');

  if (btnAddAsset) btnAddAsset.style.display = canAdd ? 'inline-flex' : 'none';
  if (btnAddMaterial) btnAddMaterial.style.display = canAdd ? 'inline-flex' : 'none';

  // รีเรนเดอร์ตารางเพื่อให้ปุ่มแก้ไข/ลบแสดงตามสิทธิ์จริง
  if (assetList && assetList.length > 0) renderAssetTable();
  if (materialList && materialList.length > 0) renderMaterialTable();
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
  const cachedUser = localStorage.getItem('cached_current_user');
  if (cachedUser) {
    try {
      currentUser = JSON.parse(cachedUser);
      updateNavbarUserPill();
      applyUserPermissionsToUI();
    } catch (e) {}
  }

  const token = getAuthToken();
  if (!token) {
    showLoginOverlay();
    return;
  }

  try {
    const [verifyRes] = await Promise.all([
      fetch('/api/auth/verify', { headers: { 'Authorization': `Bearer ${token}` } }),
      loadAssets(),
      loadMaterials(),
      loadDatabaseStatus()
    ]);
    const data = await verifyRes.json();
    if (!verifyRes.ok || !data.authenticated || !data.user) {
      setAuthToken('');
      showLoginOverlay();
    } else {
      currentUser = data.user;
      localStorage.setItem('cached_current_user', JSON.stringify(currentUser));
      updateNavbarUserPill();
      applyUserPermissionsToUI();
      hideLoginOverlay();
      if (currentUser.role === 'admin') {
        checkPendingUsersCount();
      }
    }
  } catch (err) {
    console.warn('Auth verify check failed:', err);
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

// ==================== จัดการผู้ใช้งานและสิทธิ์ (USER MANAGEMENT CONTROLLER) ====================
let adminUsersList = [];

async function checkPendingUsersCount() {
  if (!currentUser || currentUser.role !== 'admin') return;
  try {
    const res = await authFetch('/api/admin/users');
    if (res.ok) {
      const users = await res.json();
      if (Array.isArray(users)) {
        adminUsersList = users;
        const pendingCount = users.filter(u => u.status === 'pending').length;
        const badge = document.getElementById('pending-users-badge');
        if (badge) {
          if (pendingCount > 0) {
            badge.textContent = `${pendingCount} รออนุมัติ`;
            badge.classList.remove('hidden');
          } else {
            badge.classList.add('hidden');
          }
        }
      }
    }
  } catch (e) {}
}

async function loadUsersManagement() {
  if (!currentUser || currentUser.role !== 'admin') {
    alert('เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถจัดการผู้ใช้งานได้');
    return;
  }

  const tbody = document.getElementById('users-management-tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4 text-slate-500">กำลังโหลดรายชื่อผู้ใช้งาน...</td></tr>';
  }

  try {
    const res = await authFetch('/api/admin/users');
    if (res.ok) {
      const users = await res.json();
      if (Array.isArray(users)) {
        adminUsersList = users;
        renderUsersManagement(users);
      }
    } else {
      throw new Error('Server returned ' + res.status);
    }
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center p-4 text-rose-600">❌ เกิดข้อผิดพลาด: ${err.message}</td></tr>`;
    }
  }
}

function renderUsersManagement(users) {
  const tbody = document.getElementById('users-management-tbody');
  const statTotal = document.getElementById('stat-total-users');
  const statPending = document.getElementById('stat-pending-users');
  const statActive = document.getElementById('stat-active-users');
  const pendingContainer = document.getElementById('pending-users-container');
  const pendingList = document.getElementById('pending-users-list');
  const pendingCountText = document.getElementById('pending-users-count-text');

  const total = users.length;
  const pendingUsers = users.filter(u => u.status === 'pending');
  const activeCount = users.filter(u => u.status === 'active').length;

  if (statTotal) statTotal.textContent = total;
  if (statPending) statPending.textContent = pendingUsers.length;
  if (statActive) statActive.textContent = activeCount;

  // แสดงส่วนคำขอรออนุมัติ
  if (pendingUsers.length > 0) {
    if (pendingContainer) pendingContainer.classList.remove('hidden');
    if (pendingCountText) pendingCountText.textContent = pendingUsers.length;
    if (pendingList) {
      pendingList.innerHTML = pendingUsers.map(u => `
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-3 rounded-xl border border-amber-300 shadow-2xs gap-2">
          <div>
            <div class="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
              <span>👤 ${escapeHtml(u.full_name)}</span>
              <span class="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">@${escapeHtml(u.username)}</span>
            </div>
            <div class="text-[11px] text-slate-500">ตำแหน่ง: ${escapeHtml(u.position || 'ครูผู้ขอใช้งาน')} | วันที่ขอ: ${u.created_at || '-'}</div>
          </div>
          <div class="flex items-center gap-1.5 w-full sm:w-auto">
            <button type="button" onclick="quickApproveUser(${u.id})" class="flex-1 sm:flex-initial px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition shadow-2xs cursor-pointer">
              ✅ อนุมัติใช้งาน
            </button>
            <button type="button" onclick="quickRejectUser(${u.id})" class="flex-1 sm:flex-initial px-3 py-1.5 bg-slate-100 hover:bg-rose-100 hover:text-rose-700 text-slate-600 font-semibold rounded-xl text-xs transition cursor-pointer">
              ❌ ไม่อนุมัติ
            </button>
          </div>
        </div>
      `).join('');
    }
  } else {
    if (pendingContainer) pendingContainer.classList.add('hidden');
  }

  // อัปเดต badge บนเมนูหลัก
  const badge = document.getElementById('pending-users-badge');
  if (badge) {
    if (pendingUsers.length > 0) {
      badge.textContent = `${pendingUsers.length} รออนุมัติ`;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  // Render Table
  if (!tbody) return;
  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4 text-slate-400">ยังไม่มีข้อมูลผู้ใช้งาน</td></tr>';
    return;
  }

  tbody.innerHTML = users.map((u) => {
    const isAdmin = u.role === 'admin' || u.username === 'admin';
    const isMe = currentUser && currentUser.id === u.id;

    const statusBadge = u.status === 'active' 
      ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">🟢 ใช้งานได้</span>'
      : (u.status === 'pending'
        ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 animate-pulse">🟡 รออนุมัติ</span>'
        : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">🔴 ระงับ</span>');

    return `
      <tr class="hover:bg-amber-50/40 transition border-b border-slate-100">
        <td class="p-2.5 sm:p-3">
          <div class="font-bold text-slate-900 flex items-center gap-1">
            <span>${escapeHtml(u.full_name)}</span>
            ${isAdmin ? '<span class="text-amber-500" title="ผู้ดูแลระบบหลัก">👑</span>' : ''}
            ${isMe ? '<span class="text-[9px] bg-red-100 text-red-800 font-bold px-1 rounded">ฉัน</span>' : ''}
          </div>
          <div class="text-[11px] text-slate-500 font-mono">@${escapeHtml(u.username)} ${u.position ? `• ${escapeHtml(u.position)}` : ''}</div>
        </td>
        <td class="p-2.5 sm:p-3 text-center whitespace-nowrap">
          <div class="inline-flex items-center gap-1.5 bg-slate-100/90 border border-slate-200 px-2 py-1 rounded-xl shadow-2xs">
            <span id="pwd-text-${u.id}" class="font-mono text-[11px] text-slate-700 font-bold tracking-wider select-all" data-password="${escapeHtml(u.password_plain || '')}">••••••••</span>
            <button type="button" onclick="togglePasswordView(${u.id})" class="p-0.5 hover:text-amber-800 text-slate-500 hover:scale-110 transition cursor-pointer" title="ดู/ซ่อนรหัสผ่าน">
              <span id="pwd-icon-${u.id}">👁️</span>
            </button>
            <button type="button" onclick="copyUserPassword(${u.id})" class="p-0.5 hover:text-amber-800 text-slate-500 hover:scale-110 transition cursor-pointer" title="คัดลอกรหัสผ่าน">
              📋
            </button>
          </div>
        </td>
        <td class="p-2.5 sm:p-3 text-center">
          ${isAdmin ? `
            <span class="font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md text-[11px]">ผู้ดูแลระบบ</span>
          ` : `
            <select onchange="updateUserRoleDirect(${u.id}, this.value)" class="border border-slate-300 rounded-lg p-1 text-[11px] bg-white">
              <option value="user" ${u.role === 'user' ? 'selected' : ''}>ครูผู้ใช้งาน</option>
              <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>ผู้ดูแลระบบ</option>
            </select>
          `}
        </td>
        <td class="p-2.5 sm:p-3 text-center">
          ${isAdmin ? statusBadge : `
            <select onchange="updateUserStatusDirect(${u.id}, this.value)" class="border border-slate-300 rounded-lg p-1 text-[11px] bg-white">
              <option value="active" ${u.status === 'active' ? 'selected' : ''}>🟢 ใช้งานได้</option>
              <option value="pending" ${u.status === 'pending' ? 'selected' : ''}>🟡 รออนุมัติ</option>
              <option value="rejected" ${u.status === 'rejected' ? 'selected' : ''}>🔴 ระงับ</option>
            </select>
          `}
        </td>
        <td class="p-2.5 sm:p-3 text-center">
          <input type="checkbox" ${isAdmin ? 'checked disabled' : (u.can_edit ? 'checked' : '')} 
            onchange="toggleUserPermissionDirect(${u.id}, 'canEdit', this.checked)" 
            class="w-4 h-4 accent-amber-600 rounded cursor-pointer ${isAdmin ? 'opacity-60 cursor-not-allowed' : ''}" 
            title="${isAdmin ? 'แอดมินมีสิทธิ์แก้ไขเสมอ' : 'เปิด/ปิดสิทธิ์แก้ไข'}">
        </td>
        <td class="p-2.5 sm:p-3 text-center">
          <input type="checkbox" ${isAdmin ? 'checked disabled' : (u.can_delete ? 'checked' : '')} 
            onchange="toggleUserPermissionDirect(${u.id}, 'canDelete', this.checked)" 
            class="w-4 h-4 accent-rose-600 rounded cursor-pointer ${isAdmin ? 'opacity-60 cursor-not-allowed' : ''}" 
            title="${isAdmin ? 'แอดมินมีสิทธิ์ลบเสมอ' : 'เปิด/ปิดสิทธิ์ลบ'}">
        </td>
        <td class="p-2.5 sm:p-3 text-center">
          <input type="checkbox" ${isAdmin ? 'checked disabled' : (u.can_add ? 'checked' : '')} 
            onchange="toggleUserPermissionDirect(${u.id}, 'canAdd', this.checked)" 
            class="w-4 h-4 accent-emerald-600 rounded cursor-pointer ${isAdmin ? 'opacity-60 cursor-not-allowed' : ''}" 
            title="${isAdmin ? 'แอดมินมีสิทธิ์เพิ่มข้อมูลเสมอ' : 'เปิด/ปิดสิทธิ์เพิ่มข้อมูล'}">
        </td>
        <td class="p-2.5 sm:p-3 text-center whitespace-nowrap space-x-1">
          <button type="button" onclick="openAdminResetPassword(${u.id}, '${escapeHtml(u.full_name)}', '${escapeHtml(u.password_plain || '')}')" class="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg font-semibold text-[11px] transition cursor-pointer" title="ตั้งรหัสผ่านใหม่ให้ครู">
            🔑 รหัส
          </button>
          ${!isAdmin ? `
            <button type="button" onclick="deleteUserAccount(${u.id}, '${escapeHtml(u.full_name)}')" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg font-semibold text-[11px] transition cursor-pointer" title="ลบบัญชีนี้">
              🗑️ ลบ
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

async function quickApproveUser(userId) {
  try {
    const res = await authFetch(`/api/admin/users/${userId}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active', canAdd: 1, canEdit: 0, canDelete: 0 })
    });
    if (res.ok) {
      alert('อนุมัติการใช้งานเรียบร้อยแล้ว คุณครูสามารถเข้าสู่ระบบได้ทันที');
      await loadUsersManagement();
    } else {
      const err = await res.json();
      alert('เกิดข้อผิดพลาด: ' + (err.error || 'ไม่สามารถอนุมัติได้'));
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาด: ' + e.message);
  }
}

async function quickRejectUser(userId) {
  if (!confirm('ต้องการไม่อนุมัติคำขอนี้ใช่หรือไม่?')) return;
  try {
    const res = await authFetch(`/api/admin/users/${userId}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected' })
    });
    if (res.ok) {
      await loadUsersManagement();
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาด: ' + e.message);
  }
}

async function toggleUserPermissionDirect(userId, permField, isChecked) {
  const user = adminUsersList.find(u => u.id === userId);
  if (!user) return;
  const payload = {
    canEdit: permField === 'canEdit' ? isChecked : user.can_edit,
    canDelete: permField === 'canDelete' ? isChecked : user.can_delete,
    canAdd: permField === 'canAdd' ? isChecked : user.can_add,
    role: user.role,
    status: user.status
  };
  try {
    const res = await authFetch(`/api/admin/users/${userId}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      user[permField === 'canEdit' ? 'can_edit' : (permField === 'canDelete' ? 'can_delete' : 'can_add')] = isChecked ? 1 : 0;
      if (currentUser && currentUser.id === userId) {
        currentUser.canEdit = payload.canEdit;
        currentUser.canDelete = payload.canDelete;
        currentUser.canAdd = payload.canAdd;
        applyUserPermissionsToUI();
      }
    } else {
      const err = await res.json();
      alert('ไม่สามารถบันทึกสิทธิ์ได้: ' + (err.error || ''));
      loadUsersManagement();
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาด: ' + e.message);
    loadUsersManagement();
  }
}

async function updateUserRoleDirect(userId, newRole) {
  const user = adminUsersList.find(u => u.id === userId);
  if (!user) return;
  try {
    const res = await authFetch(`/api/admin/users/${userId}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole })
    });
    if (res.ok) {
      user.role = newRole;
      if (newRole === 'admin') {
        user.can_edit = 1;
        user.can_delete = 1;
        user.can_add = 1;
      }
      renderUsersManagement(adminUsersList);
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาด: ' + e.message);
  }
}

async function updateUserStatusDirect(userId, newStatus) {
  const user = adminUsersList.find(u => u.id === userId);
  if (!user) return;
  try {
    const res = await authFetch(`/api/admin/users/${userId}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      user.status = newStatus;
      renderUsersManagement(adminUsersList);
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาด: ' + e.message);
  }
}

function togglePasswordView(userId) {
  const span = document.getElementById(`pwd-text-${userId}`);
  const icon = document.getElementById(`pwd-icon-${userId}`);
  if (!span) return;
  const pwd = span.getAttribute('data-password');
  if (span.textContent === '••••••••') {
    span.textContent = pwd || '(ไม่ได้บันทึกไว้)';
    span.classList.add('text-amber-950', 'bg-amber-100', 'px-1.5', 'py-0.5', 'rounded-md');
    if (icon) icon.textContent = '🙈';
  } else {
    span.textContent = '••••••••';
    span.classList.remove('text-amber-950', 'bg-amber-100', 'px-1.5', 'py-0.5', 'rounded-md');
    if (icon) icon.textContent = '👁️';
  }
}

function copyUserPassword(userId) {
  const span = document.getElementById(`pwd-text-${userId}`);
  if (!span) return;
  const pwd = span.getAttribute('data-password');
  if (!pwd) {
    showToast('ไม่พบข้อมูลรหัสผ่านข้อความธรรมดา (กดปุ่ม 🔑 เพื่อตั้งรหัสผ่านใหม่ได้ทันที)', 'warning');
    return;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(pwd).then(() => {
      showToast(`คัดลอกรหัสผ่าน "${pwd}" เรียบร้อยแล้ว`, 'success');
    }).catch(() => {
      prompt('คัดลอกรหัสผ่าน:', pwd);
    });
  } else {
    prompt('คัดลอกรหัสผ่าน:', pwd);
  }
}

function openAdminResetPassword(userId, userName, currentPlain) {
  document.getElementById('reset-user-id').value = userId;
  document.getElementById('reset-user-display-name').textContent = userName;
  const currPwdEl = document.getElementById('reset-user-current-pwd');
  if (currPwdEl) {
    currPwdEl.textContent = currentPlain || '(ยังไม่มีข้อมูล/เป็นรหัสเข้ารหัส)';
  }
  document.getElementById('reset-new-password').value = '';
  const msgEl = document.getElementById('admin-reset-msg');
  if (msgEl) msgEl.classList.add('hidden');
  openModal('adminResetPasswordModal');
}

async function handleAdminResetPassword(e) {
  e.preventDefault();
  const userId = document.getElementById('reset-user-id').value;
  const newPassword = document.getElementById('reset-new-password').value.trim();
  const msgEl = document.getElementById('admin-reset-msg');

  if (!newPassword || newPassword.length < 4) {
    msgEl.className = 'text-xs p-2 rounded-xl text-center font-medium bg-rose-50 text-rose-700';
    msgEl.textContent = '❌ รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร';
    msgEl.classList.remove('hidden');
    return;
  }

  try {
    const res = await authFetch(`/api/admin/users/${userId}/reset-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword })
    });
    const data = await res.json();
    if (res.ok) {
      alert('รีเซ็ตรหัสผ่านสำเร็จเรียบร้อยแล้ว');
      closeModal('adminResetPasswordModal');
      await loadUsersManagement();
    } else {
      msgEl.className = 'text-xs p-2 rounded-xl text-center font-medium bg-rose-50 text-rose-700';
      msgEl.textContent = '❌ ' + (data.error || 'เกิดข้อผิดพลาด');
      msgEl.classList.remove('hidden');
    }
  } catch (err) {
    msgEl.className = 'text-xs p-2 rounded-xl text-center font-medium bg-rose-50 text-rose-700';
    msgEl.textContent = '❌ ' + err.message;
    msgEl.classList.remove('hidden');
  }
}

async function deleteUserAccount(userId, userName) {
  if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบบัญชีของ "${userName}" ออกจากระบบ?`)) return;
  try {
    const res = await authFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
    if (res.ok) {
      alert('ลบบัญชีผู้ใช้งานเรียบร้อยแล้ว');
      await loadUsersManagement();
    } else {
      const err = await res.json();
      alert('เกิดข้อผิดพลาด: ' + (err.error || 'ไม่สามารถลบได้'));
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาด: ' + e.message);
  }
}

async function syncUsersToSupabase() {
  const btn = document.getElementById('btn-sync-users-sb');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ กำลังซิงค์...';
  }
  try {
    const res = await authFetch('/api/admin/users/sync-supabase', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      alert(data.message || 'ซิงค์ข้อมูลผู้ใช้ขึ้น Supabase สำเร็จเรียบร้อยแล้ว');
    } else {
      alert('❌ ' + (data.error || 'ไม่สามารถซิงค์ได้'));
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาด: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🚀 ซิงค์ผู้ใช้ขึ้น Supabase';
    }
  }
}

function copySupabaseUsersSQL() {
  const sql = `-- เพิ่มคอลัมน์ password_plain (ถ้ามีตารางเดิมอยู่แล้ว)
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_plain TEXT DEFAULT '';

-- สร้างตารางข้อมูลผู้ใช้งานและสิทธิ์ (หากยังไม่เคยสร้าง)
CREATE TABLE IF NOT EXISTS app_users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_plain TEXT DEFAULT '',
  full_name TEXT NOT NULL,
  position TEXT DEFAULT '',
  role TEXT DEFAULT 'user',
  can_edit BOOLEAN DEFAULT false,
  can_delete BOOLEAN DEFAULT false,
  can_add BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app_users DISABLE ROW LEVEL SECURITY;`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(sql).then(() => {
      showToast('คัดลอกคำสั่ง SQL เรียบร้อยแล้ว! นำไปวางใน Supabase SQL Editor ได้เลยครับ', 'success');
    }).catch(() => {
      prompt('คัดลอกคำสั่ง SQL ด้านล่างนี้:', sql);
    });
  } else {
    prompt('คัดลอกคำสั่ง SQL ด้านล่างนี้:', sql);
  }
}
const copySupabaseUsersSql = copySupabaseUsersSQL;

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

  // เริ่มต้นสถานะมุมมองตารางหรือการ์ด
  setAssetViewMode(assetViewMode);

  // ตรวจสอบว่ามีการสแกน QR Code ดูข้อมูลครุภัณฑ์หรือไม่
  const urlParams = new URLSearchParams(window.location.search);
  const viewAssetId = urlParams.get('view_asset');
  if (viewAssetId) {
    showPublicAssetCard(viewAssetId);
  }
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

    btnAsset.className = 'px-3 py-1.5 sm:px-3.5 sm:py-1.5 bg-gradient-to-r from-amber-400 via-amber-400 to-amber-500 text-red-950 font-bold rounded-xl shadow-md transition text-xs sm:text-sm whitespace-nowrap flex items-center gap-1.5 cursor-pointer';
    btnMaterial.className = 'px-3 py-1.5 sm:px-3.5 sm:py-1.5 text-amber-200/90 hover:text-white hover:bg-white/10 font-semibold rounded-xl transition text-xs sm:text-sm whitespace-nowrap flex items-center gap-1.5 cursor-pointer';
  } else {
    screenAsset.classList.add('hidden');
    screenMaterial.classList.remove('hidden');
    setPrintTarget('material');

    btnAsset.className = 'px-3 py-1.5 sm:px-3.5 sm:py-1.5 text-amber-200/90 hover:text-white hover:bg-white/10 font-semibold rounded-xl transition text-xs sm:text-sm whitespace-nowrap flex items-center gap-1.5 cursor-pointer';
    btnMaterial.className = 'px-3 py-1.5 sm:px-3.5 sm:py-1.5 bg-gradient-to-r from-amber-400 via-amber-400 to-amber-500 text-red-950 font-bold rounded-xl shadow-md transition text-xs sm:text-sm whitespace-nowrap flex items-center gap-1.5 cursor-pointer';
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
let assetViewMode = localStorage.getItem('asset_view_mode') || 'table';
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
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/90 shadow-2xs whitespace-nowrap"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>ใช้งานได้ดี</span>`;
  } else if (s.includes('ซ่อม')) {
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/90 shadow-2xs whitespace-nowrap"><span class="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>ชำรุด (ซ่อมได้)</span>`;
  } else if (s.includes('ขอจำหน่าย')) {
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200/90 shadow-2xs whitespace-nowrap animate-pulse"><span class="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>ขอจำหน่าย</span>`;
  } else if (s.includes('จำหน่ายแล้ว') || s.includes('แทงจำหน่าย')) {
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300 shadow-2xs whitespace-nowrap"><span class="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0"></span>จำหน่ายแล้ว</span>`;
  } else if (s.includes('สูญหาย')) {
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 shadow-2xs whitespace-nowrap"><span class="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0"></span>สูญหาย</span>`;
  }
  return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs whitespace-nowrap"><span class="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0"></span>${escapeHtml(s)}</span>`;
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

function syncQuickFilterChips(statusKey) {
  const chipKeys = ['all', 'good', 'repair', 'disposal', 'disposed'];
  chipKeys.forEach(k => {
    const chip = document.getElementById(`chip-status-${k}`);
    if (!chip) return;
    if (k === statusKey) {
      chip.className = 'quick-filter-chip active px-3 py-1 rounded-full text-xs font-bold transition whitespace-nowrap bg-amber-500 text-white shadow-2xs cursor-pointer';
    } else {
      chip.className = 'quick-filter-chip px-3 py-1 rounded-full text-xs font-semibold transition whitespace-nowrap bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer';
    }
  });
}

function setQuickStatusFilter(statusKey) {
  assetStatusFilter = statusKey;
  const statusSelect = document.getElementById('asset-status-select');
  if (statusSelect) {
    statusSelect.value = statusKey;
  }
  syncQuickFilterChips(statusKey);
  renderAssetTable();
  updateAssetSelectionUI();
}

function filterByKpiStatus(statusKey) {
  setQuickStatusFilter(statusKey);
}

function onAssetFilterChange() {
  const fySelect = document.getElementById('asset-fiscal-year-select');
  const mSelect = document.getElementById('asset-month-select');
  const statusSelect = document.getElementById('asset-status-select');
  if (fySelect) assetFiscalYear = fySelect.value;
  if (mSelect) assetMonth = mSelect.value;
  if (statusSelect) assetStatusFilter = statusSelect.value;
  syncQuickFilterChips(assetStatusFilter);
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

// ==================== การ์ดสรุปสถิติภาพรวม (KPI STAT CARDS) ====================
function updateAssetKpiCards() {
  const totalAssets = assetList.length;
  let totalCost = 0;
  let goodCount = 0;
  let repairCount = 0;
  let disposalCount = 0;
  let disposedCount = 0;

  assetList.forEach(item => {
    totalCost += Number(item.cost || 0);
    const s = (item.status || '').trim();
    if (s === 'ใช้งานได้ดี' || !s) {
      goodCount++;
    } else if (s.includes('ซ่อม')) {
      repairCount++;
    } else if (s.includes('ขอจำหน่าย')) {
      disposalCount++;
    } else if (s.includes('จำหน่ายแล้ว') || s.includes('แทงจำหน่าย')) {
      disposedCount++;
    } else {
      goodCount++;
    }
  });

  const totalDisposedGroup = disposalCount + disposedCount;
  const goodPercent = totalAssets > 0 ? ((goodCount / totalAssets) * 100).toFixed(1) : '0';

  const elTotal = document.getElementById('kpi-total-assets');
  const elCost = document.getElementById('kpi-total-cost');
  const elGood = document.getElementById('kpi-good-assets');
  const elGoodPct = document.getElementById('kpi-good-percent');
  const elRepair = document.getElementById('kpi-repair-assets');
  const elDisposal = document.getElementById('kpi-disposal-assets');
  const elDisposedCount = document.getElementById('kpi-disposed-count');

  if (elTotal) elTotal.textContent = totalAssets.toLocaleString('th-TH');
  if (elCost) elCost.textContent = `฿${totalCost.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  if (elGood) elGood.textContent = goodCount.toLocaleString('th-TH');
  if (elGoodPct) elGoodPct.textContent = `พร้อมใช้ ${goodPercent}%`;
  if (elRepair) elRepair.textContent = repairCount.toLocaleString('th-TH');
  if (elDisposal) elDisposal.textContent = totalDisposedGroup.toLocaleString('th-TH');
  if (elDisposedCount) elDisposedCount.textContent = `รอจำหน่าย ${disposalCount}`;

  // ไฮไลต์ขอบการ์ด KPI มินิมอลที่ถูกเลือกกรองอยู่
  const kpiCards = {
    'all': { el: document.getElementById('kpi-card-all'), border: 'border-amber-400', bg: 'bg-amber-50/50' },
    'good': { el: document.getElementById('kpi-card-good'), border: 'border-emerald-400', bg: 'bg-emerald-50/50' },
    'repair': { el: document.getElementById('kpi-card-repair'), border: 'border-amber-400', bg: 'bg-amber-50/50' },
    'disposal': { el: document.getElementById('kpi-card-disposal'), border: 'border-rose-400', bg: 'bg-rose-50/50' }
  };
  Object.entries(kpiCards).forEach(([key, config]) => {
    if (!config.el) return;
    config.el.classList.remove('border-amber-400', 'border-emerald-400', 'border-rose-400', 'bg-amber-50/50', 'bg-emerald-50/50', 'bg-rose-50/50', 'shadow-xs');
    if (assetStatusFilter === key) {
      config.el.classList.add(config.border, config.bg, 'shadow-xs');
    }
  });
}

function updateMaterialKpiCards() {
  const totalEntries = materialList.length;
  let totalInflowPrice = 0;
  let totalIssues = 0;
  const distinctNames = new Set();
  const balanceMap = {};

  materialList.forEach(m => {
    const name = (m.material_name || '').trim();
    if (name) distinctNames.add(name);
    totalInflowPrice += Number(m.receive_price || 0);
    if (Number(m.issue_qty || 0) > 0) totalIssues++;
    if (name) {
      balanceMap[name] = Number(m.balance_qty || 0);
    }
  });

  const activeWithStock = Object.values(balanceMap).filter(qty => qty > 0).length;

  const elEntries = document.getElementById('kpi-mat-total-entries');
  const elTypes = document.getElementById('kpi-mat-types-count');
  const elInflow = document.getElementById('kpi-mat-inflow-cost');
  const elIssues = document.getElementById('kpi-mat-issue-count');
  const elActive = document.getElementById('kpi-mat-active-items');

  if (elEntries) elEntries.textContent = totalEntries.toLocaleString('th-TH');
  if (elTypes) elTypes.textContent = `${distinctNames.size} ชนิด`;
  if (elInflow) elInflow.textContent = totalInflowPrice.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  if (elIssues) elIssues.textContent = `${totalIssues} ครั้ง`;
  if (elActive) elActive.textContent = `${activeWithStock} ชนิด`;
}

// เรนเดอร์ตารางบนหน้าจอเว็บ (กรองตามปีงบประมาณ, เดือน, และคำค้นหาอัตโนมัติ)
function renderAssetTable() {
  const screenTbody = document.getElementById('screen-asset-table-body');
  if (!screenTbody) return;
  screenTbody.innerHTML = '';

  updateAssetKpiCards();

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

  renderAssetGridCards(list);

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
    if (assetStatusFilter !== 'all') {
      const statusLabels = { 'good': 'ใช้งานได้ดี', 'repair': 'ชำรุด', 'disposal': 'ขอจำหน่าย', 'disposed': 'จำหน่ายแล้ว' };
      msg += ` สถานะ "${statusLabels[assetStatusFilter] || assetStatusFilter}"`;
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
    tr.className = `hover:bg-amber-50/70 border-b border-amber-100/70 cursor-pointer transition-colors duration-150 ${isSelected ? 'bg-amber-50/50' : ''}`;
    
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
      <td class="p-2 border border-slate-200 text-center font-medium text-slate-500 text-xs">${index + 1}</td>
      <td class="p-2 border border-slate-200 text-xs text-slate-700 whitespace-nowrap">${item.received_date || ''}</td>
      <td class="p-2 border border-slate-200 font-bold text-red-950 font-mono text-xs whitespace-nowrap">
        <div class="flex items-center gap-1.5">
          <span class="w-6 h-6 rounded-md bg-amber-50 border border-amber-200/70 flex items-center justify-center text-xs shrink-0 shadow-2xs">📦</span>
          <span>${item.asset_code || ''}</span>
        </div>
      </td>
      <td class="p-2 border border-slate-200 font-semibold text-slate-800 text-xs">
        <div>${escapeHtml(item.asset_name || '')}</div>
        ${item.category ? `<div class="text-[10px] text-amber-800/80 font-normal mt-0.5">${escapeHtml(item.category)}</div>` : ''}
      </td>
      <td class="p-2 border border-slate-200 text-slate-600 text-xs max-w-[160px] truncate" title="${escapeHtml(item.spec || '')}">${escapeHtml(item.spec || '')}</td>
      <td class="p-2 border border-slate-200 text-xs text-slate-700">${escapeHtml(item.doc_no || '')}</td>
      <td class="p-2 border border-slate-200 text-right font-medium text-xs whitespace-nowrap">${Number(item.cost).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
      <td class="p-2 border border-slate-200 text-center text-xs">${item.useful_life}</td>
      <td class="p-2 border border-slate-200 text-right text-slate-500 text-xs whitespace-nowrap">${Number(item.depr_per_year).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
      <td class="p-2 border border-slate-200 text-right font-bold text-red-900 text-xs whitespace-nowrap">${Number(item.net_book_value).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
      <td class="p-2 border border-slate-200 text-xs text-slate-700 whitespace-nowrap">${escapeHtml(item.location || '')}</td>
      <td class="p-2 border border-slate-200 text-center whitespace-nowrap">
        ${getAssetStatusBadge(item.status)}
      </td>
      <td class="p-2 border border-slate-200 text-xs font-medium text-slate-800 whitespace-nowrap">${escapeHtml(item.responsible_person || '')}</td>
      <td class="p-2 border border-slate-200 text-center whitespace-nowrap space-x-1" onclick="event.stopPropagation()">
        <button onclick="printSingleQrSticker(${item.id})" class="text-emerald-700 hover:text-emerald-900 p-1.5 font-semibold rounded-lg hover:bg-emerald-100 transition shadow-2xs cursor-pointer" title="พิมพ์สติกเกอร์ QR Code ติดตัวครุภัณฑ์">🏷️</button>
        <button onclick="printSingleAsset(${item.id})" class="text-amber-600 hover:text-amber-800 p-1.5 font-semibold rounded-lg hover:bg-amber-100 transition shadow-2xs cursor-pointer" title="พิมพ์บัตรรายการนี้เฉพาะใบเดียว">🖨️</button>
        ${(currentUser && (currentUser.canEdit || currentUser.role === 'admin')) ? `<button onclick="editAsset(${item.id})" class="text-red-700 hover:text-red-900 p-1.5 font-semibold rounded-lg hover:bg-red-100 transition shadow-2xs cursor-pointer" title="แก้ไขรายการนี้">✏️</button>` : ''}
        ${(currentUser && (currentUser.canDelete || currentUser.role === 'admin')) ? `<button onclick="deleteAsset(${item.id})" class="text-slate-400 hover:text-rose-600 p-1.5 font-semibold rounded-lg hover:bg-rose-50 transition shadow-2xs cursor-pointer" title="ลบรายการ">🗑️</button>` : ''}
      </td>
    `;
    screenTbody.appendChild(tr);
  });
}

// ==================== สลับมุมมอง ตาราง vs การ์ดรูปภาพ (TABLE / GALLERY VIEW) ====================
function setAssetViewMode(mode) {
  assetViewMode = mode;
  try {
    localStorage.setItem('asset_view_mode', mode);
  } catch (e) {}

  const tableContainer = document.getElementById('screen-asset-table-container');
  const gridContainer = document.getElementById('screen-asset-grid-container');
  const tableBtn = document.getElementById('view-mode-table-btn');
  const gridBtn = document.getElementById('view-mode-grid-btn');

  if (mode === 'grid') {
    if (tableContainer) tableContainer.classList.add('hidden');
    if (gridContainer) gridContainer.classList.remove('hidden');
    if (tableBtn) {
      tableBtn.className = 'px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-red-900 rounded-lg transition flex items-center gap-1 cursor-pointer';
    }
    if (gridBtn) {
      gridBtn.className = 'px-2.5 py-1 text-xs font-bold rounded-lg transition bg-white text-red-950 shadow-2xs flex items-center gap-1 cursor-pointer';
    }
    renderAssetGridCards();
  } else {
    if (tableContainer) tableContainer.classList.remove('hidden');
    if (gridContainer) gridContainer.classList.add('hidden');
    if (tableBtn) {
      tableBtn.className = 'px-2.5 py-1 text-xs font-bold rounded-lg transition bg-white text-red-950 shadow-2xs flex items-center gap-1 cursor-pointer';
    }
    if (gridBtn) {
      gridBtn.className = 'px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-red-900 rounded-lg transition flex items-center gap-1 cursor-pointer';
    }
  }
}

function renderAssetGridCards(list = null) {
  const gridContainer = document.getElementById('screen-asset-grid-cards');
  if (!gridContainer) return;
  gridContainer.innerHTML = '';

  const items = list !== null ? list : getFilteredAssets();

  if (items.length === 0) {
    gridContainer.innerHTML = `
      <div class="col-span-full py-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
        <span class="text-4xl block mb-2">🔍</span>
        <p class="text-sm font-medium">ไม่พบรายการครุภัณฑ์ในเงื่อนไขที่เลือก</p>
      </div>
    `;
    return;
  }

  const canEdit = currentUser && (currentUser.canEdit || currentUser.role === 'admin');
  const canDelete = currentUser && (currentUser.canDelete || currentUser.role === 'admin');

  items.forEach(item => {
    const isSelected = selectedAssetIds.has(item.id);
    const card = document.createElement('div');
    card.className = `bg-white rounded-2xl border ${isSelected ? 'border-amber-400 ring-2 ring-amber-400/40 bg-amber-50/20' : 'border-slate-200/80 hover:border-amber-300'} p-3.5 sm:p-4 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between group relative cursor-pointer`;

    card.onclick = (e) => {
      if (!e.target.closest('button, input, a')) {
        toggleAssetItemSelection(item.id);
      }
    };

    const costFormatted = Number(item.cost || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });
    const netValueFormatted = Number(item.net_book_value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

    card.innerHTML = `
      <div>
        <!-- Top Bar: Checkbox, Code, Status Badge -->
        <div class="flex items-center justify-between gap-1.5 mb-2.5">
          <div class="flex items-center gap-2 overflow-hidden" onclick="event.stopPropagation()">
            <input type="checkbox" class="w-4 h-4 accent-amber-500 rounded cursor-pointer" 
              ${isSelected ? 'checked' : ''} 
              onchange="toggleAssetItemSelection(${item.id}, this.checked)">
            <span class="font-mono text-xs font-bold text-red-950 bg-red-50 border border-red-200/70 px-2 py-0.5 rounded-md truncate max-w-[130px] sm:max-w-[150px]" title="${escapeHtml(item.asset_code || '')}">
              ${escapeHtml(item.asset_code || 'ไม่มีรหัส')}
            </span>
          </div>
          <div class="shrink-0">
            ${getAssetStatusBadge(item.status)}
          </div>
        </div>

        <!-- Thumbnail / Category Badge Box -->
        <div class="h-24 sm:h-28 rounded-xl bg-gradient-to-br from-amber-50/80 via-slate-50 to-amber-100/30 border border-amber-100/70 flex flex-col items-center justify-center mb-3 relative overflow-hidden group-hover:scale-[1.01] transition-transform">
          <span class="text-3xl sm:text-4xl filter drop-shadow-xs">📦</span>
          <span class="text-[10px] font-semibold text-amber-800/80 mt-1 px-2 py-0.5 bg-white/80 rounded-full border border-amber-200/50 backdrop-blur-xs truncate max-w-[90%]">
            ${escapeHtml(item.category || 'ครุภัณฑ์การศึกษา')}
          </span>
          <span class="absolute top-1.5 right-1.5 text-[9px] font-mono text-slate-400 bg-white/70 px-1 rounded">
            ID:${item.id}
          </span>
        </div>

        <!-- Title & Spec -->
        <h4 class="font-bold text-slate-800 text-sm leading-snug line-clamp-2 group-hover:text-red-950 transition mb-1" title="${escapeHtml(item.asset_name || '')}">
          ${escapeHtml(item.asset_name || 'ไม่ระบุชื่อ')}
        </h4>
        <p class="text-xs text-slate-500 line-clamp-1 mb-3" title="${escapeHtml(item.spec || '')}">
          ${escapeHtml(item.spec || 'ไม่มีรายละเอียดคุณลักษณะ')}
        </p>

        <!-- Metadata Info Grid -->
        <div class="grid grid-cols-2 gap-1.5 text-xs bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 mb-3">
          <div class="overflow-hidden">
            <span class="text-[10px] text-slate-400 block font-medium">📍 สถานที่ตั้ง</span>
            <span class="text-slate-700 font-semibold truncate block" title="${escapeHtml(item.location || '-')}">${escapeHtml(item.location || '-')}</span>
          </div>
          <div class="overflow-hidden">
            <span class="text-[10px] text-slate-400 block font-medium">👤 ผู้รับผิดชอบ</span>
            <span class="text-slate-700 font-semibold truncate block" title="${escapeHtml(item.responsible_person || '-')}">${escapeHtml(item.responsible_person || '-')}</span>
          </div>
          <div>
            <span class="text-[10px] text-slate-400 block font-medium">💰 ราคาทุน</span>
            <span class="text-slate-800 font-bold">฿${costFormatted}</span>
          </div>
          <div>
            <span class="text-[10px] text-slate-400 block font-medium">📉 มูลค่าสุทธิ</span>
            <span class="text-red-900 font-bold">฿${netValueFormatted}</span>
          </div>
        </div>
      </div>

      <!-- Footer Action Buttons -->
      <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-1" onclick="event.stopPropagation()">
        <div class="flex items-center gap-1">
          <button type="button" onclick="printSingleQrSticker(${item.id})" class="text-xs font-semibold px-2 py-1 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition flex items-center gap-1 cursor-pointer" title="พิมพ์สติกเกอร์ QR">
            <span>🏷️</span> <span>QR</span>
          </button>
          <button type="button" onclick="printSingleAsset(${item.id})" class="text-xs font-semibold px-2 py-1 text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 transition flex items-center gap-1 cursor-pointer" title="พิมพ์บัตรครุภัณฑ์">
            <span>🖨️</span> <span>บัตร</span>
          </button>
        </div>
        <div class="flex items-center gap-1">
          ${canEdit ? `
            <button type="button" onclick="editAsset(${item.id})" class="p-1 text-amber-700 hover:text-amber-900 hover:bg-amber-100 rounded-lg transition cursor-pointer" title="แก้ไข">
              ✏️
            </button>
          ` : ''}
          ${canDelete ? `
            <button type="button" onclick="deleteAsset(${item.id})" class="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer" title="ลบ">
              🗑️
            </button>
          ` : ''}
        </div>
      </div>
    `;

    gridContainer.appendChild(card);
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

// ==================== รายชื่อครูและบุคลากรในโรงเรียน ====================
const SCHOOL_STAFF_LIST = [
  { name: 'นางสายสายใจ  วิลัยทอง', role: 'ผู้อำนวยการโรงเรียน' },
  { name: 'นางชูชื่น  บุตรฉิม', role: 'ครูชำนาญการพิเศษ' },
  { name: 'นางสาวใบเฟิร์น  รัตนสร้อย', role: 'ครูชำนาญการพิเศษ' },
  { name: 'นางสาวนพรัตน์  วิสพันธ์', role: 'ครูชำนาญการ' },
  { name: 'นางสาวสิริมน  จันทสาร', role: 'ครูชำนาญการ' },
  { name: 'นางสาวชัญญา  กลิ่นกำเนิด', role: 'ครูชำนาญการ' },
  { name: 'นางสาวฐิติวรดา  สายพานิช', role: 'ครูชำนาญการ' },
  { name: 'นางสาวญาณินท์  มนัสสนิท', role: 'ครูชำนาญการ' },
  { name: 'นางสาวสมัญญา  บูรณศิล', role: 'ครูชำนาญการ' },
  { name: 'นางธีรกานต์  กุมภะ', role: 'ครูชำนาญการ' },
  { name: 'นางสาวทวีพร  ทองสาย', role: 'ครูชำนาญการ' },
  { name: 'นางสาวบุญยาวี  รัตนวิจิตร', role: 'ครู' },
  { name: 'นายวิชิตชัย  นุชโสภณ', role: 'ครู' },
  { name: 'นางสาวบุหงา  กองสุข', role: 'ครู' },
  { name: 'นางสาวณิชาภัทร  หัดรัดชัย', role: 'ครูผู้ช่วย' },
  { name: 'นางสาวเอวรินทร์  ชาวดอนคา', role: 'ครูอัตราจ้าง' },
  { name: 'นางสาวภัฐธีรา  จุลพันธ์', role: 'ธุรการโรงเรียน' }
];

function normalizePersonName(str) {
  if (!str) return '';
  return String(str).replace(/\s+/g, ' ').trim();
}

function onResponsiblePersonSelectChange(val) {
  const customWrap = document.getElementById('a_person_custom_wrap');
  const customInp = document.getElementById('a_person');
  if (val === '__custom__') {
    if (customWrap) customWrap.classList.remove('hidden');
    if (customInp) {
      customInp.value = '';
      customInp.focus();
    }
  } else {
    if (customWrap) customWrap.classList.add('hidden');
    if (customInp) {
      customInp.value = val || '';
    }
  }
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

  const pSel = document.getElementById('a_person_select');
  const pWrap = document.getElementById('a_person_custom_wrap');
  const pInp = document.getElementById('a_person');
  if (pSel) pSel.value = '';
  if (pWrap) pWrap.classList.add('hidden');
  if (pInp) pInp.value = '';

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

  const person = cleanFieldText(item.responsible_person || '');
  const pSel = document.getElementById('a_person_select');
  const pWrap = document.getElementById('a_person_custom_wrap');
  const pInp = document.getElementById('a_person');
  if (pInp) pInp.value = person;

  if (pSel) {
    if (!person) {
      pSel.value = '';
      if (pWrap) pWrap.classList.add('hidden');
    } else {
      const normPerson = normalizePersonName(person);
      let matchedOpt = Array.from(pSel.options).find(opt => {
        return opt.value && opt.value !== '__custom__' && normalizePersonName(opt.value) === normPerson;
      });

      if (!matchedOpt) {
        matchedOpt = Array.from(pSel.options).find(opt => {
          if (!opt.value || opt.value === '__custom__') return false;
          const optNorm = normalizePersonName(opt.value);
          return (normPerson.length >= 3 && optNorm.includes(normPerson)) || (optNorm.length >= 3 && normPerson.includes(optNorm));
        });
      }

      if (matchedOpt) {
        pSel.value = matchedOpt.value;
        if (pWrap) pWrap.classList.add('hidden');
      } else {
        pSel.value = '__custom__';
        if (pWrap) pWrap.classList.remove('hidden');
      }
    }
  }

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

  const pSel = document.getElementById('a_person_select');
  let chosenPerson = '';
  if (pSel && pSel.value === '__custom__') {
    chosenPerson = cleanFieldText(document.getElementById('a_person')?.value);
  } else if (pSel && pSel.value) {
    chosenPerson = cleanFieldText(pSel.value);
  } else {
    chosenPerson = cleanFieldText(document.getElementById('a_person')?.value);
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
    responsible_person: chosenPerson,
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
    showToast(editId ? 'แก้ไขข้อมูลครุภัณฑ์เรียบร้อยแล้ว' : 'บันทึกข้อมูลครุภัณฑ์เรียบร้อยแล้ว', 'success');
    loadAssets();
  } else {
    const err = await res.json().catch(() => ({}));
    showToast('เกิดข้อผิดพลาด: ' + (err.error || 'ไม่สามารถบันทึกได้'), 'error');
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
  showToast(`ลบรายการ "${itemName}" เรียบร้อยแล้ว`, 'info');

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

  updateMaterialKpiCards();

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
        ${(currentUser && (currentUser.canEdit || currentUser.role === 'admin')) ? `<button onclick="editMaterial(${item.id})" class="text-red-700 hover:text-red-900 p-1.5 font-semibold rounded-lg hover:bg-red-100 transition shadow-2xs cursor-pointer" title="แก้ไขรายการนี้">✏️</button>` : ''}
        ${(currentUser && (currentUser.canDelete || currentUser.role === 'admin')) ? `<button onclick="deleteMaterial(${item.id})" class="text-slate-400 hover:text-rose-600 p-1.5 font-semibold rounded-lg hover:bg-rose-50 transition shadow-2xs cursor-pointer" title="ลบรายการ">🗑️</button>` : ''}
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
    showToast(editId ? 'แก้ไขข้อมูลวัสดุเรียบร้อยแล้ว' : 'บันทึกรายการวัสดุเรียบร้อยแล้ว', 'success');
    loadMaterials();
  } else {
    const err = await res.json().catch(() => ({}));
    showToast('เกิดข้อผิดพลาด: ' + (err.error || 'ไม่สามารถบันทึกได้'), 'error');
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
  showToast(`ลบรายการ "${itemName}" เรียบร้อยแล้ว`, 'info');

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
  if (id === 'userManagementModal') {
    loadUsersManagement();
  }
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
  if (!director || director === 'ผู้อำนวยการโรงเรียนบ้านดงกลาง') director = 'นางสายสายใจ  วิลัยทอง';

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

  setSelectIfMatch('ai-chair-select', chair);
  setSelectIfMatch('ai-member1-select', mem1);
  setSelectIfMatch('ai-member2-select', mem2);
  setSelectIfMatch('ai-director-select', director);

  const today = new Date().toISOString().split('T')[0];
  if (inpOrderDate && !inpOrderDate.value) inpOrderDate.value = today;
  if (inpInspectDate && !inpInspectDate.value) inpInspectDate.value = today;

  updateAnnualInspectionPreview();
  openModal('annualInspectionModal');
}

function syncStaffField(selectEl, inputId) {
  if (!selectEl) return;
  const inp = document.getElementById(inputId);
  if (inp && selectEl.value) {
    inp.value = selectEl.value;
  }
}

function setSelectIfMatch(selectId, val) {
  const el = document.getElementById(selectId);
  if (!el || !val) return;
  const clean = String(val).replace(/\s+/g, ' ').trim();
  for (let i = 0; i < el.options.length; i++) {
    const opt = el.options[i];
    if (opt.value && opt.value.replace(/\s+/g, ' ').trim() === clean) {
      el.selectedIndex = i;
      return;
    }
  }
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
  if (!director || director === 'ผู้อำนวยการโรงเรียนบ้านดงกลาง') director = 'นางสายสายใจ  วิลัยทอง';
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

  setSelectIfMatch('dr-officer-select', officer);
  setSelectIfMatch('dr-head-select', head);
  setSelectIfMatch('dr-director-select', director);

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

// ==============================================================
// 5. ระบบพิมพ์สติกเกอร์ QR Code / Barcode ติดตัวครุภัณฑ์
// ==============================================================

let qrStickerSingleAssetId = null;
let currentPublicAssetId = null;

// ดึงรายการครุภัณฑ์ที่จะพิมพ์สติกเกอร์ตามตัวเลือก
function getStickerAssetsList() {
  if (qrStickerSingleAssetId) {
    const single = assetList.find(a => a.id === qrStickerSingleAssetId);
    return single ? [single] : [];
  }

  const scopeRadios = document.getElementsByName('sticker_scope');
  let scope = 'filter';
  for (const r of scopeRadios) {
    if (r.checked) {
      scope = r.value;
      break;
    }
  }

  if (scope === 'selected' && selectedAssetIds.size > 0) {
    return assetList.filter(a => selectedAssetIds.has(a.id));
  }

  return getFilteredAssets();
}

function openQrStickerModal(singleAssetId = null) {
  qrStickerSingleAssetId = singleAssetId;
  const filteredCount = getFilteredAssets().length;
  const selectedCount = selectedAssetIds.size;

  const filterCountEl = document.getElementById('sticker-scope-filter-count');
  const selectedCountEl = document.getElementById('sticker-scope-selected-count');
  const sizeSelect = document.getElementById('sticker-layout-size');

  if (filterCountEl) filterCountEl.innerText = filteredCount;
  if (selectedCountEl) selectedCountEl.innerText = selectedCount;

  // ตั้งค่าตัวเลือกตามกรณี single หรือ bulk
  const radios = document.getElementsByName('sticker_scope');
  if (singleAssetId) {
    if (sizeSelect) sizeSelect.value = 'single';
  } else {
    if (selectedCount > 0) {
      if (radios[1]) radios[1].checked = true;
    } else {
      if (radios[0]) radios[0].checked = true;
    }
    if (sizeSelect && sizeSelect.value === 'single') {
      sizeSelect.value = 'compact';
    }
  }

  updateQrStickerScope();
  openModal('qrStickerModal');
}

function printSingleQrSticker(id) {
  openQrStickerModal(id);
}

function updateQrStickerScope() {
  const items = getStickerAssetsList();
  const countBadge = document.getElementById('sticker-item-count-badge');
  if (countBadge) countBadge.innerText = `${items.length} รายการ`;
  updateQrStickerPreview();
}

function updateQrStickerPreview() {
  const previewBox = document.getElementById('sticker-live-preview-box');
  if (!previewBox) return;

  const items = getStickerAssetsList();
  const sizeSelect = document.getElementById('sticker-layout-size');
  const layoutSize = sizeSelect ? sizeSelect.value : 'compact';
  const headerInput = document.getElementById('sticker-school-header');
  const schoolHeader = headerInput ? headerInput.value.trim() : 'โรงเรียนบ้านดงกลาง';

  if (!items || items.length === 0) {
    previewBox.innerHTML = '<span class="text-slate-400 text-xs">ไม่มีรายการครุภัณฑ์ที่เลือก</span>';
    return;
  }

  const sampleItem = items[0];
  const stickerHtml = renderSingleStickerHtml(sampleItem, layoutSize, schoolHeader, true);
  previewBox.innerHTML = stickerHtml;

  // Render QR Code in preview box
  const qrBox = previewBox.querySelector('.qr-canvas-box');
  if (qrBox && window.QRCode) {
    const url = qrBox.dataset.url;
    const qrSize = (layoutSize === 'large' || layoutSize === 'single') ? 72 : 48;
    new QRCode(qrBox, {
      text: url,
      width: qrSize,
      height: qrSize,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
  }
}

function getAssetQrVerificationUrl(item) {
  const origin = window.location.origin;
  const path = window.location.pathname;
  return `${origin}${path}?view_asset=${item.id}`;
}

function renderSingleStickerHtml(item, layoutSize, schoolHeader, isPreview = false) {
  const qrUrl = getAssetQrVerificationUrl(item);
  const code = item.asset_code || '-';
  const name = item.asset_name || '-';
  const dateStr = item.received_date || '-';
  const { fiscalYear } = getFiscalYearAndMonth(dateStr);
  const shortYear = fiscalYear ? String(fiscalYear).slice(-2) : '-';
  const person = item.responsible_person || '-';
  const location = item.location || '-';
  const spec = item.spec || '';

  if (layoutSize === 'large' || layoutSize === 'single') {
    // ขนาดใหญ่ (2 คอลัมน์ x 5 แถว บนหน้า A4)
    return `
      <div class="asset-sticker-large" style="border: 1.5px solid #000; border-radius: 6px; padding: 2.5mm 3mm; box-sizing: border-box; width: ${isPreview ? '320px' : '95mm'}; height: ${isPreview ? 'auto' : '52mm'}; min-height: 52mm; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; background: #fff; font-family: 'Sarabun', sans-serif;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #000; padding-bottom: 1px; margin-bottom: 2px;">
          <span style="font-size: 10pt; font-weight: bold; color: #000;">${schoolHeader}</span>
          <span style="font-size: 7.5pt; font-weight: bold; background: #e5e7eb; padding: 1px 4px; border-radius: 3px; color: #000;">ทะเบียนครุภัณฑ์</span>
        </div>
        <div style="display: flex; gap: 3mm; align-items: center; flex: 1; overflow: hidden;">
          <div style="flex: 1; min-width: 0; line-height: 1.25;">
            <div style="font-size: 10.5pt; font-weight: bold; color: #000; word-break: break-all;">${code}</div>
            <div style="font-size: 8.5pt; font-weight: bold; color: #111; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.15; margin: 1px 0;">${name}</div>
            ${spec ? `<div style="font-size: 7.5pt; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">สเปก: ${spec}</div>` : ''}
            <div style="font-size: 7.5pt; color: #222;">วันที่รับ: ${dateStr} (ปีงบ ${fiscalYear})</div>
            <div style="font-size: 7.5pt; color: #222; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">สถานที่: ${location}</div>
            <div style="font-size: 7.5pt; color: #000; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">ผู้รับผิดชอบ: ${person}</div>
          </div>
          <div style="width: 82px; height: 82px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div class="qr-canvas-box" data-url="${qrUrl}" style="width: 72px; height: 72px;"></div>
            <div style="font-size: 6pt; color: #444; text-align: center; margin-top: 1px; font-weight: 500;">สแกนตรวจสอบ</div>
          </div>
        </div>
      </div>
    `;
  }

  // ขนาดมาตรฐาน Compact (3 คอลัมน์ x 8 แถว บนหน้า A4)
  return `
    <div class="asset-sticker-compact" style="border: 1px dashed #555; border-radius: 4px; padding: 1.8mm 2mm; box-sizing: border-box; width: ${isPreview ? '230px' : '63.5mm'}; height: ${isPreview ? 'auto' : '33mm'}; min-height: 33mm; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; background: #fff; font-family: 'Sarabun', sans-serif;">
      <div style="font-size: 8pt; font-weight: bold; text-align: center; border-bottom: 1px solid #111; padding-bottom: 1px; margin-bottom: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000;">
        ${schoolHeader}
      </div>
      <div style="display: flex; gap: 2mm; align-items: center; flex: 1; overflow: hidden;">
        <div style="flex: 1; min-width: 0; line-height: 1.15;">
          <div style="font-size: 8pt; font-weight: bold; color: #000; word-break: break-all;">${code}</div>
          <div style="font-size: 7pt; font-weight: 600; color: #111; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; margin-bottom: 1px;">${name}</div>
          <div style="font-size: 6.5pt; color: #333;">ปีงบ: ${shortYear} (${dateStr})</div>
          <div style="font-size: 6.5pt; color: #000; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">ผู้ดูแล: ${person}</div>
        </div>
        <div style="width: 54px; height: 54px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <div class="qr-canvas-box" data-url="${qrUrl}" style="width: 48px; height: 48px;"></div>
          <div style="font-size: 5pt; color: #555; text-align: center; margin-top: 1px;">สแกนดูข้อมูล</div>
        </div>
      </div>
    </div>
  `;
}

function handlePrintQrStickers() {
  const items = getStickerAssetsList();
  if (!items || items.length === 0) {
    alert('ไม่พบรายการครุภัณฑ์ที่จะพิมพ์');
    return;
  }

  const sizeSelect = document.getElementById('sticker-layout-size');
  const layoutSize = sizeSelect ? sizeSelect.value : 'compact';
  const headerInput = document.getElementById('sticker-school-header');
  const schoolHeader = headerInput ? headerInput.value.trim() : 'โรงเรียนบ้านดงกลาง';

  const printSection = document.getElementById('print-qr-sticker-section');
  if (!printSection) return;

  let pagesHtml = '';

  if (layoutSize === 'single') {
    // พิมพ์ดวงเดี่ยว 1 ชิ้น
    const item = items[0];
    pagesHtml = `
      <div class="sticker-page" style="display: flex; justify-content: center; align-items: center; min-height: 100vh;">
        ${renderSingleStickerHtml(item, 'large', schoolHeader, false)}
      </div>
    `;
  } else if (layoutSize === 'large') {
    // 2 คอลัมน์ x 5 แถว = 10 ดวงต่อหน้า A4
    const itemsPerPage = 10;
    const totalPages = Math.ceil(items.length / itemsPerPage);

    for (let p = 0; p < totalPages; p++) {
      const pageItems = items.slice(p * itemsPerPage, (p + 1) * itemsPerPage);
      const isLastPage = (p === totalPages - 1);
      const gridItemsHtml = pageItems.map(item => renderSingleStickerHtml(item, 'large', schoolHeader, false)).join('');

      pagesHtml += `
        <div class="sticker-page" style="width: 100%; box-sizing: border-box; page-break-after: ${isLastPage ? 'avoid' : 'always'}; break-after: ${isLastPage ? 'avoid' : 'page'}; padding: 4mm 2mm;">
          <div style="display: grid; grid-template-columns: repeat(2, 95mm); gap: 4mm 5mm; justify-content: center;">
            ${gridItemsHtml}
          </div>
        </div>
      `;
    }
  } else {
    // ขนาดมาตรฐาน Compact (3 คอลัมน์ x 8 แถว = 24 ดวงต่อหน้า A4)
    const itemsPerPage = 24;
    const totalPages = Math.ceil(items.length / itemsPerPage);

    for (let p = 0; p < totalPages; p++) {
      const pageItems = items.slice(p * itemsPerPage, (p + 1) * itemsPerPage);
      const isLastPage = (p === totalPages - 1);
      const gridItemsHtml = pageItems.map(item => renderSingleStickerHtml(item, 'compact', schoolHeader, false)).join('');

      pagesHtml += `
        <div class="sticker-page" style="width: 100%; box-sizing: border-box; page-break-after: ${isLastPage ? 'avoid' : 'always'}; break-after: ${isLastPage ? 'avoid' : 'page'}; padding: 3mm 1mm;">
          <div style="display: grid; grid-template-columns: repeat(3, 63.5mm); gap: 2.2mm 2.5mm; justify-content: center;">
            ${gridItemsHtml}
          </div>
        </div>
      `;
    }
  }

  printSection.innerHTML = pagesHtml;

  // Render QR Codes on all rendered canvas boxes
  const qrBoxes = printSection.querySelectorAll('.qr-canvas-box');
  const qrPixSize = (layoutSize === 'large' || layoutSize === 'single') ? 72 : 48;

  qrBoxes.forEach(box => {
    const url = box.dataset.url;
    new QRCode(box, {
      text: url,
      width: qrPixSize,
      height: qrPixSize,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
  });

  applyStickerPrintPageStyle();
  setPrintTarget('qrSticker');
  closeModal('qrStickerModal');
  window.print();
}

// ==================== ระบบสแกน QR Code ตรวจสอบครุภัณฑ์ดิจิทัล ====================
async function showPublicAssetCard(id) {
  const contentEl = document.getElementById('public-asset-content');
  const editBtn = document.getElementById('public-asset-edit-btn');
  if (!contentEl) return;

  currentPublicAssetId = id;
  contentEl.innerHTML = `
    <div class="text-center py-8">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 mb-2"></div>
      <div class="text-xs text-slate-500">กำลังโหลดข้อมูลครุภัณฑ์...</div>
    </div>
  `;
  openModal('publicAssetModal');

  try {
    const res = await fetch(`/api/public/asset/${id}`);
    if (!res.ok) {
      contentEl.innerHTML = `
        <div class="text-center py-6 text-rose-600 bg-rose-50 border border-rose-200 rounded-2xl p-4">
          <div class="text-2xl mb-1">❌</div>
          <div class="font-bold">ไม่พบข้อมูลครุภัณฑ์นี้ในระบบ</div>
          <div class="text-[11px] text-slate-500 mt-1">รหัสอาจถูกลบหรือยังไม่ได้ลงทะเบียนในระบบ</div>
        </div>
      `;
      if (editBtn) editBtn.classList.add('hidden');
      return;
    }

    const item = await res.json();
    currentPublicAssetId = item.id;

    // สถานะ Badge
    let statusClass = 'bg-emerald-100 text-emerald-800 border-emerald-300';
    if (item.status === 'ชำรุด (สามารถซ่อมได้)') statusClass = 'bg-amber-100 text-amber-800 border-amber-300';
    else if (item.status === 'ชำรุด/เสื่อมสภาพ (ขอจำหน่าย)') statusClass = 'bg-rose-100 text-rose-800 border-rose-300';
    else if (item.status === 'จำหน่ายแล้ว') statusClass = 'bg-slate-200 text-slate-700 border-slate-300';

    contentEl.innerHTML = `
      <!-- หมายเลขครุภัณฑ์เด่นชัด -->
      <div class="p-3.5 bg-gradient-to-r from-red-50 to-amber-50 rounded-2xl border border-amber-200 text-center space-y-1">
        <div class="text-[10px] font-bold text-amber-900 tracking-wider uppercase">รหัสทะเบียนครุภัณฑ์</div>
        <div class="text-lg sm:text-xl font-bold font-mono text-red-950">${item.asset_code || '-'}</div>
        <div>
          <span class="inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${statusClass}">
            ${item.status || 'ใช้งานได้ดี'}
          </span>
        </div>
      </div>

      <!-- รายละเอียด -->
      <div class="border border-slate-200 rounded-2xl p-3 bg-white space-y-2 text-xs">
        <div class="pb-2 border-b border-slate-100">
          <div class="text-[10px] text-slate-400 font-medium">รายการครุภัณฑ์</div>
          <div class="font-bold text-slate-900 text-sm leading-snug">${item.asset_name || '-'}</div>
        </div>

        <div class="grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <span class="text-slate-400 block">หมวดหมู่:</span>
            <span class="font-medium text-slate-800">${item.category || '-'}</span>
          </div>
          <div>
            <span class="text-slate-400 block">รุ่น/ยี่ห้อ:</span>
            <span class="font-medium text-slate-800">${item.model || '-'}</span>
          </div>
          <div>
            <span class="text-slate-400 block">วันที่ได้รับ:</span>
            <span class="font-medium text-slate-800">${item.received_date || '-'}</span>
          </div>
          <div>
            <span class="text-slate-400 block">ราคาทุน:</span>
            <span class="font-medium text-slate-800">${Number(item.cost || 0).toLocaleString('th-TH', {minimumFractionDigits: 2})} บาท</span>
          </div>
          <div>
            <span class="text-slate-400 block">สถานที่จัดเก็บ:</span>
            <span class="font-medium text-slate-800">${item.location || '-'}</span>
          </div>
          <div>
            <span class="text-slate-400 block">อายุใช้งาน:</span>
            <span class="font-medium text-slate-800">${item.useful_life || 5} ปี</span>
          </div>
        </div>

        <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
          <span class="text-slate-500 font-medium">ผู้รับผิดชอบ:</span>
          <span class="font-bold text-amber-950 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">${item.responsible_person || '-'}</span>
        </div>
      </div>
    `;

    // ถ้ามี auth token อยู่แล้ว ให้แสดงปุ่มแก้ไข
    if (editBtn) {
      const token = getAuthToken();
      if (token) {
        editBtn.classList.remove('hidden');
      } else {
        editBtn.classList.add('hidden');
      }
    }
  } catch (e) {
    contentEl.innerHTML = `<div class="text-center py-4 text-rose-600 text-xs">เกิดข้อผิดพลาดในการดึงข้อมูล</div>`;
  }
}

function goToEditFromPublicCard() {
  if (!currentPublicAssetId) return;
  closeModal('publicAssetModal');
  editAsset(Number(currentPublicAssetId));
}

