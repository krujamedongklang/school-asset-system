const { createClient } = require('@supabase/supabase-js');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// โหลดการตั้งค่า Supabase จากไฟล์ config หรือ Environment Variables
const CONFIG_FILE = path.join(__dirname, 'supabase_config.json');

// ค่าเริ่มต้นสำหรับการเชื่อมต่อ Supabase ของโรงเรียนบ้านดงกลาง
const DEFAULT_SUPABASE_URL = 'https://xolrvzpcssveioybpsxp.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhvbHJ2enBjc3N2ZWlveWJwc3hwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1NDA2MjIsImV4cCI6MjEwNzExNjYyMn0.MiUHy8fvUz66UmKGWZ_YxV-ZlwanXe1EvRTki2JJqmA';

function getSupabaseConfig() {
  let url = process.env.SUPABASE_URL || '';
  let key = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if ((!url || !key) && fs.existsSync(CONFIG_FILE)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      url = cfg.supabase_url || url;
      key = cfg.supabase_key || key;
    } catch (e) {}
  }

  if (!url || !key) {
    url = DEFAULT_SUPABASE_URL;
    key = DEFAULT_SUPABASE_KEY;
  }

  return { url: url.trim(), key: key.trim() };
}

let supabaseClient = null;
let isSupabaseActive = false;

function initSupabase() {
  const { url, key } = getSupabaseConfig();
  if (url && key) {
    try {
      supabaseClient = createClient(url, key, {
        auth: { persistSession: false }
      });
      isSupabaseActive = true;
      console.log('✅ เชื่อมต่อ Supabase Cloud Database สำเร็จ:', url);
    } catch (e) {
      console.error('❌ ไม่สามารถเชื่อมต่อ Supabase ได้:', e.message);
      supabaseClient = null;
      isSupabaseActive = false;
    }
  } else {
    supabaseClient = null;
    isSupabaseActive = false;
    console.log('ℹ️ ใช้งานฐานข้อมูลภายในระบบ (SQLite): school_assets.db');
  }
}

initSupabase();

// ฐานข้อมูล SQLite สำรอง
const sqliteDb = new sqlite3.Database(path.join(__dirname, 'school_assets.db'));

// สร้างตารางใน SQLite หากยังไม่มี
sqliteDb.serialize(() => {
  sqliteDb.run(`CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_code TEXT,
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
    remark TEXT,
    category TEXT,
    model TEXT,
    qty INTEGER DEFAULT 1,
    vendor_address TEXT,
    vendor_phone TEXT,
    budget_source TEXT,
    acquisition_method TEXT
  )`);

  sqliteDb.run(`CREATE TABLE IF NOT EXISTS materials (
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

  sqliteDb.run(`CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);
});

// Helper: บันทึกข้อมูลสำรอง Local JSON
function saveLocalBackup(assets, materials) {
  try {
    const backupData = {
      export_date: new Date().toISOString(),
      assets: assets || [],
      materials: materials || []
    };
    fs.writeFileSync(path.join(__dirname, 'data_backup.json'), JSON.stringify(backupData, null, 2), 'utf8');
    fs.writeFileSync(path.join(__dirname, 'seed_data.json'), JSON.stringify({ assets: assets || [], materials: materials || [] }, null, 2), 'utf8');
  } catch (e) {}
}

// ==================== ระบบรหัสผ่านและการตั้งค่า ====================
const DEFAULT_PASS = 'dongklang1234';
const SALT = 'dongklang_salt_2026';

function hashPassword(pass) {
  return crypto.createHash('sha256').update(pass + SALT).digest('hex');
}

// เก็บ Revoked Sessions และ Active Sessions
const revokedSessions = new Set();
const activeSessions = new Set();

