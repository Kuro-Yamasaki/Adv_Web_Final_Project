import express from "express";
import { randomInt } from "crypto";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { Connection } from "mysql2/promise";
import { conn } from "../dbconnect";
import { isValidDate, todayBangkok } from "../config";
import { DeliveryPlan, RiderRoute } from "../model/plan";
import { PLAN_STRATEGIES, PlanStrategy, planRoutes, RoutingOrder } from "../service/routing";

export const router = express.Router();

// ---------- ตัวช่วย ----------

// เลขใบงาน 8 ตัว ไม่ใช้ตัวที่สับสนง่าย (0/O, 1/I/L)
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function newJobCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return code;
}

// TIME จาก MySQL มาเป็น "11:42:00" ตัดเหลือ "11:42"
const hhmm = (time: string) => String(time).slice(0, 5);

// ดึงออเดอร์ pending ของวันนั้นที่ยังไม่ได้จัดให้ไรเดอร์
async function loadPendingOrders(db: Connection, date: string, lock = false) {
  const [rows] = await db.execute<(RoutingOrder & RowDataPacket)[]>(`
    SELECT o.id, o.customer_id, c.first_name, c.last_name, c.phone,
           o.box_quantity, o.delivery_latitude, o.delivery_longitude
    FROM orders AS o
    INNER JOIN customer AS c ON o.customer_id = c.id
    WHERE o.delivery_date = ? AND o.status = 'pending'
    ORDER BY o.id
    ${lock ? "FOR UPDATE" : ""}`, [date]);
  return rows;
}

// ประกอบแผนจากฐานข้อมูลให้เป็นรูปแบบ DeliveryPlan (ตรงกับ frontend)
async function loadPlan(db: Connection, id: number): Promise<(DeliveryPlan & { plan_date: string }) | null> {
  const [plans] = await db.execute<RowDataPacket[]>("SELECT * FROM delivery_plan WHERE id = ?", [id]);
  if (plans.length === 0) return null;
  const plan = plans[0];

  const [routeRows] = await db.execute<RowDataPacket[]>(
    "SELECT * FROM plan_route WHERE plan_id = ? ORDER BY rider_no", [id]);

  const [stopRows] = await db.execute<RowDataPacket[]>(`
    SELECT s.route_id, s.seq, s.order_id, s.leg_km, s.arrive_at,
           o.customer_id, o.box_quantity, o.delivery_latitude, o.delivery_longitude,
           c.first_name, c.last_name, c.phone
    FROM plan_stop AS s
    INNER JOIN plan_route AS r ON s.route_id = r.id
    INNER JOIN orders AS o ON s.order_id = o.id
    INNER JOIN customer AS c ON o.customer_id = c.id
    WHERE r.plan_id = ?
    ORDER BY s.route_id, s.seq`, [id]);

  const routes: RiderRoute[] = routeRows.map((r) => ({
    rider_no: r.rider_no,
    job_code: r.job_code,
    color: r.color,
    stops: stopRows.filter((s) => s.route_id === r.id).map((s) => ({
      order_id: s.order_id,
      customer_id: s.customer_id,
      customer_name: `${s.first_name} ${s.last_name}`,
      phone: s.phone,
      box_quantity: s.box_quantity,
      latitude: s.delivery_latitude,
      longitude: s.delivery_longitude,
      leg_km: s.leg_km,
      arrive_at: hhmm(s.arrive_at),
    })),
    total_boxes: r.total_boxes,
    distance_km: r.distance_km,
    duration_min: r.duration_min,
    finish_at: hhmm(r.finish_at),
    rider_fee: r.rider_fee,
    late: Boolean(r.late),
  }));

  return {
    id: plan.id,
    plan_date: plan.plan_date,
    status: plan.status,
    created_at: new Date(plan.created_at).toISOString(),
    routes,
    cost: { revenue: plan.revenue, food_cost: plan.food_cost, rider_fee: plan.rider_fee, profit: plan.profit },
    total_boxes: plan.total_boxes,
    total_distance_km: plan.total_distance_km,
    latest_finish_at: hhmm(plan.latest_finish_at),
    late_count: plan.late_count,
  };
}

function readDate(value: unknown): string | null {
  if (value === undefined) return todayBangkok();
  return typeof value === "string" && isValidDate(value) ? value : null;
}

// ---------- API ----------

