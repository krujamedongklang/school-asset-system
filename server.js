const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  setHeaders: (res, path) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
}));

// Helper: คำนวณค่าเสื่อมราคาและมูลค่าทางบัญชี
function calculateDepreciation(item) {
  let receivedYear = 0;
  if (item.received_date) {
    const parts = item.received_date.split('-');
    if (parts.length > 0) {
      receivedYear = parseInt(parts[0], 10);
      if (receivedYear > 2400) {
        receivedYear -= 543; // แปลง พ.ศ. เป็น ค.ศ. ให้ถูกต้องเพื่อป้องกันอายุการใช้งานติดลบ
      }
    }
  }
  const currentYear = new Date().getFullYear();
  let currentAge = receivedYear > 0 ? currentYear - receivedYear : 0;
  if (currentAge < 0 || isNaN(currentAge)) currentAge = 0;

  const cost = Number(item.cost) || 0;
  const qty = Number(item.qty) || 1;
  const totalCost = cost * qty;
  const usefulLife = Number(item.useful_life) || 5;
  const deprRate = usefulLife > 0 ? (100 / usefulLife).toFixed(0) + '%' : '20%';

  // ค่าเสื่อมราคาต่อปี = (ราคาทุนรวม - 1) / อายุการใช้งาน
  const deprPerYear = totalCost > 1 ? (totalCost - 1) / usefulLife : 0;
  // ค่าเสื่อมราคาสะสม
  const accDepr = Math.min(totalCost - 1, deprPerYear * currentAge);
  // มูลค่าสุทธิทางบัญชี (ขั้นต่ำ 1 บาท)
  const netBookValue = Math.max(1, totalCost - accDepr);

  return {
    ...item,
    qty,
    total_cost: totalCost,
    current_age: currentAge,
    depr_rate: deprRate,
    depr_per_year: deprPerYear,
    acc_depr: accDepr,
    net_book_value: netBookValue
  };
}

// ==================== AUTHENTICATION API & MIDDLEWARE ====================

// Middleware: ตรวจสอบการเข้าสู่ระบบ
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const user = await db.verifySession(token);
  if (!user) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' });
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ (เฉพาะผู้ดูแลระบบเท่านั้น)' });
  }
  next();
}

function requireEdit(req, res, next) {
  if (!req.user || (req.user.role !== 'admin' && !req.user.canEdit)) {
    return res.status(403).json({ error: 'คุณไม่ได้รับสิทธิ์ในการแก้ไขข้อมูล กรุณาติดต่อคุณครูผู้ดูแลระบบ' });
  }
  next();
}

function requireDelete(req, res, next) {
  if (!req.user || (req.user.role !== 'admin' && !req.user.canDelete)) {
    return res.status(403).json({ error: 'คุณไม่ได้รับสิทธิ์ในการลบข้อมูล กรุณาติดต่อคุณครูผู้ดูแลระบบ' });
  }
  next();
}

function requireAdd(req, res, next) {
  if (!req.user || (req.user.role !== 'admin' && !req.user.canAdd)) {
    return res.status(403).json({ error: 'คุณไม่ได้รับสิทธิ์ในการเพิ่มข้อมูล กรุณาติดต่อคุณครูผู้ดูแลระบบ' });
  }
  next();
}

// Helper: บันทึกประวัติกิจกรรม (History Audit Trail)
async function recordAudit(req, { action, entityType, entityId, entityName, details }) {
  try {
    const user = req.user || {};
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    const ipAddress = Array.isArray(ip) ? ip[0] : (String(ip).split(',')[0].trim());
    await db.addAuditLog({
      userId: user.id || null,
      username: user.username || 'system',
      fullName: user.full_name || user.username || 'ผู้ใช้งานระบบ',
      action,
      entityType,
      entityId: entityId ? String(entityId) : null,
      entityName: entityName || '',
      details: details || '',
      ipAddress
    });
  } catch (err) {
    console.error('Audit log record error:', err);
  }
}

// ล็อกอินเข้าสู่ระบบ (รองรับทั้ง username และ password)
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await db.loginUser(username, password);
  if (!result.success) {
    const status = result.error && result.error.includes('รอผู้ดูแลระบบ') ? 403 : 401;
    return res.status(status).json({ error: result.error });
  }
  await recordAudit({ user: result.user, headers: req.headers, socket: req.socket }, {
    action: 'LOGIN',
    entityType: 'user',
    entityId: result.user.id,
    entityName: result.user.full_name || result.user.username,
    details: `เข้าสู่ระบบสำเร็จ (Username: ${result.user.username})`
  });
  res.json({ success: true, message: 'เข้าสู่ระบบสำเร็จ', token: result.token, user: result.user });
});

