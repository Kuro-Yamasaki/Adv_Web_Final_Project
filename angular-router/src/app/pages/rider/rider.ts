import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
export class Rider implements OnInit {
  private readonly planService = inject(PlanService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly rules = DELIVERY_RULES;
  readonly shopName = SHOP_LOCATION.name;

  readonly job = signal<RiderJob | null>(null);
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  readonly jobForm = this.fb.nonNullable.group({
    jobCode: ['', [Validators.required, Validators.pattern(/^\s*[\w-]{1,20}\s*$/)]],
  });

  // เลขใบงานอยู่ใน URL (/rider/:jobCode) ร้านจึงส่งลิงก์ให้ไรเดอร์กดเปิดได้เลย
  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const jobCode = params.get('jobCode');

      if (jobCode) {
        this.jobForm.setValue({ jobCode });
        this.loadJob(jobCode);
      } else {
        this.job.set(null);
        this.errorMessage.set('');
        this.jobForm.reset();
      }
    });
  }

  openJob(): void {
    if (this.jobForm.invalid) {
      this.jobForm.markAllAsTouched();
      return;
    }

    this.router.navigate(['/rider', this.jobForm.getRawValue().jobCode.trim()]);
  }

  // กลับไปหน้ากรอกเลขใบงาน
  clearJob(): void {
    this.router.navigate(['/rider']);
  }

  reload(): void {
    const job = this.job();
    if (job) {
      this.loadJob(job.job_code);
    }
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
