import "dotenv/config";
import { readFileSync } from "fs";
import { resolve } from "path";
import { createPool } from "mysql2/promise";

const caPath = process.env.DB_SSL_CA;

if (!caPath) {
  throw new Error("Please set DB_SSL_CA in .env");
}

export const conn = createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 16586),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  ssl: {
    ca: readFileSync(resolve(caPath), "utf8"),
    rejectUnauthorized: true,
  },

  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
});