// ลงทะเบียนขอสิทธิ์เข้าใช้งาน
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, fullName, position } = req.body;
    const user = await db.registerUser({ username, password, fullName, position });
    await recordAudit({ user: { username, full_name: fullName }, headers: req.headers, socket: req.socket }, {
      action: 'REGISTER',
      entityType: 'user',
      entityId: user.id,
      entityName: fullName,
      details: `ส่งคำขอลงทะเบียนเข้าใช้งาน: ${fullName} (${username}) ตำแหน่ง: ${position || '-'}`
    });
    res.json({
      success: true,
      message: 'ลงทะเบียนขอเข้าใช้งานสำเร็จแล้ว! ระบบได้ส่งข้อมูลไปยังผู้ดูแลระบบเรียบร้อย กรุณาแจ้งคุณครูผู้ดูแลระบบเพื่ออนุมัติสิทธิ์เข้าใช้งานครับ',
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        position: user.position,
        status: user.status
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Health check & Keep-alive endpoint (สำหรับบริการ Ping ป้องกันเซิร์ฟเวอร์หลับ)
app.get(['/api/health', '/api/ping', '/healthz'], (req, res) => {
  res.status(200).json({ status: 'ok', uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() });
});

// ตรวจสอบสถานะการล็อกอินและสิทธิ์
app.get('/api/auth/verify', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const user = await db.verifySession(token);
  if (user) {
    res.json({ authenticated: true, user });
  } else {
    res.json({ authenticated: false });
  }
});

// เปลี่ยนรหัสผ่านของบัญชีตนเอง
app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร' });
  }

  const user = await db.getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'ไม่พบบัญชีผู้ใช้งาน' });

  const isCurrentValid = (user.password_hash === db.hashPassword(currentPassword)) || (user.password_hash === currentPassword);
  if (!isCurrentValid) {
    return res.status(401).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
  }

  await db.updateUserPassword(user.id, newPassword);
  res.json({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จเรียบร้อยแล้ว' });
});

// ออกจากระบบ
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  db.removeSession(token);
  res.json({ success: true, message: 'ออกจากระบบเรียบร้อยแล้ว' });
});

// ==================== USER MANAGEMENT API (ADMIN ONLY) ====================

