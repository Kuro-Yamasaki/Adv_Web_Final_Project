import "dotenv/config";

function readNumber(name: string, min: number, max: number): number {
  const value = Number(process.env[name]);
  if (!process.env[name] || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Please set ${name} in .env (number between ${min} and ${max})`);
  }
  return value;
}

export const SHOP = {
  name: process.env.SHOP_NAME || "Lunch Delivery",
  latitude: readNumber("SHOP_LAT", -90, 90),
  longitude: readNumber("SHOP_LNG", -180, 180),
} as const;

// ค่าคงที่ตามโจทย์ (หน่วย: บาท, กม., นาที)
export const RULES = {
  serviceRadiusKm: 3,
  pricePerBox: 65,
  foodCostPerBox: 40,
  riderBaseFee: 15,          // ต่อ 1 รอบ
  riderPerKmPerBox: 2,       // 2 บาท x กม. x กล่อง
  riderSpeedKmh: 30,
  maxOrdersPerRider: 3,
  departTime: "11:30",
  deadlineTime: "12:30",
} as const;

export const TIME_ZONE = "Asia/Bangkok";

// คืนค่า "YYYY-MM-DD" ตามเวลาไทย
export function todayBangkok(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}