// คำนวณแผนใหม่จากออเดอร์ pending แล้วบันทึกเป็น draft
// body: { strategy?: "min-cost" | "min-distance" | "min-riders", variant?: 0-99, date?: "YYYY-MM-DD" }
// กด "คำนวณใหม่" = ส่ง variant เพิ่มขึ้นทีละ 1
router.post("/", async (req, res) => {
  const body = req.body ?? {};
  if (typeof body !== "object" || Array.isArray(body)) {
    res.status(400).json({ error: "Body must be a JSON object" }); return;
  }

  const strategy = (body.strategy ?? "min-cost") as PlanStrategy;
  if (!PLAN_STRATEGIES.includes(strategy)) {
    res.status(400).json({ error: `strategy must be one of ${PLAN_STRATEGIES.join(", ")}` }); return;
  }
  const variant = body.variant ?? 0;
  if (!Number.isInteger(variant) || variant < 0 || variant > 99) {
    res.status(400).json({ error: "variant must be an integer between 0 and 99" }); return;
  }
  const date = readDate(body.date);
  if (!date) { res.status(400).json({ error: "date must be YYYY-MM-DD" }); return; }

  const connection = await conn.getConnection();
  try {
    await connection.beginTransaction();

    // วันนี้ยืนยันแผนไปแล้ว ห้ามคำนวณทับ
    const [confirmed] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM delivery_plan WHERE plan_date = ? AND status = 'confirmed' LIMIT 1", [date]);
    if (confirmed.length > 0) {
      await connection.rollback();
      res.status(409).json({ error: "This date already has a confirmed plan", plan_id: confirmed[0].id }); return;
    }

    const orders = await loadPendingOrders(connection, date);
    if (orders.length === 0) {
      await connection.rollback();
      res.status(400).json({ error: "No pending orders for this date" }); return;
    }

    const result = planRoutes(orders, { strategy, variant });

    // เก็บแค่ร่างล่าสุด ลบร่างเก่าของวันนั้นทิ้ง (route/stop ถูกลบตาม CASCADE)
    await connection.execute("DELETE FROM delivery_plan WHERE plan_date = ? AND status = 'draft'", [date]);

    const [planResult] = await connection.execute<ResultSetHeader>(`
      INSERT INTO delivery_plan (plan_date, status, seed, total_boxes, total_distance_km,
        revenue, food_cost, rider_fee, profit, latest_finish_at, late_count)
      VALUES (?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [date, variant, result.total_boxes, result.total_distance_km,
        result.cost.revenue, result.cost.food_cost, result.cost.rider_fee, result.cost.profit,
        result.latest_finish_at, result.late_count]);
    const planId = planResult.insertId;

    for (const route of result.routes) {
      // สุ่มเลขใบงานใหม่ถ้าบังเอิญซ้ำ (โอกาสน้อยมาก)
      let routeId = 0;
      for (let attempt = 0; attempt < 5 && !routeId; attempt++) {
        try {
          const [routeResult] = await connection.execute<ResultSetHeader>(`
            INSERT INTO plan_route (plan_id, rider_no, job_code, color, total_boxes,
              distance_km, duration_min, finish_at, rider_fee, late)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [planId, route.rider_no, newJobCode(), route.color, route.total_boxes,
              route.distance_km, route.duration_min, route.finish_at, route.rider_fee, route.late ? 1 : 0]);
          routeId = routeResult.insertId;
        } catch (error: any) {
          if (error.code !== "ER_DUP_ENTRY") throw error;
        }
      }
      if (!routeId) throw new Error("Could not generate a unique job code");

      for (const [index, stop] of route.stops.entries()) {
        await connection.execute(
          "INSERT INTO plan_stop (route_id, seq, order_id, leg_km, arrive_at) VALUES (?, ?, ?, ?, ?)",
          [routeId, index + 1, stop.order_id, stop.leg_km, stop.arrive_at]);
      }
    }

    await connection.commit();
    res.status(201).json(await loadPlan(conn, planId));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

// รายการแผนของวันนั้น (ใหม่สุดก่อน) ใช้ตอนเปิดหน้าใหม่เพื่อดูว่ามีแผนอยู่แล้วหรือยัง
// GET /plans?date=2026-10-19 (ไม่ใส่ = วันนี้)
router.get("/", async (req, res) => {
  const date = readDate(req.query.date);
  if (!date) { res.status(400).json({ error: "date must be YYYY-MM-DD" }); return; }

  const [rows] = await conn.execute<RowDataPacket[]>(`
    SELECT id, plan_date, status, seed AS variant, total_boxes, total_distance_km,
           rider_fee, profit, latest_finish_at, late_count, created_at
    FROM delivery_plan WHERE plan_date = ?
    ORDER BY (status = 'confirmed') DESC, id DESC`, [date]);
  res.json(rows.map((r) => ({ ...r, latest_finish_at: hhmm(r.latest_finish_at) })));
});