// ดึงรายชื่อผู้ใช้งานทั้งหมด
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await db.getUsers(true);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// กำหนดสิทธิ์และสถานะบัญชีครู
app.put('/api/admin/users/:id/permissions', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { canEdit, canDelete, canAdd, role, status } = req.body;
    const users = await db.getUsers(true);
    const targetUser = users.find(u => String(u.id) === String(req.params.id));
    await db.updateUserPermissions(req.params.id, { canEdit, canDelete, canAdd, role, status });

    const perms = [];
    if (canAdd) perms.push('เพิ่ม');
    if (canEdit) perms.push('แก้ไข');
    if (canDelete) perms.push('ลบ');
    const isApprove = status === 'active' && targetUser?.status === 'pending';

    await recordAudit(req, {
      action: isApprove ? 'APPROVE_USER' : 'PERMISSION_CHANGE',
      entityType: 'user',
      entityId: req.params.id,
      entityName: targetUser?.full_name || targetUser?.username,
      details: isApprove
        ? `อนุมัติบัญชีผู้ใช้งาน: ${targetUser?.full_name || targetUser?.username} (บทบาท: ${role})`
        : `ปรับสิทธิ์ ${targetUser?.full_name || targetUser?.username}: สถานะ ${status}, บทบาท ${role}, สิทธิ์ [${perms.join(', ')}]`
    });

    res.json({ success: true, message: 'บันทึกสิทธิ์การใช้งานเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// รีเซ็ตรหัสผ่านให้ครู
app.put('/api/admin/users/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร' });
    }
    const users = await db.getUsers(true);
    const targetUser = users.find(u => String(u.id) === String(req.params.id));
    await db.updateUserPassword(req.params.id, newPassword);

    await recordAudit(req, {
      action: 'RESET_PASSWORD',
      entityType: 'user',
      entityId: req.params.id,
      entityName: targetUser?.full_name || targetUser?.username,
      details: `รีเซ็ตรหัสผ่านใหม่ให้: ${targetUser?.full_name || targetUser?.username}`
    });

    res.json({ success: true, message: 'รีเซ็ตรหัสผ่านให้ผู้ใช้เรียบร้อยแล้ว' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ลบบัญชีผู้ใช้งาน
app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await db.getUsers(true);
    const targetUser = users.find(u => String(u.id) === String(req.params.id));
    await db.deleteUser(req.params.id);

    await recordAudit(req, {
      action: 'DELETE_USER',
      entityType: 'user',
      entityId: req.params.id,
      entityName: targetUser?.full_name || targetUser?.username,
      details: `ลบบัญชีผู้ใช้งาน: ${targetUser?.full_name || targetUser?.username}`
    });

    res.json({ success: true, message: 'ลบบัญชีผู้ใช้งานเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ซิงค์ตารางผู้ใช้งานขึ้น Supabase
app.post('/api/admin/users/sync-supabase', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.syncUsersToSupabaseTable();
    res.json({ success: true, message: `ซิงค์บัญชีผู้ใช้ขึ้น Supabase สำเร็จ (${result.count} บัญชี)` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==================== DATABASE / SUPABASE STATUS API ====================

// ตรวจสอบสถานะการเชื่อมต่อฐานข้อมูล
app.get('/api/database/status', requireAuth, async (req, res) => {
  try {
    const status = await db.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// บันทึกการตั้งค่า Supabase
app.post('/api/database/config', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { url, key } = req.body;
    const result = await db.setSupabaseConfig(url, key);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// โอนย้ายข้อมูลขึ้น Supabase
app.post('/api/database/sync', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.syncToSupabase();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการซิงค์: ' + err.message });
  }
});

// ==================== ASSETS API ====================

// ดึงข้อมูลครุภัณฑ์สำหรับสแกน QR Code (Public Read-only)
app.get('/api/public/asset/:id', async (req, res) => {
  try {
    const assets = await db.getAssets();
    const item = assets.find(a => String(a.id) === String(req.params.id) || a.asset_code === req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลครุภัณฑ์นี้ในระบบ' });
    }
    const calculated = calculateDepreciation(item);
    res.json({
      id: calculated.id,
      asset_code: calculated.asset_code,
      asset_name: calculated.asset_name,
      category: calculated.category,
      spec: calculated.spec,
      model: calculated.model,
      received_date: calculated.received_date,
      useful_life: calculated.useful_life,
      cost: calculated.cost,
      location: calculated.location,
      status: calculated.status,
      responsible_person: calculated.responsible_person,
      vendor: calculated.vendor,
      budget_source: calculated.budget_source,
      department: calculated.department || 'โรงเรียนบ้านดงกลาง'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ดึงรายการครุภัณฑ์ทั้งหมด
app.get('/api/assets', requireAuth, async (req, res) => {
  try {
    const rows = await db.getAssets();
    const calculated = rows.map(calculateDepreciation);
    res.json(calculated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// บันทึกครุภัณฑ์ใหม่
app.post('/api/assets', requireAuth, requireAdd, async (req, res) => {
  try {
    const id = await db.createAsset(req.body);
    await recordAudit(req, {
      action: 'CREATE',
      entityType: 'asset',
      entityId: id,
      entityName: req.body.asset_name || 'ครุภัณฑ์ใหม่',
      details: `เพิ่มครุภัณฑ์ใหม่: ${req.body.asset_name || '-'} (รหัส ${req.body.asset_code || '-'}) ราคาทุน ฿${Number(req.body.cost || 0).toLocaleString()} ผู้รับผิดชอบ: ${req.body.responsible_person || '-'}`
    });
    res.json({ message: 'บันทึกข้อมูลครุภัณฑ์เรียบร้อยแล้ว', id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// นำเข้าครุภัณฑ์จำนวนมาก (Bulk Import จาก Excel / CSV)
app.post('/api/assets/bulk', requireAuth, requireAdd, async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (items.length === 0) {
      return res.status(400).json({ error: 'ไม่พบรายการที่ต้องการนำเข้า' });
    }

    let successCount = 0;
    for (const item of items) {
      await db.createAsset(item);
      successCount++;
    }

    await recordAudit(req, {
      action: 'IMPORT_EXCEL',
      entityType: 'asset',
      entityId: '',
      entityName: `นำเข้าครุภัณฑ์ (${successCount} รายการ)`,
      details: `นำเข้าข้อมูลครุภัณฑ์จาก Excel/CSV สำเร็จจำนวน ${successCount} รายการ`
    });

    res.json({ success: true, count: successCount, message: `นำเข้าครุภัณฑ์เรียบร้อยแล้ว ${successCount} รายการ` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// แก้ไขครุภัณฑ์
app.put('/api/assets/:id', requireAuth, requireEdit, async (req, res) => {
  try {
    const allAssets = await db.getAssets();
    const oldItem = allAssets.find(a => String(a.id) === String(req.params.id));
    await db.updateAsset(req.params.id, req.body);

    let diffs = [];
    if (oldItem) {
      if ((oldItem.status || '').trim() !== (req.body.status || '').trim()) {
        diffs.push(`เปลี่ยนสถานะเป็น "${req.body.status || '-'}"`);
      }
      if ((oldItem.location || '').trim() !== (req.body.location || '').trim()) {
        diffs.push(`เปลี่ยนสถานที่ตั้งเป็น "${req.body.location || '-'}"`);
      }
      if ((oldItem.responsible_person || '').trim() !== (req.body.responsible_person || '').trim()) {
        diffs.push(`เปลี่ยนผู้รับผิดชอบเป็น "${req.body.responsible_person || '-'}"`);
      }
    }
    const details = diffs.length > 0 
      ? `แก้ไขข้อมูล: ${diffs.join(', ')}`
      : `แก้ไขข้อมูลครุภัณฑ์: ${req.body.asset_name || '-'} (รหัส ${req.body.asset_code || '-'})`;
    const action = diffs.some(d => d.includes('สถานะ')) ? 'STATUS_CHANGE' : 'UPDATE';

    await recordAudit(req, {
      action,
      entityType: 'asset',
      entityId: req.params.id,
      entityName: req.body.asset_name || oldItem?.asset_name || 'ครุภัณฑ์',
      details
    });

    res.json({ message: 'แก้ไขข้อมูลครุภัณฑ์เรียบร้อยแล้ว' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ลบครุภัณฑ์
app.delete('/api/assets/:id', requireAuth, requireDelete, async (req, res) => {
  try {
    const allAssets = await db.getAssets();
    const targetItem = allAssets.find(a => String(a.id) === String(req.params.id));
    await db.deleteAsset(req.params.id);

    await recordAudit(req, {
      action: 'DELETE',
      entityType: 'asset',
      entityId: req.params.id,
      entityName: targetItem ? targetItem.asset_name : 'ครุภัณฑ์',
      details: `ลบรายการครุภัณฑ์: ${targetItem ? (targetItem.asset_name + ' (รหัส ' + (targetItem.asset_code || '-') + ')') : 'ID ' + req.params.id}`
    });

    res.json({ message: 'ลบรายการสำเร็จ' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== MATERIALS API ====================

// ดึงรายการวัสดุทั้งหมด
app.get('/api/materials', requireAuth, async (req, res) => {
  try {
    const rawRows = await db.getMaterials();
    // จัดเรียงตามวันที่ทำรายการและรหัส id เพื่อให้ยอดคงเหลือยกยอดตามลำดับจริง
    const rows = [...rawRows].sort((a, b) => {
      const dateA = a.trans_date || '';
      const dateB = b.trans_date || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return (Number(a.id) || 0) - (Number(b.id) || 0);
    });

    // คำนวณยอดคงเหลือแยกตามชนิดวัสดุ (Material Group)
    const groupBalances = {};
    const processed = rows.map((item) => {
      const groupKey = (item.material_name || item.material_code || '__default__').trim().toLowerCase();
      if (groupBalances[groupKey] === undefined) {
        groupBalances[groupKey] = (Number(item.opening_stock) || 0) + (Number(item.qty_in) || 0) - (Number(item.qty_out) || 0);
      } else {
        groupBalances[groupKey] = groupBalances[groupKey] + (Number(item.qty_in) || 0) - (Number(item.qty_out) || 0);
      }
      const balance = groupBalances[groupKey];
      const totalAmount = balance * (Number(item.unit_price) || 0);
      return {
        ...item,
        balance,
        total_amount: totalAmount
      };
    });
    res.json(processed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// บันทึกการรับ-จ่ายวัสดุ
app.post('/api/materials', requireAuth, requireAdd, async (req, res) => {
  try {
    const id = await db.createMaterial(req.body);
    await recordAudit(req, {
      action: 'CREATE',
      entityType: 'material',
      entityId: id,
      entityName: req.body.party || 'รายการวัสดุ',
      details: `บันทึกรายการวัสดุ: ${req.body.party || '-'} (เลขที่ ${req.body.doc_no || '-'}) รับเข้า ${req.body.qty_in || 0} / จ่ายออก ${req.body.qty_out || 0}`
    });
    res.json({ message: 'บันทึกรายการวัสดุเรียบร้อยแล้ว', id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// นำเข้าวัสดุจำนวนมาก (Bulk Import จาก Excel / CSV)
app.post('/api/materials/bulk', requireAuth, requireAdd, async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (items.length === 0) {
      return res.status(400).json({ error: 'ไม่พบรายการที่ต้องการนำเข้า' });
    }

    let successCount = 0;
    for (const item of items) {
      await db.createMaterial(item);
      successCount++;
    }

    await recordAudit(req, {
      action: 'IMPORT_EXCEL',
      entityType: 'material',
      entityId: '',
      entityName: `นำเข้าวัสดุ (${successCount} รายการ)`,
      details: `นำเข้าข้อมูลวัสดุจาก Excel/CSV สำเร็จจำนวน ${successCount} รายการ`
    });

    res.json({ success: true, count: successCount, message: `นำเข้าวัสดุเรียบร้อยแล้ว ${successCount} รายการ` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// แก้ไขรายการวัสดุ
app.put('/api/materials/:id', requireAuth, requireEdit, async (req, res) => {
  try {
    await db.updateMaterial(req.params.id, req.body);
    await recordAudit(req, {
      action: 'UPDATE',
      entityType: 'material',
      entityId: req.params.id,
      entityName: req.body.party || 'รายการวัสดุ',
      details: `แก้ไขรายการวัสดุ: ${req.body.party || '-'} (เลขที่ ${req.body.doc_no || '-'})`
    });
    res.json({ message: 'แก้ไขข้อมูลวัสดุเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ลบรายการวัสดุ
app.delete('/api/materials/:id', requireAuth, requireDelete, async (req, res) => {
  try {
    const allMaterials = await db.getMaterials();
    const targetMat = allMaterials.find(m => String(m.id) === String(req.params.id));
    await db.deleteMaterial(req.params.id);
    await recordAudit(req, {
      action: 'DELETE',
      entityType: 'material',
      entityId: req.params.id,
      entityName: targetMat ? targetMat.party : 'รายการวัสดุ',
      details: `ลบรายการวัสดุ: ${targetMat ? targetMat.party : 'ID ' + req.params.id}`
    });
    res.json({ message: 'ลบรายการสำเร็จ' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== AUDIT LOGS (HISTORY AUDIT TRAIL) API ====================

// ดึงประวัติกิจกรรม (Audit Trail)
app.get('/api/audit-logs', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    const entityType = req.query.entity_type || 'all';
    const entityId = req.query.entity_id || null;
    const action = req.query.action || 'all';
    const search = req.query.search || '';

    const result = await db.getAuditLogs({ limit, offset, entityType, entityId, action, search });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ล้างประวัติกิจกรรม (เฉพาะแอดมิน)
app.delete('/api/audit-logs', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db.clearAuditLogs();
    await recordAudit(req, {
      action: 'CLEAR_LOGS',
      entityType: 'system',
      entityId: null,
      entityName: 'ระบบบันทึกประวัติ',
      details: 'ล้างข้อมูลประวัติกิจกรรมทั้งหมด (Audit Trail Reset)'
    });
    res.json({ success: true, message: 'ล้างประวัติกิจกรรมเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== BACKUP & RESTORE API ====================

// ส่งออกข้อมูลสำรอง (Backup All Data)
app.get('/api/backup', requireAuth, async (req, res) => {
  try {
    const data = await db.backupAll();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// นำเข้าข้อมูลสำรอง (Restore Data)
app.post('/api/restore', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { assets, materials } = req.body;
    if (!Array.isArray(assets) || !Array.isArray(materials)) {
      return res.status(400).json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' });
    }
    await db.restoreAll({ assets, materials });
    res.json({ message: 'กู้คืนข้อมูลสำเร็จเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการกู้คืน: ' + err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
