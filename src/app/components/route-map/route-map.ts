import {
  afterNextRender,
  Component,
  effect,
  ElementRef,
  input,
  OnDestroy,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import * as L from 'leaflet';
import { RiderRoute } from '../../models/delivery-plan';
import { SHOP_LOCATION } from '../../shop.config';

const OSRM_ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving';

// ขอเส้นทางตามถนนจริงผ่านทุกจุด (ร้าน → ลูกค้า 1 → 2 → 3) คืน null ถ้าขอไม่สำเร็จ
async function fetchRoadPath(
  points: L.LatLngTuple[],
  signal: AbortSignal,
): Promise<L.LatLngTuple[] | null> {
  // OSRM ใช้ลำดับ lng,lat (ตรงข้ามกับ Leaflet)
  const coords = points.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const url = `${OSRM_ROUTE_URL}/${coords}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes?.length) {
      return null;
    }

    return (data.routes[0].geometry.coordinates as [number, number][]).map(
      ([lng, lat]) => [lat, lng] as L.LatLngTuple,
    );
  } catch {
    return null; // ยกเลิกคำขอหรือเน็ตหลุด
  }
}

// สร้าง popup ด้วย textContent เพื่อไม่ให้ชื่อลูกค้าถูกตีความเป็น HTML
function popupContent(lines: string[]): HTMLElement {
  const box = document.createElement('div');
  lines.forEach((text, index) => {
    const line = document.createElement(index === 0 ? 'strong' : 'div');
    line.textContent = text;
    box.appendChild(line);
  });
  return box;
}

@Component({
  selector: 'app-route-map',
  standalone: true,
  template: `<div #map class="rmap" role="application" aria-label="แผนที่เส้นทางไรเดอร์"></div>`,
  styles: `
    app-route-map { display: block; margin-bottom: 24px; }
    .rmap { height: 480px; border: 1px solid #e6e5e3; border-radius: 8px; z-index: 0; }
    .rmap-shop span, .rmap-stop span {
      display: flex; align-items: center; justify-content: center;
      border: 2px solid white; border-radius: 50%; color: white; font-weight: 700;
      box-shadow: 0 1px 4px rgb(0 0 0 / 40%);
    }
    .rmap-shop span { width: 40px; height: 40px; background: #2c2c2b; font-size: 13px; }
    .rmap-stop span { width: 26px; height: 26px; font-size: 13px; }
    @media (max-width: 600px) { .rmap { height: 340px; } }
  `,
  encapsulation: ViewEncapsulation.None,
})
export class RouteMap implements OnDestroy {
  readonly routes = input<RiderRoute[]>([]);

  private readonly mapElement = viewChild.required<ElementRef<HTMLDivElement>>('map');
  private readonly map = signal<L.Map | null>(null);
  private readonly layer = L.layerGroup();
  private runId = 0; // ใช้ทิ้งผลของคำขอเก่า เมื่อแผนเปลี่ยนระหว่างรอ
  private abort = new AbortController();

  constructor() {
    afterNextRender(() => {
      const map = L.map(this.mapElement().nativeElement, {
        center: [SHOP_LOCATION.latitude, SHOP_LOCATION.longitude],
        zoom: 14,
      });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      this.layer.addTo(map);
      this.map.set(map);
    });

    effect(() => {
      const map = this.map();
      const routes = this.routes();
      if (map) {
        void this.render(map, routes);
      }
    });
  }

  ngOnDestroy(): void {
    this.abort.abort();
    this.map()?.remove();
  }

  private async render(map: L.Map, routes: RiderRoute[]): Promise<void> {
    const run = ++this.runId;
    this.abort.abort();
    this.abort = new AbortController();
    const { signal } = this.abort;

    this.layer.clearLayers();

    const shop: L.LatLngTuple = [SHOP_LOCATION.latitude, SHOP_LOCATION.longitude];
    const bounds = L.latLngBounds([shop]);

    L.marker(shop, {
      icon: L.divIcon({
        className: 'rmap-shop',
        html: '<span>ร้าน</span>',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      }),
      zIndexOffset: 1000,
    })
      .bindPopup(popupContent([SHOP_LOCATION.name]))
      .addTo(this.layer);

    // หมุดลูกค้าวาดทันที ส่วนเส้นถนนรอผลจาก OSRM
    for (const route of routes) {
      route.stops.forEach((stop, index) => {
        const point: L.LatLngTuple = [Number(stop.latitude), Number(stop.longitude)];
        bounds.extend(point);

        L.marker(point, {
          icon: L.divIcon({
            className: 'rmap-stop',
            html: `<span style="background:${route.color}">${index + 1}</span>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          }),
        })
          .bindPopup(
            popupContent([
              `ไรเดอร์ ${route.rider_no} · จุดที่ ${index + 1}: ${stop.customer_name}`,
              `โทร ${stop.phone}`,
              `${stop.box_quantity} กล่อง · ถึง ${stop.arrive_at} น.`,
            ]),
          )
          .addTo(this.layer);
      });
    }

    if (routes.length > 0) {
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
    }

    await Promise.all(
      routes.map(async (route) => {
        const waypoints: L.LatLngTuple[] = [
          shop,
          ...route.stops.map((s): L.LatLngTuple => [Number(s.latitude), Number(s.longitude)]),
        ];

        const road = await fetchRoadPath(waypoints, signal);
        if (run !== this.runId) {
          return; // มีการวาดรอบใหม่แล้ว
        }

        // ถ้าขอถนนไม่ได้ ใช้เส้นตรงประไว้ก่อน (เหมือนที่ backend คำนวณระยะ)
        L.polyline(road ?? waypoints, {
          color: route.color,
          weight: 5,
          opacity: 0.85,
          dashArray: road ? undefined : '8 8',
        }).addTo(this.layer);
      }),
    );
  }
}
