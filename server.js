const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const db = new sqlite3.Database('./school_assets.db');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// สร้างตารางในฐานข้อมูล SQLite
db.serialize(() => {
  // 1. ตารางครุภัณฑ์ (เอกสารหมายเลข ๓)
  db.run(`CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_code TEXT UNIQUE,
    received_date TEXT,
    asset_name TEXT,
    spec TEXT,
    doc_no TEXT,
    cost REAL,
    useful_life INTEGER,
    location TEXT,
    status TEXT,
    vendor TEXT,
    responsible_person TEXT,
    department TEXT,
    remark TEXT
  )`);

  // 2. ตารางบัญชีคุมวัสดุ (เอกสารหมายเลข ๓)
  db.run(`CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trans_date TEXT,
    material_code TEXT,
    material_name TEXT,
    size_spec TEXT,
    unit TEXT,
    party TEXT,
    doc_no TEXT,
    budget_type TEXT,
    opening_stock INTEGER,
    qty_in INTEGER,
    qty_out INTEGER,
    unit_price REAL,
    remark TEXT
  )`);
});

// Helper: คำนวณค่าเสื่อมราคาและมูลค่าทางบัญชี
function calculateDepreciation(item) {
  const receivedYear = new Date(item.received_date).getFullYear();
  const currentYear = new Date().getFullYear();
  let currentAge = currentYear - receivedYear;
  if (currentAge < 0 || isNaN(currentAge)) currentAge = 0;

  const cost = item.cost || 0;
  const usefulLife = item.useful_life || 5;

  // ค่าเสื่อมราคาต่อปี = (ราคาทุน - 1) / อายุการใช้งาน
  const deprPerYear = cost > 1 ? (cost - 1) / usefulLife : 0;
  // ค่าเสื่อมราคาสะสม
  const accDepr = Math.min(cost - 1, deprPerYear * currentAge);
  // มูลค่าสุทธิทางบัญชี
  const netBookValue = Math.max(1, cost - accDepr);

  return {
    ...item,
    current_age: currentAge,
    depr_per_year: deprPerYear,
    acc_depr: accDepr,
    net_book_value: netBookValue
  };
}

// === API ENDPOINTS ===

// ดึงรายการครุภัณฑ์ทั้งหมด
app.get('/api/assets', (req, res) => {
  db.all('SELECT * FROM assets ORDER BY id ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const calculated = rows.map(calculateDepreciation);
    res.json(calculated);
  });
});

// บันทึกครุภัณฑ์ใหม่
app.post('/api/assets', (req, res) => {
  const d = req.body;
  const sql = `INSERT INTO assets (asset_code, received_date, asset_name, spec, doc_no, cost, useful_life, location, status, vendor, responsible_person, department, remark)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = [d.asset_code, d.received_date, d.asset_name, d.spec, d.doc_no, d.cost, d.useful_life, d.location, d.status, d.vendor, d.responsible_person, d.department, d.remark];
  
  db.run(sql, params, function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ message: 'บันทึกข้อมูลครุภัณฑ์เรียบร้อยแล้ว', id: this.lastID });
  });
});

// ลบครุภัณฑ์
app.delete('/api/assets/:id', (req, res) => {
  db.run('DELETE FROM assets WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'ลบรายการสำเร็จ', deleted: this.changes });
  });
});

// ดึงรายการวัสดุทั้งหมด (พร้อมคำนวณ ยอดคงเหลือ และ มูลค่ารวม)
app.get('/api/materials', (req, res) => {
  db.all('SELECT * FROM materials ORDER BY id ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
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
  });
});

// บันทึกการรับ-จ่ายวัสดุ
app.post('/api/materials', (req, res) => {
  const d = req.body;
  const sql = `INSERT INTO materials (trans_date, material_code, material_name, size_spec, unit, party, doc_no, budget_type, opening_stock, qty_in, qty_out, unit_price, remark)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = [d.trans_date, d.material_code, d.material_name, d.size_spec, d.unit, d.party, d.doc_no, d.budget_type, d.opening_stock || 0, d.qty_in || 0, d.qty_out || 0, d.unit_price || 0, d.remark];
  
  db.run(sql, params, function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ message: 'บันทึกรายการวัสดุเรียบร้อยแล้ว', id: this.lastID });
  });
});

// ลบรายการวัสดุ
app.delete('/api/materials/:id', (req, res) => {
  db.run('DELETE FROM materials WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'ลบรายการสำเร็จ', deleted: this.changes });
  });
// ส่งออกข้อมูลสำรอง (Backup All Data)
app.get('/api/backup', (req, res) => {
  db.all('SELECT * FROM assets', [], (err, assets) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all('SELECT * FROM materials', [], (err2, materials) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({
        export_date: new Date().toISOString(),
        assets,
        materials
      });
    });
  });
});

// นำเข้าข้อมูลสำรอง (Restore Data)
app.post('/api/restore', (req, res) => {
  const { assets, materials } = req.body;
  if (!Array.isArray(assets) || !Array.isArray(materials)) {
    return res.status(400).json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' });
  }

  db.serialize(() => {
    db.run('DELETE FROM assets');
    db.run('DELETE FROM materials');

    const assetStmt = db.prepare(`INSERT INTO assets (asset_code, received_date, asset_name, spec, doc_no, cost, useful_life, location, status, vendor, responsible_person, department, remark)
                                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    assets.forEach(d => {
      assetStmt.run([d.asset_code, d.received_date, d.asset_name, d.spec, d.doc_no, d.cost, d.useful_life, d.location, d.status, d.vendor, d.responsible_person, d.department, d.remark]);
    });
    assetStmt.finalize();

    const matStmt = db.prepare(`INSERT INTO materials (trans_date, material_code, material_name, size_spec, unit, party, doc_no, budget_type, opening_stock, qty_in, qty_out, unit_price, remark)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    materials.forEach(d => {
      matStmt.run([d.trans_date, d.material_code, d.material_name, d.size_spec, d.unit, d.party, d.doc_no, d.budget_type, d.opening_stock, d.qty_in, d.qty_out, d.unit_price, d.remark]);
    });
    matStmt.finalize();

    res.json({ message: 'กู้คืนข้อมูลสำเร็จเรียบร้อยแล้ว' });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
