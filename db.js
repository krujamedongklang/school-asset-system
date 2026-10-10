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

  sqliteDb.run(`CREATE TABLE IF NOT EXISTS app_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    position TEXT DEFAULT '',
    role TEXT DEFAULT 'user',
    can_edit INTEGER DEFAULT 0,
    can_delete INTEGER DEFAULT 0,
    can_add INTEGER DEFAULT 1,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (!err) {
      seedAdminUser();
    }
  });
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
const JWT_SECRET = 'dongklang_jwt_secret_token_2026_salt';

function hashPassword(pass) {
  return crypto.createHash('sha256').update(pass + SALT).digest('hex');
}

function seedAdminUser() {
  sqliteDb.get(`SELECT COUNT(*) as count FROM app_users`, (err, row) => {
    if (!err && row && row.count === 0) {
      sqliteDb.get(`SELECT value FROM system_settings WHERE key = 'admin_password_hash'`, (sErr, sRow) => {
        const hash = (sRow && sRow.value) ? sRow.value : hashPassword(DEFAULT_PASS);
        sqliteDb.run(`INSERT INTO app_users (username, password_hash, full_name, position, role, can_edit, can_delete, can_add, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ['admin', hash, 'ผู้ดูแลระบบ (แอดมิน)', 'ผู้ดูแลระบบพัสดุ', 'admin', 1, 1, 1, 'active'],
          function(insErr) {
            if (!insErr) {
              console.log('👑 เริ่มต้นสร้างบัญชีผู้ดูแลระบบ (admin) สำเร็จ');
            }
          }
        );
      });
    }
  });
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

  // === Helper ตรวจสอบตาราง app_users บน Supabase ===
  async checkSupabaseUsersTable() {
    if (!supabaseClient || !isSupabaseActive) return false;
    try {
      const { error } = await supabaseClient.from('app_users').select('id').limit(1);
      return !error;
    } catch (e) {
      return false;
    }
  },

  // === Multi-User & RBAC Database Operations ===
  async getUsers() {
    const hasSb = await this.checkSupabaseUsersTable();
    if (hasSb) {
      try {
        const { data, error } = await supabaseClient
          .from('app_users')
          .select('id, username, full_name, position, role, can_edit, can_delete, can_add, status, created_at, updated_at')
          .order('id', { ascending: true });
        if (!error && Array.isArray(data)) {
          return data.map(u => ({
            ...u,
            can_edit: Number(u.can_edit) === 1 || u.can_edit === true ? 1 : 0,
            can_delete: Number(u.can_delete) === 1 || u.can_delete === true ? 1 : 0,
            can_add: Number(u.can_add) === 1 || u.can_add === true ? 1 : 0,
          }));
        }
      } catch (e) {
        console.warn('Supabase getUsers failed, fallback to SQLite:', e.message);
      }
    }

    return new Promise((resolve) => {
      sqliteDb.all(`SELECT id, username, full_name, position, role, can_edit, can_delete, can_add, status, created_at, updated_at
        FROM app_users ORDER BY id ASC`, [], (err, rows) => {
        resolve(rows || []);
      });
    });
  },

  async getUserById(id) {
    if (!id) return null;
    const hasSb = await this.checkSupabaseUsersTable();
    if (hasSb) {
      try {
        const { data, error } = await supabaseClient
          .from('app_users')
          .select('*')
          .eq('id', id)
          .single();
        if (!error && data) {
          return {
            ...data,
            can_edit: Number(data.can_edit) === 1 || data.can_edit === true ? 1 : 0,
            can_delete: Number(data.can_delete) === 1 || data.can_delete === true ? 1 : 0,
            can_add: Number(data.can_add) === 1 || data.can_add === true ? 1 : 0,
          };
        }
      } catch (e) {}
    }

    return new Promise((resolve) => {
      sqliteDb.get(`SELECT * FROM app_users WHERE id = ?`, [id], (err, row) => {
        resolve(row || null);
      });
    });
  },

  async getUserByUsername(username) {
    if (!username) return null;
    const cleanUsername = username.trim().toLowerCase();
    const hasSb = await this.checkSupabaseUsersTable();
    if (hasSb) {
      try {
        const { data, error } = await supabaseClient
          .from('app_users')
          .select('*')
          .ilike('username', cleanUsername)
          .single();
        if (!error && data) {
          return {
            ...data,
            can_edit: Number(data.can_edit) === 1 || data.can_edit === true ? 1 : 0,
            can_delete: Number(data.can_delete) === 1 || data.can_delete === true ? 1 : 0,
            can_add: Number(data.can_add) === 1 || data.can_add === true ? 1 : 0,
          };
        }
      } catch (e) {}
    }

    return new Promise((resolve) => {
      sqliteDb.get(`SELECT * FROM app_users WHERE LOWER(username) = ?`, [cleanUsername], (err, row) => {
        resolve(row || null);
      });
    });
  },

  async createUser(u) {
    const username = (u.username || '').trim().toLowerCase();
    const password_hash = u.password_hash;
    const full_name = (u.full_name || '').trim();
    const position = (u.position || '').trim();
    const role = u.role || 'user';
    const can_edit = u.can_edit ? 1 : 0;
    const can_delete = u.can_delete ? 1 : 0;
    const can_add = u.can_add !== undefined ? (u.can_add ? 1 : 0) : 1;
    const status = u.status || 'pending';

    const localId = await new Promise((resolve, reject) => {
      sqliteDb.run(`INSERT INTO app_users (username, password_hash, full_name, position, role, can_edit, can_delete, can_add, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [username, password_hash, full_name, position, role, can_edit, can_delete, can_add, status],
        function(err) {
          if (err) return reject(err);
          resolve(this.lastID);
        }
      );
    });

    const hasSb = await this.checkSupabaseUsersTable();
    if (hasSb) {
      try {
        await supabaseClient.from('app_users').insert([{
          username,
          password_hash,
          full_name,
          position,
          role,
          can_edit: can_edit === 1,
          can_delete: can_delete === 1,
          can_add: can_add === 1,
          status
        }]);
      } catch (e) {
        console.warn('Supabase createUser warning:', e.message);
      }
    } else {
      this.backupUsersToSettings().catch(() => {});
    }

    return { id: localId, username, full_name, position, role, can_edit, can_delete, can_add, status };
  },

  async registerUser({ username, password, fullName, position }) {
    const uName = (username || '').trim().toLowerCase();
    const pass = (password || '').trim();
    const name = (fullName || '').trim();
    const pos = (position || '').trim();

    if (!uName) throw new Error('กรุณาระบุชื่อผู้ใช้งาน');
    if (uName.length < 3) throw new Error('ชื่อผู้ใช้งานต้องมีความยาวอย่างน้อย 3 ตัวอักษร');
    if (!pass) throw new Error('กรุณาระบุรหัสผ่าน');
    if (pass.length < 4) throw new Error('รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร');
    if (!name) throw new Error('กรุณาระบุชื่อ-นามสกุล');

    const existing = await this.getUserByUsername(uName);
    if (existing) {
      throw new Error(`ชื่อผู้ใช้งาน "${uName}" ถูกใช้งานแล้ว กรุณาเลือกชื่ออื่น`);
    }

    const hash = hashPassword(pass);
    const newUser = await this.createUser({
      username: uName,
      password_hash: hash,
      full_name: name,
      position: pos,
      role: 'user',
      can_edit: 0,
      can_delete: 0,
      can_add: 1,
      status: 'pending'
    });

    return newUser;
  },

  async updateUserPermissions(id, { canEdit, canDelete, canAdd, role, status }) {
    const user = await this.getUserById(id);
    if (!user) throw new Error('ไม่พบข้อมูลผู้ใช้งาน');

    const isAdmin = user.username === 'admin';
    const newRole = isAdmin ? 'admin' : (role !== undefined ? role : user.role);
    const newStatus = isAdmin ? 'active' : (status !== undefined ? status : user.status);
    const newEdit = isAdmin ? 1 : (canEdit !== undefined ? (canEdit ? 1 : 0) : user.can_edit);
    const newDelete = isAdmin ? 1 : (canDelete !== undefined ? (canDelete ? 1 : 0) : user.can_delete);
    const newAdd = isAdmin ? 1 : (canAdd !== undefined ? (canAdd ? 1 : 0) : user.can_add);

    await new Promise((resolve, reject) => {
      sqliteDb.run(`UPDATE app_users SET role = ?, status = ?, can_edit = ?, can_delete = ?, can_add = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [newRole, newStatus, newEdit, newDelete, newAdd, id],
        (err) => err ? reject(err) : resolve(true)
      );
    });

    const hasSb = await this.checkSupabaseUsersTable();
    if (hasSb) {
      try {
        await supabaseClient.from('app_users').update({
          role: newRole,
          status: newStatus,
          can_edit: newEdit === 1,
          can_delete: newDelete === 1,
          can_add: newAdd === 1,
          updated_at: new Date().toISOString()
        }).eq('username', user.username);
      } catch (e) {}
    } else {
      this.backupUsersToSettings().catch(() => {});
    }

    return true;
  },

  async updateUserPassword(id, newPass) {
    const user = await this.getUserById(id);
    if (!user) throw new Error('ไม่พบข้อมูลผู้ใช้งาน');
    if (!newPass || newPass.length < 4) throw new Error('รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร');

    const hash = hashPassword(newPass);

    await new Promise((resolve, reject) => {
      sqliteDb.run(`UPDATE app_users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [hash, id],
        (err) => err ? reject(err) : resolve(true)
      );
    });

    if (user.username === 'admin') {
      await this.setSetting('admin_password_hash', hash);
    }

    const hasSb = await this.checkSupabaseUsersTable();
    if (hasSb) {
      try {
        await supabaseClient.from('app_users').update({
          password_hash: hash,
          updated_at: new Date().toISOString()
        }).eq('username', user.username);
      } catch (e) {}
    } else {
      this.backupUsersToSettings().catch(() => {});
    }

    return true;
  },

  async deleteUser(id) {
    const user = await this.getUserById(id);
    if (!user) throw new Error('ไม่พบข้อมูลผู้ใช้งาน');
    if (user.username === 'admin') throw new Error('ไม่สามารถลบบัญชีผู้ดูแลระบบหลัก (admin) ได้');

    await new Promise((resolve, reject) => {
      sqliteDb.run(`DELETE FROM app_users WHERE id = ?`, [id], (err) => err ? reject(err) : resolve(true));
    });

    const hasSb = await this.checkSupabaseUsersTable();
    if (hasSb) {
      try {
        await supabaseClient.from('app_users').delete().eq('username', user.username);
      } catch (e) {}
    } else {
      this.backupUsersToSettings().catch(() => {});
    }

    return true;
  },

  async backupUsersToSettings() {
    try {
      const users = await new Promise((resolve) => {
        sqliteDb.all(`SELECT id, username, password_hash, full_name, position, role, can_edit, can_delete, can_add, status, created_at FROM app_users`, [], (err, rows) => {
          resolve(rows || []);
        });
      });
      await this.setSetting('app_users_backup', JSON.stringify(users));
    } catch (e) {}
  },

  async syncUsersToSupabaseTable() {
    if (!supabaseClient || !isSupabaseActive) {
      throw new Error('ยังไม่ได้เชื่อมต่อ Supabase');
    }
    const hasTable = await this.checkSupabaseUsersTable();
    if (!hasTable) {
      throw new Error('ไม่พบตาราง app_users บน Supabase กรุณารันคำสั่ง SQL สร้างตารางใน Supabase SQL Editor ก่อนครับ');
    }

    const users = await new Promise((resolve) => {
      sqliteDb.all(`SELECT * FROM app_users`, [], (err, rows) => resolve(rows || []));
    });

    for (const u of users) {
      await supabaseClient.from('app_users').upsert({
        username: u.username,
        password_hash: u.password_hash,
        full_name: u.full_name,
        position: u.position || '',
        role: u.role || 'user',
        can_edit: Number(u.can_edit) === 1,
        can_delete: Number(u.can_delete) === 1,
        can_add: Number(u.can_add) === 1,
        status: u.status || 'pending'
      }, { onConflict: 'username' });
    }

    return { success: true, count: users.length };
  },

  // === Authentication & Sessions ===
  async checkPassword(pass) {
    const inputHash = hashPassword(pass);
    const storedHash = await this.getSetting('admin_password_hash');
    const targetHash = storedHash || hashPassword(DEFAULT_PASS);
    return inputHash === targetHash;
  },

  async setPassword(newPass) {
    const hash = hashPassword(newPass);
    await this.setSetting('admin_password_hash', hash);
    const admin = await this.getUserByUsername('admin');
    if (admin) {
      await new Promise((resolve) => {
        sqliteDb.run(`UPDATE app_users SET password_hash = ? WHERE username = 'admin'`, [hash], () => resolve(true));
      });
    }
    return true;
  },

  async getAdminHash() {
    const storedHash = await this.getSetting('admin_password_hash');
    return storedHash || hashPassword(DEFAULT_PASS);
  },

  async loginUser(username, password) {
    const uName = (username || '').trim().toLowerCase();
    const pass = (password || '').trim();
    if (!pass) return { success: false, error: 'กรุณากรอกรหัสผ่าน' };

    const targetUsername = uName || 'admin';
    let user = await this.getUserByUsername(targetUsername);

    if (!user) {
      if (targetUsername === 'admin') {
        const isValid = await this.checkPassword(pass);
        if (isValid) {
          seedAdminUser();
          user = await this.getUserByUsername('admin');
        }
      }
      if (!user) {
        return { success: false, error: 'ไม่พบชื่อผู้ใช้งานนี้ในระบบ' };
      }
    }

    const inputHash = hashPassword(pass);
    if (user.password_hash !== inputHash) {
      if (user.username === 'admin') {
        const isLegacyValid = await this.checkPassword(pass);
        if (isLegacyValid) {
          await this.updateUserPassword(user.id, pass);
        } else {
          return { success: false, error: 'รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง' };
        }
      } else {
        return { success: false, error: 'รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง' };
      }
    }

    if (user.status === 'pending') {
      return { success: false, error: 'บัญชีของคุณอยู่ระหว่างรอผู้ดูแลระบบอนุมัติ กรุณาติดต่อคุณครูผู้ดูแลระบบเพื่อเปิดสิทธิ์การใช้งาน' };
    }

    if (user.status === 'rejected' || user.status === 'blocked') {
      return { success: false, error: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ' };
    }

    const token = this.createSession(user);
    return {
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        position: user.position || '',
        role: user.role,
        canEdit: user.role === 'admin' ? true : (Number(user.can_edit) === 1),
        canDelete: user.role === 'admin' ? true : (Number(user.can_delete) === 1),
        canAdd: user.role === 'admin' ? true : (Number(user.can_add) === 1),
        status: user.status
      }
    };
  },

  createSession(user = null) {
    if (!user) {
      user = {
        id: 1,
        username: 'admin',
        full_name: 'ผู้ดูแลระบบ (แอดมิน)',
        position: 'ผู้ดูแลระบบ',
        role: 'admin',
        can_edit: 1,
        can_delete: 1,
        can_add: 1
      };
    }
    const payload = {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      position: user.position || '',
      role: user.role || 'user',
      canEdit: user.role === 'admin' ? true : (Number(user.can_edit) === 1),
      canDelete: user.role === 'admin' ? true : (Number(user.can_delete) === 1),
      canAdd: user.role === 'admin' ? true : (Number(user.can_add) === 1),
      iat: Date.now()
    };
    const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', JWT_SECRET).update(payloadStr).digest('base64url');
    const token = `${payloadStr}.${sig}`;
    activeSessions.add(token);
    return token;
  },

  async verifySession(token) {
    if (!token || typeof token !== 'string') return null;
    if (revokedSessions.has(token)) return null;

    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadStr, sig] = parts;

    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(payloadStr).digest('base64url');
    if (sig === expectedSig) {
      try {
        const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
        const maxAge = 30 * 24 * 60 * 60 * 1000;
        if (Date.now() - payload.iat > maxAge) return null;

        const user = await this.getUserById(payload.id);
        if (!user || user.status !== 'active') return null;

        return {
          id: user.id,
          username: user.username,
          fullName: user.full_name,
          position: user.position || '',
          role: user.role,
          canEdit: user.role === 'admin' ? true : (Number(user.can_edit) === 1),
          canDelete: user.role === 'admin' ? true : (Number(user.can_delete) === 1),
          canAdd: user.role === 'admin' ? true : (Number(user.can_add) === 1),
          status: user.status
        };
      } catch (e) {
        return null;
      }
    }

    const timeStr = payloadStr;
    const timestamp = parseInt(timeStr, 10);
    if (!isNaN(timestamp)) {
      const maxAge = 30 * 24 * 60 * 60 * 1000;
      if (Date.now() - timestamp <= maxAge && timestamp <= Date.now() + 60000) {
        const adminHash = await this.getAdminHash();
        const legacySig = crypto.createHmac('sha256', adminHash).update(timeStr).digest('hex');
        if (sig === legacySig) {
          const admin = await this.getUserByUsername('admin');
          if (admin && admin.status === 'active') {
            return {
              id: admin.id,
              username: admin.username,
              fullName: admin.full_name,
              position: admin.position || '',
              role: 'admin',
              canEdit: true,
              canDelete: true,
              canAdd: true,
              status: 'active'
            };
          }
        }
      }
    }

    return null;
  },

  removeSession(token) {
    if (token) {
      activeSessions.delete(token);
      revokedSessions.add(token);
    }
  },

  hashPassword(pass) {
    return hashPassword(pass);
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
