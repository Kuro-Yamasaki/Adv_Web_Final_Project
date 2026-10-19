import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DeliveryPlan } from '../../models/delivery-plan';
import { Order } from '../../models/order';
import { DispatchService } from '../../services/dispatch.service';
import { OrderService } from '../../services/order.service';
import { DELIVERY_RULES } from '../../shop.config';

// วันที่วันนี้ตามเวลาไทย รูปแบบ YYYY-MM-DD (ตรงกับ delivery_date ที่ backend บันทึก)
function todayBangkok(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

@Component({
  selector: 'app-dispatch',
  standalone: true,
  imports: [RouterLink, DecimalPipe],
  templateUrl: './dispatch.html',
  styleUrl: './dispatch.css',
})
export class Dispatch implements OnInit {
  private readonly orderService = inject(OrderService);
  private readonly dispatchService = inject(DispatchService);

  readonly rules = DELIVERY_RULES;
  readonly today = todayBangkok();

  readonly orders = signal<Order[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  readonly plan = signal<DeliveryPlan | null>(null);

  readonly totalBoxes = computed(() =>
    this.orders().reduce((sum, order) => sum + order.box_quantity, 0),
  );

  // เวลาที่ใช้ส่งจนเสร็จทุกคน และเวลาที่ยังเหลือก่อนเส้นตาย (นาที)
  readonly usedMinutes = computed(() => {
    const plan = this.plan();
    return plan ? toMinutes(plan.latest_finish_at) - toMinutes(this.rules.departTime) : 0;
  });
  readonly spareMinutes = computed(() => {
    const plan = this.plan();
    return plan ? toMinutes(this.rules.deadlineTime) - toMinutes(plan.latest_finish_at) : 0;
  });

  // กำไรเฉลี่ยต่อกล่องหลังหักค่าอาหารและค่าไรเดอร์
  readonly profitPerBox = computed(() => {
    const plan = this.plan();
    return plan && plan.total_boxes > 0 ? plan.cost.profit / plan.total_boxes : 0;
  });

  ngOnInit(): void {
    this.loadOrders();
  }

  // โหลดเฉพาะออเดอร์ของวันนี้ที่ยังไม่ได้แจกให้ไรเดอร์
  loadOrders(): void {
    if (this.loading()) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');
    this.plan.set(null);

    this.orderService.getAll({ date: this.today, status: 'pending' }).subscribe({
      next: (data) => {
        this.orders.set(data);
        this.loading.set(false);
      },

      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(
          error.status === 0
            ? 'ติดต่อ API ไม่ได้ กรุณาตรวจอินเทอร์เน็ตหรือ CORS'
            : `โหลดข้อมูลไม่สำเร็จ (HTTP ${error.status}) กรุณาลองใหม่`,
        );
        this.loading.set(false);
      },
    });
  }

  calculate(): void {
    this.plan.set(this.dispatchService.plan(this.orders(), { strategy: 'min-cost', variant: 0 }));
  }
}
