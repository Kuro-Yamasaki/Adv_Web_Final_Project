import express from "express";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { conn } from "../dbconnect";
import { Customer, CustomerInput, validateCustomer } from "../model/customer";

export const router = express.Router();
type CustomerRow = Customer & RowDataPacket;
const columns = "id, first_name, last_name, phone, latitude, longitude";
const fields = (body: CustomerInput) => [body.first_name.trim(), body.last_name.trim(), body.phone.trim(), body.latitude, body.longitude];

router.param("id", (req, res, next, id: string) => {
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) {
    res.status(400).json({ error: "id must be a positive integer" });
    return;
  }
  next();
});

// ค้นหาจากบางส่วนของชื่อหรือนามสกุล
// ตัวอย่าง: /customer/search?q=ทดสอบ
router.get("/search", async (req, res) => {
  const q = req.query.q;

  if (typeof q !== "string" || !q.trim()) {
    res.status(400).json({
      error: "Please provide a search keyword in q",
    });
    return;
  }

  const keyword = q.trim();

  if (keyword.length > 100) {
    res.status(400).json({
      error: "Search keyword must not exceed 100 characters",
    });
    return;
  }

  const [rows] = await conn.execute<CustomerRow[]>(
    `SELECT ${columns}
     FROM customer
     WHERE first_name LIKE ? OR last_name LIKE ?
     ORDER BY id`,
    [`%${keyword}%`, `%${keyword}%`]
  );

  res.json(rows);
});

// ค้นหาลูกค้าในรัศมี 1 กิโลเมตร
// /customer/nearby?latitude=16.246&longitude=103.25
router.get("/nearby", async (req, res) => {
  const latitudeInput = req.query.latitude;
  const longitudeInput = req.query.longitude;

  if (
    typeof latitudeInput !== "string" ||
    typeof longitudeInput !== "string" ||
    !latitudeInput.trim() ||
    !longitudeInput.trim()
  ) {
    res.status(400).json({
      error: "Please provide latitude and longitude",
    });
    return;
  }

  const latitude = Number(latitudeInput);
  const longitude = Number(longitudeInput);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    res.status(400).json({
      error: "Invalid latitude or longitude",
    });
    return;
  }

  // Haversine formula: ใช้รัศมีโลกประมาณ 6,371 กม.
  // จำกัดค่าภายใน SQRT ให้อยู่ระหว่าง 0–1
  // เพื่อป้องกันความคลาดเคลื่อนจากเลขทศนิยม
  const sql = `
    SELECT *
    FROM (
      SELECT
        ${columns},
        2 * 6371 * ASIN(
          SQRT(
            LEAST(1, GREATEST(0,
              POWER(SIN(RADIANS(latitude - ?) / 2), 2)
              + COS(RADIANS(?))
              * COS(RADIANS(latitude))
              * POWER(SIN(RADIANS(longitude - ?) / 2), 2)
            ))
          )
        ) AS distance_km
      FROM customer
    ) AS nearby_customers
    WHERE distance_km <= ?
    ORDER BY distance_km ASC, id ASC
  `;

  const [rows] = await conn.execute<RowDataPacket[]>(sql, [
    latitude,
    latitude,
    longitude,
    1,
  ]);

  res.json(rows);
});

router.get("/", async (_req, res) => {
  const [rows] = await conn.query<CustomerRow[]>(`SELECT ${columns} FROM customer ORDER BY id`);
  res.json(rows);
});

router.post("/", async (req, res) => {
  const error = validateCustomer(req.body);
  if (error) { res.status(400).json({ error }); return; }
  const [result] = await conn.execute<ResultSetHeader>(
    "INSERT INTO customer (first_name, last_name, phone, latitude, longitude) VALUES (?,?,?,?,?)", fields(req.body),
  );
  res.status(201).json({ affected_row: result.affectedRows, last_idx: result.insertId });
});

// PUT requires all five editable fields, matching the full-update lesson.
router.put("/:id", async (req, res) => {
  const error = validateCustomer(req.body);
  if (error) { res.status(400).json({ error }); return; }
  const id = Number(req.params.id);
  // Existence is checked separately so unchanged values do not become a false 404.
  const [rows] = await conn.execute<RowDataPacket[]>("SELECT id FROM customer WHERE id = ?", [id]);
  if (!rows.length) { res.status(404).json({ error: "Customer not found" }); return; }
  const [result] = await conn.execute<ResultSetHeader>(
    "UPDATE customer SET first_name=?, last_name=?, phone=?, latitude=?, longitude=? WHERE id=?", [...fields(req.body), id],
  );
  res.json({ message: "Customer updated", affected_row: result.affectedRows });
});

router.delete("/:id", async (req, res) => {
  const [result] = await conn.execute<ResultSetHeader>("DELETE FROM customer WHERE id = ?", [Number(req.params.id)]);
  if (!result.affectedRows) { res.status(404).json({ error: "Customer not found" }); return; }
  res.json({ affected_row: result.affectedRows });
});
