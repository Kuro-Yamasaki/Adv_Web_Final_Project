export interface GeoPoint {
  latitude: number;
  longitude: number;
}

// TODO: เปลี่ยนเป็นพิกัดร้านจริง (ตอนนี้ใช้จุดแถว ม.มหาสารคาม ชั่วคราว)
export const SHOP_LOCATION: GeoPoint & { name: string } = {
  name: 'ร้านข้าวกล่องส่งด่วนมื้อเที่ยง',
  latitude: 16.246,
  longitude: 103.25,
};

// ลูกค้าต้องอยู่ห่างจากร้านไม่เกินระยะนี้ (กม.)
export const DELIVERY_RADIUS_KM = 3;

// รัศมีที่ใช้ในหน้าค้นลูกค้าใกล้จุด (ต้องตรงกับ backend /customer/nearby)
export const NEARBY_RADIUS_KM = 1;
