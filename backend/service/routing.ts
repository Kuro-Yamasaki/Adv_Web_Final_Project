// อัลกอริทึมจัดเส้นทางไรเดอร์
// ย้ายมาจาก angular-router/src/app/services/dispatch.service.ts (เขียนโดยฝั่ง frontend)
// เป็นฟังก์ชันล้วน ไม่ยุ่งกับฐานข้อมูล จึงทดสอบแยกได้

import { RULES, SHOP } from "../config";
import { haversineKm } from "../geo";
import { CostSummary, RiderRoute, RouteStop } from "../model/plan";

// เป้าหมายของการจัดเส้นทาง
// - min-cost: ค่าจ้างไรเดอร์รวมต่ำสุด (กำไรมากสุด)
// - min-distance: ระยะทางวิ่งรวมสั้นสุด
// - min-riders: ใช้ไรเดอร์น้อยคันที่สุด แล้วค่อยดูค่าจ้าง
export const PLAN_STRATEGIES = ["min-cost", "min-distance", "min-riders"] as const;
export type PlanStrategy = (typeof PLAN_STRATEGIES)[number];

export interface PlanOptions {
  strategy: PlanStrategy;
  // 0 = คำตอบหลัก, 1, 2, ... = สุ่มลำดับการรวมกลุ่มเพื่อเสนอทางเลือกอื่น
  variant: number;
}

// ข้อมูลออเดอร์ที่อัลกอริทึมต้องใช้ (ดึงจาก orders JOIN customer)
export interface RoutingOrder {
  id: number;
  customer_id: number;
  first_name: string;
  last_name: string;
  phone: string;
  box_quantity: number;
  delivery_latitude: number;
  delivery_longitude: number;
}

// ผลลัพธ์ยังไม่มี job_code เพราะเลขใบงานสร้างตอนบันทึกลงฐานข้อมูล
export type ComputedRoute = Omit<RiderRoute, "job_code">;

export interface ComputedPlan {
  routes: ComputedRoute[];
  cost: CostSummary;
  total_boxes: number;
  total_distance_km: number;
  latest_finish_at: string;
  late_count: number;
}

// คนที่ 1 แดง, 2 เขียว, 3 น้ำเงิน ตามโจทย์ ที่เหลือใช้สีที่แยกกันชัด
export const ROUTE_COLORS = [
  "#d32f2f", "#2e7d32", "#1565c0", "#ef6c00", "#7b1fa2",
  "#00838f", "#c2185b", "#5d4037", "#455a64", "#9e9d24",
];

// ค่าปรับที่บวกเพิ่มต่อไรเดอร์ 1 คัน เมื่อเลือก min-riders
const RIDER_PENALTY = 1000;

interface Point { latitude: number; longitude: number; }
interface Stop { order: RoutingOrder; point: Point; }

// กลุ่มออเดอร์ที่ไรเดอร์ 1 คนรับไป (stops เรียงตามลำดับที่จะไปส่งแล้ว)
interface Group { stops: Stop[]; boxes: number; km: number; score: number; }

const round2 = (value: number) => Math.round(value * 100) / 100;
const distance = (a: Point, b: Point) => haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);

export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function travelMinutes(km: number): number {
  return (km / RULES.riderSpeedKmh) * 60;
}

// ค่าจ้าง 1 รอบ = ค่าเรียก + (บาท/กม./กล่อง x กม. ที่วิ่งทั้งรอบ x กล่องที่ถือไป)
export function riderFee(km: number, boxes: number): number {
  return RULES.riderBaseFee + RULES.riderPerKmPerBox * km * boxes;
}

// ระยะทางวิ่งจากร้านไปส่งทีละจุดตามลำดับ (ไม่นับขากลับร้าน)
function routeKm(stops: Stop[]): number {
  let km = 0;
  let from: Point = SHOP;
  for (const stop of stops) {
    km += distance(from, stop.point);
    from = stop.point;
  }
  return km;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]),
  );
}

