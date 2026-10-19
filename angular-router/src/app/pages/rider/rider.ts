import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RiderJob } from '../../models/delivery-plan';
import { PlanService } from '../../services/plan.service';

function describeError(error: HttpErrorResponse): string {
  if (error.status === 0) {
    return 'ติดต่อระบบไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่';
  }

  if (error.status === 404) {
    return 'ไม่พบใบงานนี้ กรุณาตรวจเลขใบงานอีกครั้ง';
  }

  return `โหลดใบงานไม่สำเร็จ (HTTP ${error.status}) กรุณาลองใหม่`;
}

@Component({
  selector: 'app-rider',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './rider.html',
  styleUrl: './rider.css',
})
export class Rider {
  private readonly planService = inject(PlanService);
  private readonly fb = inject(FormBuilder);

  readonly job = signal<RiderJob | null>(null);
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  readonly jobForm = this.fb.nonNullable.group({
    jobCode: ['', [Validators.required, Validators.pattern(/^\s*[\w-]{1,20}\s*$/)]],
  });

  openJob(): void {
    if (this.jobForm.invalid) {
      this.jobForm.markAllAsTouched();
      return;
    }

    this.loadJob(this.jobForm.getRawValue().jobCode.trim());
  }

  // กลับไปหน้ากรอกเลขใบงาน
  clearJob(): void {
    this.job.set(null);
    this.errorMessage.set('');
    this.jobForm.reset();
  }

  private loadJob(jobCode: string): void {
    if (this.loading()) {
      return;
    }

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