// ใบงานไรเดอร์ (หน้า /rider/:jobCode ของ frontend)
// GET /plans/jobs/K7QM2XPA -> RiderRoute + plan_id, plan_date, plan_status
// แผนร่างก็เปิดดูได้ หน้าเว็บจะขึ้นคำเตือนว่ายังไม่ยืนยัน
router.get("/jobs/:code", async (req, res) => {
  const code = String(req.params.code).trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(code)) {
    res.status(404).json({ error: "Job not found" }); return;
  }

  const [routes] = await conn.execute<RowDataPacket[]>(`
    SELECT r.*, p.plan_date, p.status AS plan_status
    FROM plan_route AS r
    INNER JOIN delivery_plan AS p ON r.plan_id = p.id
    WHERE r.job_code = ?`, [code]);
  if (routes.length === 0) { res.status(404).json({ error: "Job not found" }); return; }
  const r = routes[0];

  const [stops] = await conn.execute<RowDataPacket[]>(`
    SELECT s.order_id, s.leg_km, s.arrive_at,
           o.customer_id, o.box_quantity, o.delivery_latitude, o.delivery_longitude,
           c.first_name, c.last_name, c.phone
    FROM plan_stop AS s
    INNER JOIN orders AS o ON s.order_id = o.id
    INNER JOIN customer AS c ON o.customer_id = c.id
    WHERE s.route_id = ?
    ORDER BY s.seq`, [r.id]);

  res.json({
    plan_id: r.plan_id,
    plan_date: r.plan_date,
    plan_status: r.plan_status,
    rider_no: r.rider_no,
    job_code: r.job_code,
    color: r.color,
    stops: stops.map((s) => ({
      order_id: s.order_id,
      customer_id: s.customer_id,
      customer_name: `${s.first_name} ${s.last_name}`,
      phone: s.phone,
      box_quantity: s.box_quantity,
      latitude: s.delivery_latitude,
      longitude: s.delivery_longitude,
      leg_km: s.leg_km,
      arrive_at: hhmm(s.arrive_at),
    })),
    total_boxes: r.total_boxes,
    distance_km: r.distance_km,
    duration_min: r.duration_min,
    finish_at: hhmm(r.finish_at),
    rider_fee: r.rider_fee,
    late: Boolean(r.late),
  });
});

router.param("id", (_req, res, next, id: string) => {
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) {
    res.status(400).json({ error: "id must be a positive integer" }); return;
  }
  next();
});

// ดูแผนเต็ม
router.get("/:id", async (req, res) => {
  const plan = await loadPlan(conn, Number(req.params.id));
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  res.json(plan);
});

// ยืนยันแผน: ออเดอร์ในแผนเปลี่ยนเป็น assigned และไรเดอร์ใช้เลขใบงานได้
router.post("/:id/confirm", async (req, res) => {
  const id = Number(req.params.id);
  const connection = await conn.getConnection();
  try {
    await connection.beginTransaction();

    const [plans] = await connection.execute<RowDataPacket[]>(
      "SELECT id, plan_date, status, total_boxes FROM delivery_plan WHERE id = ? FOR UPDATE", [id]);
    if (plans.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: "Plan not found" }); return;
    }
    const plan = plans[0];
    if (plan.status !== "draft") {
      await connection.rollback();
      res.status(409).json({ error: "Plan is already confirmed" }); return;
    }

    // ถ้ามีการเพิ่ม/ลบ/แก้ออเดอร์หลังคำนวณ แผนนี้ล้าสมัยแล้ว ต้องคำนวณใหม่
    const pending = await loadPendingOrders(connection, plan.plan_date, true);
    const [stops] = await connection.execute<RowDataPacket[]>(`
      SELECT s.order_id FROM plan_stop AS s
      INNER JOIN plan_route AS r ON s.route_id = r.id
      WHERE r.plan_id = ?`, [id]);
    const planOrderIds = new Set(stops.map((s) => s.order_id));
    const pendingBoxes = pending.reduce((sum, o) => sum + o.box_quantity, 0);
    const sameOrders = pending.length === planOrderIds.size && pending.every((o) => planOrderIds.has(o.id));
    if (!sameOrders || pendingBoxes !== plan.total_boxes) {
      await connection.rollback();
      res.status(409).json({ error: "Orders changed after this plan was calculated. Please recalculate." }); return;
    }

    await connection.execute(`
      UPDATE orders SET status = 'assigned'
      WHERE id IN (SELECT s.order_id FROM plan_stop AS s
                   INNER JOIN plan_route AS r ON s.route_id = r.id WHERE r.plan_id = ?)`, [id]);
    await connection.execute("UPDATE delivery_plan SET status = 'confirmed' WHERE id = ?", [id]);

    await connection.commit();
    res.json(await loadPlan(conn, id));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});