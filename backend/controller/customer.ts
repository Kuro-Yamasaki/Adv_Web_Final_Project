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
