import "dotenv/config";
import { createPool } from "mysql2/promise";

export const conn = createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "lunch_delivery",
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
});
