import "dotenv/config";
import express from "express";
import cors from "cors";
import { router as customer } from "./controller/customer";
import { router as order } from "./controller/order";

export const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:4200" }));
app.use(express.json({ limit: "100kb" }));
app.get("/", (_req, res) => { res.json({ message: "Lunch Delivery API", database_checked: false }); });
app.use("/customer", customer);
app.use("/orders", order);
app.use((_req, res) => { res.status(404).json({ error: "Route not found" }); });
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err.type === "entity.parse.failed") { res.status(400).json({ error: "Invalid JSON body" }); return; }
  if (err.type === "entity.too.large") { res.status(413).json({ error: "Request body too large" }); return; }
  if (err.code === "ER_ROW_IS_REFERENCED_2") {
    res.status(409).json({ error: "Customer has related records and cannot be deleted" }); return;
  }
  console.error("Request failed:", err.code || err.name);
  res.status(500).json({ error: "Internal server error" });
});
