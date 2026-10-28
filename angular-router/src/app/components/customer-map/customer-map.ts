import {
  afterNextRender,
  Component,
  effect,
  ElementRef,
  input,
  OnDestroy,
  output,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import * as L from 'leaflet';
import { Customer } from '../../models/customer';
import {
  DELIVERY_RADIUS_KM,
  GeoPoint,
  NEARBY_RADIUS_KM,
  SHOP_LOCATION,
} from '../../shop.config';
import { distanceKm } from '../../utils/geo';

const COLOR_INSIDE = '#141414'; // ธีมดำ–เหลือง
const COLOR_OUTSIDE = '#c2410c';
const COLOR_SEARCH = '#7c3aed';

// สร้าง popup ด้วย textContent เพื่อไม่ให้ชื่อลูกค้าถูกตีความเป็น HTML
function popupContent(lines: string[]): HTMLElement {
  const box = document.createElement('div');
  box.className = 'cmap-popup';

  lines.forEach((text, index) => {
    const line = document.createElement(index === 0 ? 'strong' : 'div');
    line.textContent = text;
    box.appendChild(line);
  });

  return box;
}

@Component({
  selector: 'app-customer-map',
  standalone: true,
  template: `
    <div #map class="cmap" [class.cmap-picking]="pickEnabled()" role="application"
      aria-label="แผนที่ตำแหน่งร้านและบ้านลูกค้า"></div>
  `,
  styleUrl: './customer-map.css',
  // Leaflet สร้าง DOM เอง จึงต้องใช้สไตล์แบบ global (ทุก class ขึ้นต้นด้วย cmap-)
  encapsulation: ViewEncapsulation.None,
})
export class CustomerMap implements OnDestroy {
  readonly customers = input<Customer[]>([]);
  // จุดที่กำลังเลือกในฟอร์มเพิ่ม/แก้ไขลูกค้า (null = ไม่แสดง)
  readonly picked = input<GeoPoint | null>(null);
  readonly pickEnabled = input(false);
  // จุดศูนย์กลางของการค้นในรัศมี (null = ไม่แสดง)
  readonly searchCenter = input<GeoPoint | null>(null);

  readonly pick = output<GeoPoint>();

  private readonly mapElement = viewChild.required<ElementRef<HTMLDivElement>>('map');
  private readonly map = signal<L.Map | null>(null);

  private readonly customerLayer = L.layerGroup();
  private readonly searchLayer = L.layerGroup();
  private readonly customerMarkers = new Map<number, L.CircleMarker>();
  private pickedMarker: L.Marker | null = null;
  private hasFitted = false;

  constructor() {
    afterNextRender(() => this.createMap());

    effect(() => {
      const map = this.map();
      if (map) {
        this.renderCustomers(map, this.customers());
      }
    });

    effect(() => {
      const map = this.map();
      if (map) {
        this.renderPicked(map, this.picked());
      }
    });

    effect(() => {
      const map = this.map();
      if (map) {
        this.renderSearchCenter(map, this.searchCenter());
      }
    });
  }

  ngOnDestroy(): void {
    this.map()?.remove();
  }

  // เลื่อนแผนที่ไปที่ลูกค้าและเปิด popup
  focusCustomer(id: number): void {
    const map = this.map();
    const marker = this.customerMarkers.get(id);

    if (!map || !marker) {
      return;
    }

    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 16));
    marker.openPopup();
  }

  private createMap(): void {
    const shop: L.LatLngTuple = [SHOP_LOCATION.latitude, SHOP_LOCATION.longitude];

    const map = L.map(this.mapElement().nativeElement, {
      center: shop,
      zoom: 14,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    L.circle(shop, {
      radius: DELIVERY_RADIUS_KM * 1000,
      color: COLOR_INSIDE,
      weight: 1,
      dashArray: '6 6',
      fillOpacity: 0.04,
      interactive: false,
    }).addTo(map);

    L.marker(shop, {
      icon: L.divIcon({
        className: 'cmap-shop-icon',
        html: '<span>ร้าน</span>',
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      }),
      zIndexOffset: 1000,
      title: SHOP_LOCATION.name,
    })
      .bindPopup(popupContent([SHOP_LOCATION.name, `รัศมีส่ง ${DELIVERY_RADIUS_KM} กม.`]))
      .addTo(map);

    this.customerLayer.addTo(map);
    this.searchLayer.addTo(map);

    map.on('click', (event: L.LeafletMouseEvent) => {
      if (this.pickEnabled()) {
        this.emitPick(event.latlng);
      }
    });

    this.map.set(map);
  }

  private renderCustomers(map: L.Map, customers: Customer[]): void {
    this.customerLayer.clearLayers();
    this.customerMarkers.clear();

    for (const customer of customers) {
      const point = {
        latitude: Number(customer.latitude),
        longitude: Number(customer.longitude),
      };

      if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
        continue;
      }

      const fromShop = distanceKm(SHOP_LOCATION, point);
      const outside = fromShop > DELIVERY_RADIUS_KM;
      const color = outside ? COLOR_OUTSIDE : COLOR_INSIDE;

      const marker = L.circleMarker([point.latitude, point.longitude], {
        radius: 8,
        color: 'white',
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
      }).bindPopup(
        popupContent([
          `${customer.first_name} ${customer.last_name}`,
          `โทร ${customer.phone}`,
          `ห่างจากร้าน ${fromShop.toFixed(2)} กม.` + (outside ? ' (นอกเขตส่ง)' : ''),
        ]),
      );

      marker.addTo(this.customerLayer);
      this.customerMarkers.set(customer.id, marker);
    }

    // ซูมให้เห็นลูกค้าทุกคนครั้งแรกที่มีข้อมูล ครั้งต่อไปไม่ขยับแผนที่เอง
    if (!this.hasFitted && this.customerMarkers.size > 0) {
      const bounds = L.latLngBounds([[SHOP_LOCATION.latitude, SHOP_LOCATION.longitude]]);
      this.customerMarkers.forEach((marker) => bounds.extend(marker.getLatLng()));
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
      this.hasFitted = true;
    }
  }

  private renderPicked(map: L.Map, point: GeoPoint | null): void {
    if (!point) {
      this.pickedMarker?.remove();
      this.pickedMarker = null;
      return;
    }

    const latLng = L.latLng(point.latitude, point.longitude);

    if (!this.pickedMarker) {
      this.pickedMarker = L.marker(latLng, {
        draggable: true,
        icon: L.divIcon({
          className: 'cmap-pick-icon',
          html: '<span></span>',
          iconSize: [28, 28],
          iconAnchor: [14, 28],
        }),
        zIndexOffset: 2000,
        title: 'ตำแหน่งที่เลือก (ลากเพื่อย้าย)',
      })
        .on('dragend', () => this.emitPick(this.pickedMarker!.getLatLng()))
        .addTo(map);

      if (!map.getBounds().contains(latLng)) {
        map.panTo(latLng);
      }
    } else {
      this.pickedMarker.setLatLng(latLng);
    }
  }

  private renderSearchCenter(map: L.Map, center: GeoPoint | null): void {
    this.searchLayer.clearLayers();

    if (!center) {
      return;
    }

    const latLng: L.LatLngTuple = [center.latitude, center.longitude];

    const circle = L.circle(latLng, {
      radius: NEARBY_RADIUS_KM * 1000,
      color: COLOR_SEARCH,
      weight: 2,
      fillOpacity: 0.08,
      interactive: false,
    }).addTo(this.searchLayer);

    L.circleMarker(latLng, {
      radius: 5,
      color: COLOR_SEARCH,
      fillColor: COLOR_SEARCH,
      fillOpacity: 1,
    })
      .bindPopup(popupContent(['จุดศูนย์กลางการค้นหา', `รัศมี ${NEARBY_RADIUS_KM} กม.`]))
      .addTo(this.searchLayer);

    map.fitBounds(circle.getBounds(), { padding: [24, 24] });
  }

  private emitPick(latLng: L.LatLng): void {
    // ทศนิยม 6 ตำแหน่ง ≈ ละเอียดระดับ 10 ซม. พอสำหรับบ้านลูกค้า
    this.pick.emit({
      latitude: Number(latLng.lat.toFixed(6)),
      longitude: Number(latLng.lng.toFixed(6)),
    });
  }
}
