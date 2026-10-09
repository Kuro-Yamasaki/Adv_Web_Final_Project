# Backend — HW-5 ข้อ 2.1

API ลูกค้า: เพิ่ม ลบ แก้ไข และแสดงข้อมูลทั้งหมด ใช้ Node.js + TypeScript + Express + MySQL
ยังไม่รวมการค้นหา ออเดอร์ ระบบจัดเส้นทาง หรือหน้า Angular

## โครงสร้าง
- `server.ts`: เปิดเซิร์ฟเวอร์
- `app.ts`: CORS, JSON parser, Router และ Error handler
- `dbconnect.ts`: MySQL connection pool
- `controller/customer.ts`: API ลูกค้า
- `model/customer.ts`: Interface และตรวจข้อมูลรับเข้า
- `sql/01-customer.sql`: สร้างฐานข้อมูลและตาราง customer

## เริ่มใช้งาน
1. ติดตั้ง Node.js LTS และเตรียม MySQL ที่เข้าถึงได้
2. รันไฟล์ `sql/01-customer.sql` ใน MySQL (Workbench, phpMyAdmin หรือ CLI) ไม่ใช่ใน Terminal ของ Node.js หากบริการฐานข้อมูลสร้าง database ให้แล้วและไม่อนุญาต CREATE DATABASE ให้เลือก database นั้นแล้วรันเฉพาะ CREATE TABLE
3. เปิด Terminal ในโฟลเดอร์ `backend` แล้วรัน `npm install`
4. คัดลอก `.env.example` เป็น `.env` แล้วใส่ DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME ตามฐานข้อมูลของตัวเอง อย่าใส่รหัสผ่านใน GitHub
5. รัน `npm run dev`
6. เปิด `http://localhost:3000/` ได้ข้อความยืนยันว่า Express ทำงาน (ไม่ได้ยืนยันว่า MySQL เชื่อมสำเร็จ)
7. ทดสอบ `GET http://localhost:3000/customer` ถ้าตารางยังว่างควรได้ `[]` ถ้าได้ 500 ให้ตรวจฐานข้อมูลและค่า .env

## API
| Method | Path | การทำงาน | สำเร็จ |
| --- | --- | --- | --- |
| GET | /customer | แสดงลูกค้าทั้งหมด | 200 + JSON array |
| POST | /customer | เพิ่มลูกค้า | 201 + affected_row, last_idx |
| PUT | /customer/:id | แก้ไขลูกค้า (ต้องส่งครบ 5 ฟิลด์) | 200 |
| DELETE | /customer/:id | ลบลูกค้า | 200 |

ตัวอย่าง Body สำหรับ POST และ PUT (ข้อมูลสมมติ พิกัดใช้สำหรับทดสอบเท่านั้น):
```json
{
  "first_name": "ทดสอบ",
  "last_name": "ระบบ",
  "phone": "0000000000",
  "latitude": 16.246,
  "longitude": 103.25
}
```
เลือก Body แบบ JSON และตั้ง Content-Type: application/json ใน Postman
ใช้ `last_idx` จาก POST แทน :id ใน PUT / DELETE
- 400: ข้อมูลไม่ครบ ชนิดข้อมูลไม่ถูกต้อง หรือ id ไม่ถูกต้อง
- 404: ไม่พบลูกค้า / เส้นทาง
- 409: ลูกค้ามีข้อมูลอ้างอิงที่ทำให้ลบไม่ได้ (รองรับตอนเพิ่มตาราง orders)
- 500: ข้อผิดพลาดภายใน เช่น เชื่อมฐานข้อมูลไม่ได้

latitude ต้องอยู่ในช่วง -90 ถึง 90, longitude -180 ถึง 180 และส่งเป็น JSON number
ขั้นนี้ยังไม่บังคับพื้นที่ 3 กม. เพราะยังไม่ได้กำหนดพิกัดร้าน
API ชุดนี้เป็นงานฝึกที่ยังไม่มี authentication; อย่าใช้กับข้อมูลส่วนบุคคลจริงบนอินเทอร์เน็ต

## Build
```sh
npm run build
npm start
```

## สถานะการทดสอบในเครื่องผู้ช่วย
คอมไพล์และทดสอบ HTTP routes โดยจำลองผลตอบกลับของ MySQL เท่านั้น ไม่ได้ทดสอบกับ MySQL จริง
ต้องทดสอบ POST → GET → PUT → GET → DELETE → GET กับ MySQL ของผู้ใช้อีกครั้ง
