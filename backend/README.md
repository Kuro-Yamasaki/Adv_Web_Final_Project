# Backend — ระบบจัดเส้นทางไรเดอร์ ส่งข้าวกล่องมื้อเที่ยง

Node.js + TypeScript + Express 5 + MySQL (Aiven) deploy บน Render

## โครงสร้าง
| ไฟล์ | หน้าที่ |
| --- | --- |
| `server.ts` | เปิดเซิร์ฟเวอร์ |
| `app.ts` | CORS, JSON parser, รวม Router, `GET /settings`, จัดการ error |
| `config.ts` | พิกัดร้าน (อ่านจาก `.env`), กฎตามโจทย์ (`RULES`), วันที่ตามเวลาไทย |
| `geo.ts` | คำนวณระยะทางแบบ Haversine |
| `dbconnect.ts` | MySQL connection pool (SSL) |
| `controller/customer.ts` | API ลูกค้า |
| `controller/order.ts` | API ออเดอร์ และจำลองออเดอร์ |
| `controller/plan.ts` | API แผนการส่ง ยืนยันแผน และใบงานไรเดอร์ |
| `service/routing.ts` | อัลกอริทึมจัดเส้นทาง (ไม่ยุ่งกับฐานข้อมูล) |
| `model/*.ts` | Interface และการตรวจข้อมูลรับเข้า |
| `sql/01–04-*.sql` | สร้างตาราง ต้องรันตามลำดับ |

## เริ่มใช้งาน
1. ติดตั้ง Node.js 22 ขึ้นไป
2. รัน `sql/01-customer.sql` → `02-orders.sql` → `03-orders-status.sql` → `04-delivery-plan.sql` ใน MySQL (ทำครั้งเดียวต่อฐานข้อมูล)
3. ในโฟลเดอร์ `backend` รัน `npm install`
4. คัดลอก `.env.example` เป็น `.env` แล้วใส่รหัสผ่านฐานข้อมูล ไฟล์ CA และพิกัดร้าน (`SHOP_LAT`, `SHOP_LNG`) **ห้าม commit `.env`**
5. `npm run dev` แล้วเปิด `http://localhost:3000/settings` ต้องเห็นพิกัดร้าน

`CORS_ORIGIN` ใส่ได้หลายเว็บ คั่นด้วยจุลภาค เช่น `http://localhost:4200,https://my-app.vercel.app` (ไม่ต้องมี `/` ท้าย)

บน Render ต้องตั้ง Environment ชุดเดียวกับ `.env` ถ้าไม่มี `SHOP_LAT` / `SHOP_LNG` เซิร์ฟเวอร์จะไม่ start

## กฎทางธุรกิจ (`config.ts`)
- ลูกค้าต้องอยู่ห่างร้านไม่เกิน 3 กม.
- ขายกล่องละ 65 บาท ต้นทุนอาหาร 40 บาท
- ค่าไรเดอร์ต่อรอบ = 15 + 2 × ระยะทางทั้งรอบ (กม.) × จำนวนกล่องในรอบ
- ไรเดอร์ 1 คนรับได้ไม่เกิน 3 ออเดอร์ วิ่ง 30 กม./ชม. ออกจากร้าน 11:30 ต้องถึงภายใน 12:30
- ระยะทางเป็นเส้นตรง (Haversine) นับจากร้านถึงจุดส่งสุดท้าย **ไม่นับขากลับร้าน**

## API
URL หลัก: `https://adv-web-api.onrender.com` (หรือ `http://localhost:3000`)
ส่ง Body เป็น JSON (`Content-Type: application/json`)

### ทั่วไป
| Method | Path | การทำงาน |
| --- | --- | --- |
| GET | `/settings` | พิกัดร้านและกฎทั้งหมด (frontend ใช้ตอนเปิดแอป) |

### ลูกค้า `/customer`
| Method | Path | การทำงาน |
| --- | --- | --- |
| GET | `/customer` | ลูกค้าทั้งหมด |
| GET | `/customer/search?q=คำค้น` | ค้นจากชื่อหรือนามสกุล |
| GET | `/customer/nearby?latitude=..&longitude=..` | ลูกค้าในรัศมี 1 กม. จากจุดที่กำหนด |
| POST | `/customer` | เพิ่มลูกค้า → 201 + `last_idx` |
| PUT | `/customer/:id` | แก้ไขลูกค้า (ส่งครบ 5 ฟิลด์) ออเดอร์ที่ยัง pending จะใช้พิกัดใหม่ด้วย |
| DELETE | `/customer/:id` | ลบลูกค้า (409 ถ้ามีออเดอร์อ้างอิง) |