// สุ่มแบบกำหนด seed ได้ (mulberry32) เพื่อให้ variant เดิมได้คำตอบเดิมทุกครั้ง
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// สร้างกลุ่มพร้อมลำดับจุดส่งที่ดีที่สุด คืน null ถ้าส่งไม่ทันเวลา
// (allowLate ใช้กับออเดอร์เดี่ยว เพราะถึงจะเลทก็ต้องมีคนไปส่ง)
function makeGroup(stops: Stop[], strategy: PlanStrategy, allowLate = false): Group | null {
  let best: Stop[] = stops;
  let bestKm = Infinity;
  for (const order of permutations(stops)) {
    const km = routeKm(order);
    if (km < bestKm) { best = order; bestKm = km; }
  }

  const budget = toMinutes(RULES.deadlineTime) - toMinutes(RULES.departTime);
  if (!allowLate && travelMinutes(bestKm) > budget) return null;

  const boxes = stops.reduce((sum, stop) => sum + stop.order.box_quantity, 0);
  const fee = riderFee(bestKm, boxes);
  const score = strategy === "min-distance" ? bestKm
    : strategy === "min-riders" ? fee + RIDER_PENALTY
    : fee;

  return { stops: best, boxes, km: bestKm, score };
}

// รวมกลุ่ม 2 กลุ่มที่ "ประหยัดได้มากที่สุด" ทีละคู่ (Clarke-Wright savings)
function mergeGroups(groups: Group[], options: PlanOptions, random: () => number): Group[] {
  const result = [...groups];
  const max = RULES.maxOrdersPerRider;

  while (true) {
    const candidates: { i: number; j: number; merged: Group; saving: number }[] = [];

    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        if (result[i].stops.length + result[j].stops.length > max) continue;
        const merged = makeGroup([...result[i].stops, ...result[j].stops], options.strategy);
        if (!merged) continue;
        const saving = result[i].score + result[j].score - merged.score;
        if (saving > 1e-9) candidates.push({ i, j, merged, saving });
      }
    }

    if (candidates.length === 0) return result;

    // variant 0 เลือกคู่ที่ประหยัดสุดเสมอ ส่วน variant อื่นสุ่มจาก 3 อันดับแรก
    candidates.sort((a, b) => b.saving - a.saving);
    const pick = options.variant === 0
      ? candidates[0]
      : candidates[Math.floor(random() * Math.min(3, candidates.length))];

    result.splice(pick.j, 1);
    result.splice(pick.i, 1, pick.merged);
  }
}

// ปรับปรุงต่อ (local search): ย้ายหรือสลับออเดอร์ระหว่างไรเดอร์ จนกว่าจะไม่ดีขึ้น
function improveGroups(groups: Group[], strategy: PlanStrategy): Group[] {
  const result = [...groups];
  const max = RULES.maxOrdersPerRider;
  let improved = true;
  let rounds = 0;

  while (improved && rounds < 50) {
    improved = false;
    rounds++;

    for (let a = 0; a < result.length && !improved; a++) {
      for (let b = 0; b < result.length && !improved; b++) {
        if (a === b) continue;
        const before = result[a].score + result[b].score;

        for (let s = 0; s < result[a].stops.length && !improved; s++) {
          const moving = result[a].stops[s];
          const restOfA = result[a].stops.filter((_, index) => index !== s);

          // ย้ายออเดอร์ s จาก a ไป b
          if (result[b].stops.length < max) {
            const newB = makeGroup([...result[b].stops, moving], strategy);
            const newA = restOfA.length ? makeGroup(restOfA, strategy, true) : null;
            const after = (newA?.score ?? 0) + (newB?.score ?? Infinity);

            if (newB && after < before - 1e-9) {
              result[b] = newB;
              if (newA) result[a] = newA;
              else result.splice(a, 1);
              improved = true;
              break;
            }
          }

          // สลับออเดอร์ s ของ a กับออเดอร์ t ของ b
          for (let t = 0; t < result[b].stops.length; t++) {
            const restOfB = result[b].stops.filter((_, index) => index !== t);
            const newA = makeGroup([...restOfA, result[b].stops[t]], strategy);
            const newB = makeGroup([...restOfB, moving], strategy);

            if (newA && newB && newA.score + newB.score < before - 1e-9) {
              result[a] = newA;
              result[b] = newB;
              improved = true;
              break;
            }
          }
        }
      }
    }
  }

  return result;
}

