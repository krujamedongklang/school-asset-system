# ระบบบริหารจัดการพัสดุและครุภัณฑ์สถานศึกษา (เอกสารหมายเลข ๓)

ระบบเว็บแอพพลิเคชันสำหรับบันทึกทะเบียนคุมครุภัณฑ์และบัญชีคุมวัสดุ พร้อมระบบคำนวณค่าเสื่อมราคาและแบบฟอร์มสั่งพิมพ์ A4 แนวนอนตามระเบียบราชการ

---

## 🚀 วิธีการนำระบบขึ้น Cloud ฟรี (Render.com)

### ขั้นตอนที่ 1: สร้าง Repository บน GitHub
1. ไปที่เว็บไซต์ [GitHub](https://github.com) และเข้าสู่ระบบ
2. กดปุ่ม **New Repository** (ตั้งชื่อ เช่น `school-asset-system`)
3. เลือกระดับเป็น **Public** หรือ **Private** แล้วกด **Create repository**

### ขั้นตอนที่ 2: อัปโหลดโค้ดขึ้น GitHub
เปิด Terminal ที่โฟลเดอร์นี้ แล้วพิมพ์คำสั่งดังนี้ (เปลี่ยน `YOUR_USERNAME` เป็นชื่อบัญชี GitHub ของคุณ):

```bash
git remote add origin https://github.com/YOUR_USERNAME/school-asset-system.git
git push -u origin main
```

---

### ขั้นตอนที่ 3: Deploy ขึ้น Render.com (ฟรี 100%)
1. สมัคร/เข้าสู่ระบบที่ [Render.com](https://render.com) (เข้าสู่ระบบด้วยบัญชี GitHub ได้ทันที)
2. กดปุ่ม **New +** แล้วเลือก **Web Service**
3. เลือกเชื่อมต่อกับ Repository `school-asset-system` ที่เพิ่งสร้างไว้
4. ตั้งค่าดังนี้:
   - **Name:** `school-asset-system` (หรือชื่อตามต้องการ)
   - **Environment:** `Node`
   - **Region:** `Singapore` (ใกล้ไทย โหลดเร็ว)
   - **Branch:** `main`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** `Free`
5. กดปุ่ม **Deploy Web Service**

รอประมาณ 1–2 นาที Render จะสร้างลิงก์เว็บไซต์ให้คุณ เช่น:
`https://school-asset-system.onrender.com`

---

## 💾 ระบบสำรองและกู้คืนข้อมูล (Backup & Restore)
- บนแถบเมนูด้านบน มีปุ่ม **`📥 สำรองข้อมูล`** สำหรับดาวน์โหลดไฟล์ `.json` เก็บไว้ในคอมพิวเตอร์หรือ Google Drive
- หากต้องการกู้คืนข้อมูล สามารถกดปุ่ม **`📤 นำเข้าข้อมูล`** แล้วเลือกไฟล์สำรองเพื่อนำข้อมูลกลับมาได้ทันที