Body ของ POST / PUT:
```json
{ "first_name": "ทดสอบ", "last_name": "ระบบ", "phone": "0000000000", "latitude": 16.246, "longitude": 103.25 }
```

### ออเดอร์ `/orders`
สถานะ: `pending` (รอจัด) → `assigned` (จัดให้ไรเดอร์แล้ว) → `delivered` (ส่งแล้ว)

| Method | Path | การทำงาน |
| --- | --- | --- |
| GET | `/orders?date=YYYY-MM-DD&status=pending` | รายการออเดอร์ กรองวันและสถานะได้ |
| GET | `/orders/nearby?latitude=..&longitude=..` | ออเดอร์ในรัศมี 2 กม. |
| POST | `/orders` | `{ "customer_id": 1, "box_quantity": 2 }` สั่งให้ส่งวันนี้ |
| POST | `/orders/simulate` | `{ "count": 25 }` จำลอง 20–30 ออเดอร์จากลูกค้าที่มี |
| PATCH | `/orders/:id` | `{ "box_quantity": 3 }` แก้จำนวนกล่อง (เฉพาะ pending) |
| DELETE | `/orders/:id` | ลบออเดอร์ (เฉพาะ pending) |
| DELETE | `/orders/simulated` | ลบออเดอร์จำลองทั้งหมด |

### แผนการส่ง `/plans`
| Method | Path | การทำงาน |
| --- | --- | --- |
| POST | `/plans` | คำนวณจากออเดอร์ pending ของวันนี้ แล้วบันทึกเป็นร่าง (ยืนยันรอบแรกแล้ว ออเดอร์ที่เข้ามาใหม่จะคำนวณเป็นรอบถัดไป) |
| GET | `/plans?date=YYYY-MM-DD` | รายการแผนของวันนั้น ใหม่สุดก่อน |
| GET | `/plans/:id` | แผนเต็ม |
| POST | `/plans/:id/confirm` | ยืนยันแผน ออเดอร์ในแผนเปลี่ยนเป็น assigned |
| DELETE | `/plans/:id` | ยกเลิกแผน ออเดอร์กลับเป็น pending แล้วคำนวณใหม่ได้ (409 ถ้ามีจุดที่ส่งแล้ว) |
| GET | `/plans/jobs/:jobCode` | ใบงานไรเดอร์ 1 คน (แต่ละจุดมี `status` ของออเดอร์) |
| POST | `/plans/jobs/:jobCode/stops/:orderId/delivered` | ไรเดอร์กดส่งแล้ว (เฉพาะแผนที่ยืนยันแล้ว) |

Body ของ `POST /plans` (ไม่ส่งก็ได้):
```json
{ "strategy": "min-cost", "variant": 0 }
```
- `strategy`: `min-cost` ค่าไรเดอร์ต่ำสุด, `min-distance` ระยะรวมสั้นสุด, `min-riders` ใช้ไรเดอร์น้อยสุด
- `variant`: 0–99 กด "คำนวณใหม่" ให้ส่งค่าเพิ่มขึ้นทีละ 1 จะได้แผนทางเลือก (variant เดิมได้ผลเดิมเสมอ)
- คำนวณใหม่จะแทนที่แผนร่างเดิมของวันนั้น เลขใบงานจะเปลี่ยนตาม

### รหัสผลลัพธ์
| รหัส | ความหมาย |
| --- | --- |
| 400 | ข้อมูลไม่ครบ ชนิดผิด ลูกค้าอยู่นอก 3 กม. หรือไม่มีออเดอร์ให้คำนวณ |
| 404 | ไม่พบข้อมูล |
| 409 | ทำไม่ได้ในสถานะนี้ เช่น แก้ออเดอร์ที่จัดให้ไรเดอร์แล้ว, ยืนยันแผนซ้ำ, ออเดอร์เปลี่ยนหลังคำนวณ (ต้องคำนวณใหม่) |
| 500 | ข้อผิดพลาดภายใน เช่น เชื่อมฐานข้อมูลไม่ได้ |

## ล้างข้อมูลทดสอบ
```sql
DELETE FROM delivery_plan;
UPDATE orders SET status = 'pending' WHERE status IN ('assigned', 'delivered');
COMMIT;
```

## Build
```sh
npm run build
npm start
```

API นี้เป็นงานในรายวิชา ยังไม่มีระบบยืนยันตัวตน อย่าใช้กับข้อมูลส่วนบุคคลจริง