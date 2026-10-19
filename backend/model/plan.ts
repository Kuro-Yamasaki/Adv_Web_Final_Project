// โครงข้อมูลแผนการส่ง ต้องตรงกับ angular-router/src/app/models/delivery-plan.ts

// จุดส่ง 1 จุด (= ออเดอร์ 1 รายการ) ในเส้นทางของไรเดอร์
export interface RouteStop {
  order_id: number;
  customer_id: number;
  customer_name: string;
  phone: string;
  box_quantity: number;
  latitude: number;
  longitude: number;
  leg_km: number;      // ระยะจากจุดก่อนหน้า (จุดแรกนับจากร้าน) กม.
  arrive_at: string;   // เวลาที่ไปถึง "HH:mm"
}

// งานของไรเดอร์ 1 คน
export interface RiderRoute {
  rider_no: number;
  job_code: string;    // เลขใบงานให้ไรเดอร์กรอกดูงาน
  color: string;       // สีเส้นทางบนแผนที่ เช่น "#e11d48"
  stops: RouteStop[];
  total_boxes: number;
  distance_km: number;
  duration_min: number;
  finish_at: string;
  rider_fee: number;
  late: boolean;       // ถึงจุดสุดท้ายเกินเวลาที่กำหนดหรือไม่
}

export interface CostSummary {
  revenue: number;
  food_cost: number;
  rider_fee: number;
  profit: number;
}

export interface DeliveryPlan {
  id: number;                       // เพิ่มจากฝั่ง Angular
  status: "draft" | "confirmed";    // เพิ่มจากฝั่ง Angular
  created_at: string;
  routes: RiderRoute[];
  cost: CostSummary;
  total_boxes: number;
  total_distance_km: number;
  latest_finish_at: string;         // เวลาที่ไรเดอร์คนสุดท้ายส่งเสร็จ
  late_count: number;
}