function buildPlan(groups: Group[]): ComputedPlan {
  const depart = toMinutes(RULES.departTime);
  const deadline = toMinutes(RULES.deadlineTime);

  // เรียงไรเดอร์ตามทิศของจุดแรกรอบร้าน สีจะได้ไล่ไปตามทิศ ไม่กระโดดข้ามฝั่ง
  const bearing = (group: Group) => Math.atan2(
    group.stops[0].point.latitude - SHOP.latitude,
    group.stops[0].point.longitude - SHOP.longitude,
  );
  const sorted = [...groups].sort((a, b) => bearing(b) - bearing(a));

  const routes: ComputedRoute[] = sorted.map((group, index) => {
    let from: Point = SHOP;
    let km = 0;

    const stops: RouteStop[] = group.stops.map(({ order, point }) => {
      const leg = distance(from, point);
      km += leg;
      from = point;
      return {
        order_id: order.id,
        customer_id: order.customer_id,
        customer_name: `${order.first_name} ${order.last_name}`,
        phone: order.phone,
        box_quantity: order.box_quantity,
        latitude: point.latitude,
        longitude: point.longitude,
        leg_km: round2(leg),
        arrive_at: formatTime(depart + Math.ceil(travelMinutes(km))),
      };
    });

    const duration = Math.ceil(travelMinutes(group.km));
    return {
      rider_no: index + 1,
      color: ROUTE_COLORS[index % ROUTE_COLORS.length],
      stops,
      total_boxes: group.boxes,
      distance_km: round2(group.km),
      duration_min: duration,
      finish_at: formatTime(depart + duration),
      rider_fee: round2(riderFee(group.km, group.boxes)),
      late: depart + duration > deadline,
    };
  });

  const totalBoxes = routes.reduce((sum, route) => sum + route.total_boxes, 0);
  const totalFee = round2(routes.reduce((sum, route) => sum + route.rider_fee, 0));
  const cost: CostSummary = {
    revenue: totalBoxes * RULES.pricePerBox,
    food_cost: totalBoxes * RULES.foodCostPerBox,
    rider_fee: totalFee,
    profit: round2(totalBoxes * (RULES.pricePerBox - RULES.foodCostPerBox) - totalFee),
  };
  const longest = Math.max(0, ...routes.map((route) => route.duration_min));

  return {
    routes,
    cost,
    total_boxes: totalBoxes,
    total_distance_km: round2(routes.reduce((sum, route) => sum + route.distance_km, 0)),
    latest_finish_at: formatTime(depart + longest),
    late_count: routes.filter((route) => route.late).length,
  };
}

/**
 * แบ่งออเดอร์ให้ไรเดอร์และเรียงลำดับจุดส่ง
 * 1. เริ่มจากให้ไรเดอร์ 1 คนต่อ 1 ออเดอร์
 * 2. รวมกลุ่มที่ประหยัดได้มากที่สุดทีละคู่ (ไม่เกิน 3 ออเดอร์ และต้องส่งทันเวลา)
 * 3. ย้าย/สลับออเดอร์ระหว่างไรเดอร์จนกว่าจะไม่ดีขึ้น
 * ลำดับจุดส่งในแต่ละกลุ่มลองทุกแบบ (ไม่เกิน 3! = 6 แบบ) แล้วเลือกเส้นที่สั้นที่สุด
 * ระยะทางเป็นเส้นตรง (Haversine) และไม่นับขากลับร้าน
 */
export function planRoutes(orders: RoutingOrder[], options: PlanOptions): ComputedPlan {
  const random = seededRandom(options.variant + 1);
  const stops: Stop[] = orders.map((order) => ({
    order,
    point: { latitude: Number(order.delivery_latitude), longitude: Number(order.delivery_longitude) },
  }));

  let groups = stops.map((stop) => makeGroup([stop], options.strategy, true)!);
  groups = mergeGroups(groups, options, random);
  groups = improveGroups(groups, options.strategy);

  return buildPlan(groups);
}