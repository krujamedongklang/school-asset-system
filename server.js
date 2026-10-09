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
      receivedYear = parseInt(parts[0]);
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
  const isValid = await db.verifySession(token);
  if (!isValid) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' });
  }
  next();
}

// ล็อกอินเข้าสู่ระบบ
app.post('/api/auth/login', async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'กรุณากรอกรหัสผ่าน' });
  }

  const isValid = await db.checkPassword(password);
  if (!isValid) {
    return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง' });
  }

  const token = await db.createSession();
  res.json({ success: true, message: 'เข้าสู่ระบบสำเร็จ', token });
});

// ตรวจสอบสถานะการล็อกอิน
app.get('/api/auth/verify', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const isValid = await db.verifySession(token);
  res.json({ authenticated: isValid });
});

// เปลี่ยนรหัสผ่าน
app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร' });
  }

  const isValid = await db.checkPassword(currentPassword);
  if (!isValid) {
    return res.status(401).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
  }

  await db.setPassword(newPassword);
  res.json({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จเรียบร้อยแล้ว' });
});

// ออกจากระบบ
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  db.removeSession(token);
  res.json({ success: true, message: 'ออกจากระบบเรียบร้อยแล้ว' });
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
app.post('/api/database/config', requireAuth, async (req, res) => {
  try {
    const { url, key } = req.body;
    const result = await db.setSupabaseConfig(url, key);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// โอนย้ายข้อมูลขึ้น Supabase
app.post('/api/database/sync', requireAuth, async (req, res) => {
  try {
    const result = await db.syncToSupabase();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการซิงค์: ' + err.message });
  }
});

// ==================== ASSETS API ====================

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
app.post('/api/assets', requireAuth, async (req, res) => {
  try {
    const id = await db.createAsset(req.body);
    res.json({ message: 'บันทึกข้อมูลครุภัณฑ์เรียบร้อยแล้ว', id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// แก้ไขครุภัณฑ์
app.put('/api/assets/:id', requireAuth, async (req, res) => {
  try {
    await db.updateAsset(req.params.id, req.body);
    res.json({ message: 'แก้ไขข้อมูลครุภัณฑ์เรียบร้อยแล้ว' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ลบครุภัณฑ์
app.delete('/api/assets/:id', requireAuth, async (req, res) => {
  try {
    await db.deleteAsset(req.params.id);
    res.json({ message: 'ลบรายการสำเร็จ' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== MATERIALS API ====================

// ดึงรายการวัสดุทั้งหมด
app.get('/api/materials', requireAuth, async (req, res) => {
  try {
    const rows = await db.getMaterials();
    let runningBalance = 0;
    const processed = rows.map((item, index) => {
      if (index === 0) {
        runningBalance = (item.opening_stock || 0) + (item.qty_in || 0) - (item.qty_out || 0);
      } else {
        runningBalance = runningBalance + (item.qty_in || 0) - (item.qty_out || 0);
      }
      const totalAmount = runningBalance * (item.unit_price || 0);
      return {
        ...item,
        balance: runningBalance,
        total_amount: totalAmount
      };
    });
    res.json(processed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// บันทึกการรับ-จ่ายวัสดุ
app.post('/api/materials', requireAuth, async (req, res) => {
  try {
    const id = await db.createMaterial(req.body);
    res.json({ message: 'บันทึกรายการวัสดุเรียบร้อยแล้ว', id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// แก้ไขรายการวัสดุ
app.put('/api/materials/:id', requireAuth, async (req, res) => {
  try {
    await db.updateMaterial(req.params.id, req.body);
    res.json({ message: 'แก้ไขข้อมูลวัสดุเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ลบรายการวัสดุ
app.delete('/api/materials/:id', requireAuth, async (req, res) => {
  try {
    await db.deleteMaterial(req.params.id);
    res.json({ message: 'ลบรายการสำเร็จ' });
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
app.post('/api/restore', requireAuth, async (req, res) => {
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
