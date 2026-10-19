export interface GeoPoint {
  latitude: number;
  longitude: number;
}

// ค่าเริ่มต้น จะถูกแทนด้วยค่าจาก GET /settings ตอนเปิดแอป
export const SHOP_LOCATION: GeoPoint & { name: string } = {
  name: 'ร้านข้าวกล่องส่งด่วนมื้อเที่ยง',
  latitude: 16.246,
  longitude: 103.25,
};

// ลูกค้าต้องอยู่ห่างจากร้านไม่เกินระยะนี้ (กม.)
export let DELIVERY_RADIUS_KM = 3;

// รัศมีที่ใช้ในหน้าค้นลูกค้าใกล้จุด (ต้องตรงกับ backend /customer/nearby)
export const NEARBY_RADIUS_KM = 1;

// กฎการจัดส่งตามโจทย์ (หน่วย: บาท, กม., นาที)
// ค่าเริ่มต้นตรงกับ RULES ใน backend/config.ts และจะถูกแทนด้วยค่าจาก GET /settings
export const DELIVERY_RULES = {
  pricePerBox: 65,
  foodCostPerBox: 40,
  riderBaseFee: 15, // ต่อ 1 รอบ
  riderPerKmPerBox: 2, // 2 บาท x กม. x กล่อง
  riderSpeedKmh: 30,
  maxOrdersPerRider: 3,
  departTime: '11:30',
  deadlineTime: '12:30',
};

export type DeliveryRules = typeof DELIVERY_RULES;

// รูปแบบข้อมูลที่ backend ส่งมาจาก GET /settings
export interface ShopSettings {
  shop: { name: string; latitude: number; longitude: number };
  rules: { serviceRadiusKm: number } & Partial<DeliveryRules>;
}

export function applySettings(settings: ShopSettings): void {
  SHOP_LOCATION.name = settings.shop.name;
  SHOP_LOCATION.latitude = settings.shop.latitude;
  SHOP_LOCATION.longitude = settings.shop.longitude;
  DELIVERY_RADIUS_KM = settings.rules.serviceRadiusKm;

  const { serviceRadiusKm, ...rules } = settings.rules;
  Object.assign(DELIVERY_RULES, rules);
}