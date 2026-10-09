import express from "express";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { conn } from "../dbconnect";
import { OrderPostRequest } from "../model/order";

export const router = express.Router();

// ค้นหาออเดอร์ในรัศมี 2 กิโลเมตร
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

  const sql = `
    SELECT *
    FROM (
      SELECT
        o.id,
        o.customer_id,
        c.first_name,
        c.last_name,
        c.phone,
        o.box_quantity,
        o.ordered_at,
        o.delivery_latitude,
        o.delivery_longitude,
        o.is_simulated,
        2 * 6371 * ASIN(
          SQRT(
            LEAST(1, GREATEST(0,
              POWER(
                SIN(RADIANS(o.delivery_latitude - ?) / 2),
                2
              )
              + COS(RADIANS(?))
              * COS(RADIANS(o.delivery_latitude))
              * POWER(
                SIN(RADIANS(o.delivery_longitude - ?) / 2),
                2
              )
            ))
          )
        ) AS distance_km
      FROM orders AS o
      INNER JOIN customer AS c
        ON o.customer_id = c.id
    ) AS nearby_orders
    WHERE distance_km <= ?
    ORDER BY distance_km ASC, id ASC
  `;

  const [rows] = await conn.execute<RowDataPacket[]>(sql, [
    latitude,
    latitude,
    longitude,
    2,
  ]);

  res.json(rows);
});

// แสดงออเดอร์ทั้งหมด พร้อมข้อมูลลูกค้าที่สั่ง
router.get("/", async (_req, res) => {
  const [rows] = await conn.query<RowDataPacket[]>(`
    SELECT
      o.id,
      o.customer_id,
      c.first_name,
      c.last_name,
      c.phone,
      o.box_quantity,
      o.ordered_at,
      o.delivery_latitude,
      o.delivery_longitude,
      o.is_simulated
    FROM orders AS o
    INNER JOIN customer AS c
      ON o.customer_id = c.id
    ORDER BY o.id DESC
  `);

  res.json(rows);
});

// เพิ่มออเดอร์
router.post("/", async (req, res) => {
  if (
    !req.body ||
    typeof req.body !== "object" ||
    Array.isArray(req.body)
  ) {
    res.status(400).json({
      error: "Body must be a JSON object",
    });
    return;
  }

  const { customer_id, box_quantity } =
    req.body as OrderPostRequest;

  if (
    !Number.isSafeInteger(customer_id) ||
    customer_id < 1
  ) {
    res.status(400).json({
      error: "customer_id must be a positive integer",
    });
    return;
  }

  if (
    !Number.isInteger(box_quantity) ||
    box_quantity < 1 ||
    box_quantity > 3
  ) {
    res.status(400).json({
      error: "box_quantity must be an integer between 1 and 3",
    });
    return;
  }

  // สร้างออเดอร์จากลูกค้าที่มีอยู่จริง
  // คัดลอกพิกัด และกำหนดว่าไม่ใช่ออเดอร์จำลอง
  const [result] = await conn.execute<ResultSetHeader>(
    `INSERT INTO orders (
      customer_id,
      box_quantity,
      delivery_latitude,
      delivery_longitude,
      is_simulated
    )
    SELECT id, ?, latitude, longitude, FALSE
    FROM customer
    WHERE id = ?`,
    [box_quantity, customer_id]
  );

  if (result.affectedRows === 0) {
    res.status(404).json({
      error: "Customer not found",
    });
    return;
  }

  res.status(201).json({
    affected_row: result.affectedRows,
    last_idx: result.insertId,
  });
});

