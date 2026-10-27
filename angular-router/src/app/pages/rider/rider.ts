import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RiderJob, RouteStop } from '../../models/delivery-plan';
import { PlanService } from '../../services/plan.service';
import { DELIVERY_RULES, SHOP_LOCATION } from '../../shop.config';

const MAPS_DIR_URL = 'https://www.google.com/maps/dir/?api=1';

function describeError(error: HttpErrorResponse): string {
  if (error.status === 0) {
    return 'ติดต่อระบบไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่';
  }

  if (error.status === 404) {
    return 'ไม่พบใบงานนี้ กรุณาตรวจเลขใบงานอีกครั้ง';
  }

  return `โหลดใบงานไม่สำเร็จ (HTTP ${error.status}) กรุณาลองใหม่`;
}

const toLatLng = (point: { latitude: number; longitude: number }) =>
  `${Number(point.latitude)},${Number(point.longitude)}`;

@Component({
  selector: 'app-rider',
  standalone: true,
  imports: [ReactiveFormsModule, DecimalPipe],
  templateUrl: './rider.html',
  styleUrl: './rider.css',
})
export class Rider {
  private readonly planService = inject(PlanService);
  private readonly fb = inject(FormBuilder);

  readonly rules = DELIVERY_RULES;
  readonly shopName = SHOP_LOCATION.name;

  readonly job = signal<RiderJob | null>(null);
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  // กด "ส่งถึงแล้ว" ครั้งแรกจะถามยืนยัน (ย้อนกลับไม่ได้) กดซ้ำจึงบันทึก
  readonly confirmingStop = signal<number | null>(null);
  readonly savingStop = signal<number | null>(null);
  readonly stopError = signal('');

  readonly deliveredCount = computed(
    () => this.job()?.stops.filter((stop) => stop.status === 'delivered').length ?? 0,
  );
  readonly allDelivered = computed(() => {
    const job = this.job();
    return !!job && job.stops.length > 0 && this.deliveredCount() === job.stops.length;
  });
  // จุดถัดไปที่ต้องไป = จุดแรกที่ยังไม่ส่ง
  readonly nextStopId = computed(
    () => this.job()?.stops.find((stop) => stop.status !== 'delivered')?.order_id ?? null,
  );

  readonly jobForm = this.fb.nonNullable.group({
    jobCode: ['', [Validators.required, Validators.pattern(/^\s*[\w-]{1,20}\s*$/)]],
  });

  // ไรเดอร์กรอกเลขใบงานที่ได้จากร้านเอง (ตามโจทย์) แล้วกด "ดูใบงาน"
  openJob(): void {
    if (this.jobForm.invalid) {
      this.jobForm.markAllAsTouched();
      return;
    }

    this.loadJob(this.jobForm.getRawValue().jobCode.trim().toUpperCase());
  }

  // กลับไปหน้ากรอกเลขใบงาน
  clearJob(): void {
    this.job.set(null);
    this.errorMessage.set('');
    this.stopError.set('');
    this.jobForm.reset();
  }

  reload(): void {
    const job = this.job();
    if (job) {
      this.loadJob(job.job_code);
    }
  }

  // กดส่งแล้วได้เฉพาะแผนที่ร้านยืนยันแล้ว และออเดอร์ที่แจกงานแล้ว
  canMarkDelivered(stop: RouteStop): boolean {
    return this.job()?.plan_status === 'confirmed' && stop.status === 'assigned';
  }

  markDelivered(stop: RouteStop): void {
    const job = this.job();
    if (!job || this.savingStop() !== null || !this.canMarkDelivered(stop)) {
      return;
    }

    if (this.confirmingStop() !== stop.order_id) {
      this.confirmingStop.set(stop.order_id);
      this.stopError.set('');
      return;
    }

    this.confirmingStop.set(null);
    this.savingStop.set(stop.order_id);

    this.planService.markDelivered(job.job_code, stop.order_id).subscribe({
      next: (result) => {
        this.job.update((current) =>
          current && {
            ...current,
            stops: current.stops.map((item) =>
              item.order_id === result.order_id ? { ...item, status: result.status } : item,
            ),
          },
        );
        this.savingStop.set(null);
      },

      error: (error: HttpErrorResponse) => {
        this.stopError.set(
          error.status === 409
            ? 'บันทึกไม่ได้ ร้านอาจยังไม่ยืนยันแผน หรือออเดอร์ถูกเปลี่ยน กรุณากด "โหลดใบงานใหม่"'
            : describeError(error),
        );
        this.savingStop.set(null);
      },
    });
  }

  // นำทางจากตำแหน่งปัจจุบันของไรเดอร์ไปบ้านลูกค้า 1 จุด
  stopMapUrl(stop: RouteStop): string {
    return `${MAPS_DIR_URL}&destination=${toLatLng(stop)}&travelmode=driving`;
  }

  // เส้นทางทั้งรอบ: ร้าน → จุดที่ 1 → 2 → 3 ตามลำดับในใบงาน
  fullRouteUrl(job: RiderJob): string {
    const stops = job.stops;
    const last = stops[stops.length - 1];
    const waypoints = stops.slice(0, -1).map(toLatLng).join('|');

    return (
      `${MAPS_DIR_URL}&origin=${toLatLng(SHOP_LOCATION)}` +
      `&destination=${toLatLng(last)}` +
      (waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : '') +
      '&travelmode=driving'
    );
  }

  private loadJob(jobCode: string): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.confirmingStop.set(null);
    this.stopError.set('');

    this.planService.getJob(jobCode).subscribe({
      next: (job) => {
        this.job.set(job);
        this.loading.set(false);
      },

      error: (error: HttpErrorResponse) => {
        this.job.set(null);
        this.errorMessage.set(describeError(error));
        this.loading.set(false);
      },
    });
  }
}