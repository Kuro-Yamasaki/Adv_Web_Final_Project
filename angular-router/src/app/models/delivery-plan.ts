// จุดส่ง 1 จุด (= ออเดอร์ 1 รายการ) ในเส้นทางของไรเดอร์
export interface RouteStop {
  order_id: number;
  customer_id: number;
  customer_name: string;
  phone: string;
  box_quantity: number;
  latitude: number;
  longitude: number;
  // ระยะจากจุดก่อนหน้า (จุดแรกนับจากร้าน) หน่วย กม.
  leg_km: number;
  // เวลาที่ไปถึงจุดนี้ รูปแบบ "HH:mm"
  arrive_at: string;
}

// งานของไรเดอร์ 1 คน
export interface RiderRoute {
  rider_no: number;
  // เลขใบงานที่ไรเดอร์ใช้กรอกดูงานของตัวเอง
  job_code: string;
  // สีเส้นทางบนแผนที่และในตาราง
  color: string;
  stops: RouteStop[];
  total_boxes: number;
  distance_km: number;
  duration_min: number;
  finish_at: string;
  rider_fee: number;
  // ถึงจุดสุดท้ายเกินเวลาที่กำหนดหรือไม่
  late: boolean;
}

export interface CostSummary {
  revenue: number;
  food_cost: number;
  rider_fee: number;
  profit: number;
}

export interface DeliveryPlan {
  id: number;
  status: 'draft' | 'confirmed';
  created_at: string;
  routes: RiderRoute[];
  cost: CostSummary;
  total_boxes: number;
  total_distance_km: number;
  // เวลาที่ไรเดอร์คนสุดท้ายส่งเสร็จ
  latest_finish_at: string;
  late_count: number;
}