// จำลองออเดอร์ 20–30 รายการจากลูกค้าที่มีอยู่
router.post("/simulate", async (req, res) => {
  const body = req.body ?? {};

  if (typeof body !== "object" || Array.isArray(body)) {
    res.status(400).json({
      error: "Body must be a JSON object",
    });
    return;
  }

  const count = body.count ?? 25;

  if (
    !Number.isInteger(count) ||
    count < 20 ||
    count > 30
  ) {
    res.status(400).json({
      error: "count must be an integer between 20 and 30",
    });
    return;
  }

  const connection = await conn.getConnection();

  try {
    await connection.beginTransaction();

    const [customers] = await connection.query<RowDataPacket[]>(
      `SELECT id, latitude, longitude
       FROM customer
       ORDER BY id`
    );

    if (customers.length === 0) {
      await connection.rollback();

      res.status(400).json({
        error: "Please add customers before simulating orders",
      });
      return;
    }

    // สลับลำดับลูกค้า แล้ววนใช้เพื่อกระจายออเดอร์
    const shuffledCustomers = [...customers];

    for (let i = shuffledCustomers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));

      [shuffledCustomers[i], shuffledCustomers[j]] =
        [shuffledCustomers[j], shuffledCustomers[i]];
    }

    const placeholders: string[] = [];
    const values: (number | string)[] = [];
    let totalBoxes = 0;

    for (let i = 0; i < count; i++) {
      const customer =
        shuffledCustomers[i % shuffledCustomers.length];

      const quantity = Math.floor(Math.random() * 3) + 1;

      placeholders.push("(?, ?, ?, ?, TRUE)");

      values.push(
        customer.id,
        quantity,
        customer.latitude,
        customer.longitude
      );

      totalBoxes += quantity;
    }

    const [result] =
      await connection.execute<ResultSetHeader>(
        `INSERT INTO orders (
          customer_id,
          box_quantity,
          delivery_latitude,
          delivery_longitude,
          is_simulated
        ) VALUES ${placeholders.join(", ")}`,
        values
      );

    await connection.commit();

    res.status(201).json({
      message: "Orders simulated",
      created_orders: result.affectedRows,
      total_boxes: totalBoxes,
      available_customers: customers.length,
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

// ตรวจ id สำหรับเส้นทางที่มี /:id
router.param("id", (_req, res, next, id: string) => {
  if (
    !/^\d+$/.test(id) ||
    !Number.isSafeInteger(Number(id)) ||
    Number(id) < 1
  ) {
    res.status(400).json({
      error: "id must be a positive integer",
    });
    return;
  }

  next();
});

// แก้ไขเฉพาะจำนวนกล่อง
router.patch("/:id", async (req, res) => {
  if (
    !req.body ||
    typeof req.body !== "object" ||
    Array.isArray(req.body)
  ) {
    res.status(400).json({
      error: "Body must be a JSON object",
    });
    return;
  }

  const box_quantity = req.body.box_quantity;

  if (
    !Number.isInteger(box_quantity) ||
    box_quantity < 1 ||
    box_quantity > 3
  ) {
    res.status(400).json({
      error: "box_quantity must be an integer between 1 and 3",
    });
    return;
  }

  const id = Number(req.params.id);

  // ตรวจว่ามีออเดอร์จริงก่อน
  const [rows] = await conn.execute<RowDataPacket[]>(
    "SELECT id FROM orders WHERE id = ?",
    [id]
  );

  if (rows.length === 0) {
    res.status(404).json({
      error: "Order not found",
    });
    return;
  }

  const [result] = await conn.execute<ResultSetHeader>(
    "UPDATE orders SET box_quantity = ? WHERE id = ?",
    [box_quantity, id]
  );

  res.json({
    message: "Order updated",
    affected_row: result.affectedRows,
  });
});

// ล้างเฉพาะออเดอร์จำลองทั้งหมด
router.delete("/simulated", async (_req, res) => {
  const [result] = await conn.execute<ResultSetHeader>(
    "DELETE FROM orders WHERE is_simulated = TRUE"
  );

  res.status(200).json({
    message: "Simulated orders cleared",
    affected_row: result.affectedRows,
  });
});

// ลบออเดอร์หนึ่งรายการ
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);

  const [result] = await conn.execute<ResultSetHeader>(
    "DELETE FROM orders WHERE id = ?",
    [id]
  );

  if (result.affectedRows === 0) {
    res.status(404).json({
      error: "Order not found",
    });
    return;
  }

  res.json({
    affected_row: result.affectedRows,
  });
});