const dbService = {
  // สถานะการเชื่อมต่อ
  async getStatus() {
    const { url } = getSupabaseConfig();
    return {
      mode: isSupabaseActive ? 'supabase' : 'sqlite',
      supabase_connected: isSupabaseActive,
      supabase_url: url ? url.replace(/(https?:\/\/)([^.]+)(.*)/, '$1***$3') : null,
      sqlite_file: 'school_assets.db'
    };
  },

  // บันทึกการตั้งค่า Supabase
  async setSupabaseConfig(url, key) {
    if (!url || !key) {
      if (fs.existsSync(CONFIG_FILE)) fs.unlinkSync(CONFIG_FILE);
      initSupabase();
      return { success: true, message: 'ยกเลิกการเชื่อมต่อ Supabase แล้ว กลับมาใช้ SQLite' };
    }

    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ supabase_url: url.trim(), supabase_key: key.trim() }, null, 2), 'utf8');
    initSupabase();

    if (isSupabaseActive) {
      return { success: true, message: 'เชื่อมต่อ Supabase สำเร็จแล้ว' };
    } else {
      return { success: false, message: 'ไม่สามารถเชื่อมต่อ Supabase ด้วยข้อมูลที่ระบุได้ กรุณาตรวจสอบ URL และ Key' };
    }
  },

  // โอนย้ายข้อมูลจาก SQLite ขึ้น Supabase
  async syncToSupabase() {
    if (!isSupabaseActive) throw new Error('Supabase ยังไม่ได้เชื่อมต่อ');

    return new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM assets ORDER BY id ASC', [], async (err, assets) => {
        if (err) return reject(err);
        sqliteDb.all('SELECT * FROM materials ORDER BY id ASC', [], async (err2, materials) => {
          if (err2) return reject(err2);

          try {
            // ล้างข้อมูลเดิมใน Supabase แล้วใส่ใหม่
            await supabaseClient.from('assets').delete().neq('id', 0);
            await supabaseClient.from('materials').delete().neq('id', 0);

            if (assets && assets.length > 0) {
              const cleanAssets = assets.map(a => {
                const copy = { ...a };
                delete copy.id; // ให้ Supabase สร้าง ID ใหม่เพื่อความถูกต้อง
                return copy;
              });
              const { error: aErr } = await supabaseClient.from('assets').insert(cleanAssets);
              if (aErr) throw aErr;
            }

            if (materials && materials.length > 0) {
              const cleanMaterials = materials.map(m => {
                const copy = { ...m };
                delete copy.id;
                return copy;
              });
              const { error: mErr } = await supabaseClient.from('materials').insert(cleanMaterials);
              if (mErr) throw mErr;
            }

            resolve({
              success: true,
              message: `ซิงค์ข้อมูลขึ้น Supabase สำเร็จ: ครุภัณฑ์ ${assets.length} รายการ, วัสดุ ${materials.length} รายการ`
            });
          } catch (e) {
            reject(e);
          }
        });
      });
    });
  },

  // === Authentication ===
  async checkPassword(pass) {
    const inputHash = hashPassword(pass);
    const storedHash = await this.getSetting('admin_password_hash');
    const targetHash = storedHash || hashPassword(DEFAULT_PASS);
    return inputHash === targetHash;
  },

  async setPassword(newPass) {
    const hash = hashPassword(newPass);
    await this.setSetting('admin_password_hash', hash);
    return true;
  },

  async getAdminHash() {
    const storedHash = await this.getSetting('admin_password_hash');
    return storedHash || hashPassword(DEFAULT_PASS);
  },

  async createSession() {
    const timestamp = Date.now().toString();
    const adminHash = await this.getAdminHash();
    const signature = crypto.createHmac('sha256', adminHash).update(timestamp).digest('hex');
    const token = `${timestamp}.${signature}`;
    activeSessions.add(token);
    return token;
  },

  async verifySession(token) {
    if (!token || typeof token !== 'string') return false;
    if (revokedSessions.has(token)) return false;

    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [timeStr, signature] = parts;
    const timestamp = parseInt(timeStr, 10);
    if (isNaN(timestamp)) return false;

    // Token อายุใช้งาน 30 วัน
    const maxAge = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - timestamp > maxAge || timestamp > Date.now() + 60000) return false;

    const adminHash = await this.getAdminHash();
    const expectedSig = crypto.createHmac('sha256', adminHash).update(timeStr).digest('hex');
    return signature === expectedSig;
  },

  removeSession(token) {
    if (token) {
      activeSessions.delete(token);
      revokedSessions.add(token);
    }
  },

  // === Settings ===
  async getSetting(key) {
    if (isSupabaseActive) {
      try {
        const { data, error } = await supabaseClient.from('system_settings').select('value').eq('key', key).single();
        if (!error && data) return data.value;
      } catch (e) {}
    }
    return new Promise((resolve) => {
      sqliteDb.get('SELECT value FROM system_settings WHERE key = ?', [key], (err, row) => {
        resolve(row ? row.value : null);
      });
    });
  },

  async setSetting(key, value) {
    if (isSupabaseActive) {
      try {
        await supabaseClient.from('system_settings').upsert({ key, value });
      } catch (e) {}
    }
    return new Promise((resolve, reject) => {
      sqliteDb.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [key, value], (err) => {
        if (err) return reject(err);
        resolve(true);
      });
    });
  },

  // === ASSETS ===
  async getAssets() {
    if (isSupabaseActive) {
      const { data, error } = await supabaseClient.from('assets').select('*').order('id', { ascending: true });
      if (!error && Array.isArray(data)) return data;
      console.warn('Supabase getAssets error, falling back to SQLite:', error?.message);
    }
    return new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM assets ORDER BY id ASC', [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  },

  async createAsset(item) {
    const cleanItem = {
      asset_code: item.asset_code || '',
      received_date: item.received_date || '',
      asset_name: item.asset_name || '',
      spec: item.spec || '',
      doc_no: item.doc_no || '',
      cost: Number(item.cost) || 0,
      useful_life: Number(item.useful_life) || 5,
      location: item.location || '',
      status: item.status || 'ใช้งานได้ดี',
      vendor: item.vendor || '',
      responsible_person: item.responsible_person || '',
      department: item.department || null,
      remark: item.remark || '',
      category: item.category || 'ครุภัณฑ์คอมพิวเตอร์',
      model: item.model || '',
      qty: Number(item.qty) || 1,
      vendor_address: item.vendor_address || '',
      vendor_phone: item.vendor_phone || '',
      budget_source: item.budget_source || 'เงินงบประมาณ',
      acquisition_method: item.acquisition_method || 'เฉพาะเจาะจง'
    };

    if (isSupabaseActive) {
      const { data, error } = await supabaseClient.from('assets').insert([cleanItem]).select().single();
      if (!error && data) {
        this.backupLocal();
        return data.id;
      }
      console.warn('Supabase createAsset error, falling back to SQLite:', error?.message);
    }

    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO assets (
        asset_code, received_date, asset_name, spec, doc_no, cost, useful_life,
        location, status, vendor, responsible_person, department, remark,
        category, model, qty, vendor_address, vendor_phone, budget_source, acquisition_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      const params = [
        cleanItem.asset_code, cleanItem.received_date, cleanItem.asset_name, cleanItem.spec, cleanItem.doc_no,
        cleanItem.cost, cleanItem.useful_life, cleanItem.location, cleanItem.status, cleanItem.vendor,
        cleanItem.responsible_person, cleanItem.department, cleanItem.remark, cleanItem.category, cleanItem.model,
        cleanItem.qty, cleanItem.vendor_address, cleanItem.vendor_phone, cleanItem.budget_source, cleanItem.acquisition_method
      ];
      sqliteDb.run(sql, params, function(err) {
        if (err) return reject(err);
        dbService.backupLocal();
        resolve(this.lastID);
      });
    });
  },

  async updateAsset(id, item) {
    const cleanItem = {
      asset_code: item.asset_code || '',
      received_date: item.received_date || '',
      asset_name: item.asset_name || '',
      spec: item.spec || '',
      doc_no: item.doc_no || '',
      cost: Number(item.cost) || 0,
      useful_life: Number(item.useful_life) || 5,
      location: item.location || '',
      status: item.status || 'ใช้งานได้ดี',
      vendor: item.vendor || '',
      responsible_person: item.responsible_person || '',
      department: item.department || null,
      remark: item.remark || '',
      category: item.category || 'ครุภัณฑ์คอมพิวเตอร์',
      model: item.model || '',
      qty: Number(item.qty) || 1,
      vendor_address: item.vendor_address || '',
      vendor_phone: item.vendor_phone || '',
      budget_source: item.budget_source || 'เงินงบประมาณ',
      acquisition_method: item.acquisition_method || 'เฉพาะเจาะจง'
    };

    if (isSupabaseActive) {
      const { error } = await supabaseClient.from('assets').update(cleanItem).eq('id', id);
      if (!error) {
        this.backupLocal();
        return true;
      }
      console.warn('Supabase updateAsset error, falling back to SQLite:', error?.message);
    }

    return new Promise((resolve, reject) => {
      const sql = `UPDATE assets SET 
        asset_code = ?, received_date = ?, asset_name = ?, spec = ?, doc_no = ?, cost = ?, useful_life = ?,
        location = ?, status = ?, vendor = ?, responsible_person = ?, department = ?, remark = ?,
        category = ?, model = ?, qty = ?, vendor_address = ?, vendor_phone = ?, budget_source = ?, acquisition_method = ?
        WHERE id = ?`;
      const params = [
        cleanItem.asset_code, cleanItem.received_date, cleanItem.asset_name, cleanItem.spec, cleanItem.doc_no,
        cleanItem.cost, cleanItem.useful_life, cleanItem.location, cleanItem.status, cleanItem.vendor,
        cleanItem.responsible_person, cleanItem.department, cleanItem.remark, cleanItem.category, cleanItem.model,
        cleanItem.qty, cleanItem.vendor_address, cleanItem.vendor_phone, cleanItem.budget_source, cleanItem.acquisition_method,
        id
      ];
      sqliteDb.run(sql, params, function(err) {
        if (err) return reject(err);
        dbService.backupLocal();
        resolve(this.changes > 0);
      });
    });
  },

  async deleteAsset(id) {
    if (isSupabaseActive) {
      const { error } = await supabaseClient.from('assets').delete().eq('id', id);
      if (!error) {
        this.backupLocal();
        return true;
      }
      console.warn('Supabase deleteAsset error, falling back to SQLite:', error?.message);
    }

    return new Promise((resolve, reject) => {
      sqliteDb.run('DELETE FROM assets WHERE id = ?', [id], function(err) {
        if (err) return reject(err);
        dbService.backupLocal();
        resolve(this.changes > 0);
      });
    });
  },

  // === MATERIALS ===
  async getMaterials() {
    if (isSupabaseActive) {
      const { data, error } = await supabaseClient.from('materials').select('*').order('id', { ascending: true });
      if (!error && Array.isArray(data)) return data;
      console.warn('Supabase getMaterials error, falling back to SQLite:', error?.message);
    }
    return new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM materials ORDER BY id ASC', [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  },

  async createMaterial(item) {
    const cleanItem = {
      trans_date: item.trans_date || '',
      material_code: item.material_code || '',
      material_name: item.material_name || '',
      size_spec: item.size_spec || '',
      unit: item.unit || '',
      party: item.party || '',
      doc_no: item.doc_no || '',
      budget_type: item.budget_type || '',
      opening_stock: Number(item.opening_stock) || 0,
      qty_in: Number(item.qty_in) || 0,
      qty_out: Number(item.qty_out) || 0,
      unit_price: Number(item.unit_price) || 0,
      remark: item.remark || ''
    };

    if (isSupabaseActive) {
      const { data, error } = await supabaseClient.from('materials').insert([cleanItem]).select().single();
      if (!error && data) {
        this.backupLocal();
        return data.id;
      }
      console.warn('Supabase createMaterial error, falling back to SQLite:', error?.message);
    }

    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO materials (trans_date, material_code, material_name, size_spec, unit, party, doc_no, budget_type, opening_stock, qty_in, qty_out, unit_price, remark)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      const params = [
        cleanItem.trans_date, cleanItem.material_code, cleanItem.material_name, cleanItem.size_spec, cleanItem.unit,
        cleanItem.party, cleanItem.doc_no, cleanItem.budget_type, cleanItem.opening_stock, cleanItem.qty_in,
        cleanItem.qty_out, cleanItem.unit_price, cleanItem.remark
      ];
      sqliteDb.run(sql, params, function(err) {
        if (err) return reject(err);
        dbService.backupLocal();
        resolve(this.lastID);
      });
    });
  },

  async updateMaterial(id, item) {
    const cleanItem = {
      trans_date: item.trans_date || '',
      material_code: item.material_code || '',
      material_name: item.material_name || '',
      size_spec: item.size_spec || '',
      unit: item.unit || '',
      party: item.party || '',
      doc_no: item.doc_no || '',
      budget_type: item.budget_type || '',
      opening_stock: Number(item.opening_stock) || 0,
      qty_in: Number(item.qty_in) || 0,
      qty_out: Number(item.qty_out) || 0,
      unit_price: Number(item.unit_price) || 0,
      remark: item.remark || ''
    };

    if (isSupabaseActive) {
      const { error } = await supabaseClient.from('materials').update(cleanItem).eq('id', id);
      if (!error) {
        this.backupLocal();
        return true;
      }
      console.warn('Supabase updateMaterial error, falling back to SQLite:', error?.message);
    }

    return new Promise((resolve, reject) => {
      const sql = `UPDATE materials SET trans_date = ?, material_code = ?, material_name = ?, size_spec = ?, unit = ?, party = ?, doc_no = ?, budget_type = ?, opening_stock = ?, qty_in = ?, qty_out = ?, unit_price = ?, remark = ? WHERE id = ?`;
      const params = [
        cleanItem.trans_date, cleanItem.material_code, cleanItem.material_name, cleanItem.size_spec, cleanItem.unit,
        cleanItem.party, cleanItem.doc_no, cleanItem.budget_type, cleanItem.opening_stock, cleanItem.qty_in,
        cleanItem.qty_out, cleanItem.unit_price, cleanItem.remark, id
      ];
      sqliteDb.run(sql, params, function(err) {
        if (err) return reject(err);
        dbService.backupLocal();
        resolve(this.changes > 0);
      });
    });
  },

  async deleteMaterial(id) {
    if (isSupabaseActive) {
      const { error } = await supabaseClient.from('materials').delete().eq('id', id);
      if (!error) {
        this.backupLocal();
        return true;
      }
      console.warn('Supabase deleteMaterial error, falling back to SQLite:', error?.message);
    }

    return new Promise((resolve, reject) => {
      sqliteDb.run('DELETE FROM materials WHERE id = ?', [id], function(err) {
        if (err) return reject(err);
        dbService.backupLocal();
        resolve(this.changes > 0);
      });
    });
  },

  // === Backup & Restore ===
  async backupAll() {
    const assets = await this.getAssets();
    const materials = await this.getMaterials();
    return {
      export_date: new Date().toISOString(),
      storage_type: isSupabaseActive ? 'supabase' : 'sqlite',
      assets,
      materials
    };
  },

  async restoreAll(data) {
    const assets = Array.isArray(data.assets) ? data.assets : [];
    const materials = Array.isArray(data.materials) ? data.materials : [];

    if (isSupabaseActive) {
      await supabaseClient.from('assets').delete().neq('id', 0);
      await supabaseClient.from('materials').delete().neq('id', 0);
      if (assets.length > 0) {
        const cleanA = assets.map(a => { const c = { ...a }; delete c.id; return c; });
        await supabaseClient.from('assets').insert(cleanA);
      }
      if (materials.length > 0) {
        const cleanM = materials.map(m => { const c = { ...m }; delete c.id; return c; });
        await supabaseClient.from('materials').insert(cleanM);
      }
    }

    return new Promise((resolve, reject) => {
      sqliteDb.serialize(() => {
        sqliteDb.run('DELETE FROM assets');
        sqliteDb.run('DELETE FROM materials');

        const aStmt = sqliteDb.prepare(`INSERT INTO assets (
          asset_code, received_date, asset_name, spec, doc_no, cost, useful_life,
          location, status, vendor, responsible_person, department, remark,
          category, model, qty, vendor_address, vendor_phone, budget_source, acquisition_method
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

        assets.forEach(d => {
          aStmt.run([
            d.asset_code, d.received_date, d.asset_name, d.spec, d.doc_no, Number(d.cost) || 0, Number(d.useful_life) || 5,
            d.location, d.status || 'ใช้งานได้ดี', d.vendor, d.responsible_person, d.department, d.remark,
            d.category, d.model, Number(d.qty) || 1, d.vendor_address, d.vendor_phone, d.budget_source, d.acquisition_method
          ]);
        });
        aStmt.finalize();

        const mStmt = sqliteDb.prepare(`INSERT INTO materials (trans_date, material_code, material_name, size_spec, unit, party, doc_no, budget_type, opening_stock, qty_in, qty_out, unit_price, remark)
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        materials.forEach(d => {
          mStmt.run([
            d.trans_date, d.material_code, d.material_name, d.size_spec, d.unit, d.party, d.doc_no, d.budget_type,
            Number(d.opening_stock) || 0, Number(d.qty_in) || 0, Number(d.qty_out) || 0, Number(d.unit_price) || 0, d.remark
          ]);
        });
        mStmt.finalize(err => {
          if (err) return reject(err);
          saveLocalBackup(assets, materials);
          resolve(true);
        });
      });
    });
  },

  async backupLocal() {
    try {
      const assets = await this.getAssets();
      const materials = await this.getMaterials();
      saveLocalBackup(assets, materials);
    } catch (e) {}
  }
};

module.exports = dbService;
