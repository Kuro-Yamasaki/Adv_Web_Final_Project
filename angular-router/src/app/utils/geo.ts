import { GeoPoint } from '../shop.config';

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

// ระยะทางเส้นตรงบนผิวโลก (Haversine) หน่วยกิโลเมตร
// สูตรเดียวกับที่ backend ใช้ใน /customer/nearby
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(Number(b.latitude) - Number(a.latitude));
  const dLng = toRadians(Number(b.longitude) - Number(a.longitude));

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(Number(a.latitude))) *
      Math.cos(toRadians(Number(b.latitude))) *
      Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
