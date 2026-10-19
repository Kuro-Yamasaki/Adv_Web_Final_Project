import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DeliveryPlan } from '../../models/delivery-plan';
import { Order } from '../../models/order';
import { DispatchService, PlanStrategy } from '../../services/dispatch.service';
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

// ลายเซ็นของแผน ใช้เช็กว่าแผนใหม่ต่างจากแผนเดิมจริงหรือไม่
function planKey(plan: DeliveryPlan): string {
  return plan.routes
    .map((route) => route.stops.map((stop) => stop.order_id).join('>'))
    .sort()
    .join('|');
}

// จำนวน variant ที่ลองได้สูงสุดต่อการกด "เสนอเส้นทางอื่น" 1 ครั้ง
const MAX_TRIES = 20;

const STRATEGY_OPTIONS: { value: PlanStrategy; label: string; hint: string }[] = [
  { value: 'min-cost', label: 'ค่าส่งถูกที่สุด', hint: 'กำไรมากที่สุด' },
  { value: 'min-distance', label: 'ระยะทางสั้นที่สุด', hint: 'ประหยัดน้ำมัน' },
  { value: 'min-riders', label: 'ใช้ไรเดอร์น้อยที่สุด', hint: 'เรียกรถน้อยคัน' },
];

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

  readonly strategyOptions = STRATEGY_OPTIONS;
  readonly strategy = signal<PlanStrategy>('min-cost');
  readonly variant = signal(0);

  readonly plan = signal<DeliveryPlan | null>(null);
  // แผนก่อนกด "เสนอเส้นทางอื่น" หรือเปลี่ยนเป้าหมาย ใช้เทียบและย้อนกลับ
  readonly previousPlan = signal<DeliveryPlan | null>(null);
  readonly notice = signal('');

  // ผลต่างของแผนปัจจุบันเทียบกับแผนก่อนหน้า (ค่าบวก = แผนใหม่มากกว่า)
  readonly comparison = computed(() => {
    const plan = this.plan();
    const previous = this.previousPlan();
    if (!plan || !previous) {
      return null;
    }

    return {
      profit: plan.cost.profit - previous.cost.profit,
      riders: plan.routes.length - previous.routes.length,
      distance: plan.total_distance_km - previous.total_distance_km,
      minutes: toMinutes(plan.latest_finish_at) - toMinutes(previous.latest_finish_at),
    };
  });

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
    this.previousPlan.set(null);
    this.notice.set('');

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

  // คำนวณใหม่ตั้งแต่ต้นด้วยเป้าหมายที่เลือกอยู่
  calculate(): void {
    this.previousPlan.set(null);
    this.variant.set(0);
    this.plan.set(this.runPlan(0));
  }

  // เปลี่ยนเป้าหมาย ถ้ามีแผนอยู่แล้วให้คำนวณใหม่ทันทีและเก็บแผนเดิมไว้เทียบ
  selectStrategy(strategy: PlanStrategy): void {
    if (strategy === this.strategy()) {
      return;
    }

    this.strategy.set(strategy);
    const current = this.plan();
    if (current) {
      this.previousPlan.set(current);
      this.variant.set(0);
      this.plan.set(this.runPlan(0));
    }
  }

  // เสนอแผนอื่น ถ้า variant ถัดไปได้แผนเดิมซ้ำ ให้ลองต่อจนได้แผนที่ต่าง
  suggestAnother(): void {
    const current = this.plan();
    if (!current) {
      return;
    }

    const currentKey = planKey(current);
    let variant = this.variant();
    let next = current;

    for (let tries = 0; tries < MAX_TRIES && planKey(next) === currentKey; tries++) {
      variant++;
      next = this.runPlan(variant);
    }

    this.variant.set(variant);
    if (planKey(next) === currentKey) {
      this.notice.set('ไม่พบเส้นทางแบบอื่นที่ต่างจากเดิม แผนนี้น่าจะดีที่สุดแล้วสำหรับเป้าหมายนี้');
      return;
    }

    this.previousPlan.set(current);
    this.plan.set(next);
  }

  // กลับไปใช้แผนก่อนหน้า (สลับกับแผนปัจจุบัน จะได้กดกลับไปกลับมาได้)
  usePreviousPlan(): void {
    const previous = this.previousPlan();
    if (!previous) {
      return;
    }

    this.previousPlan.set(this.plan());
    this.plan.set(previous);
  }

  private runPlan(variant: number): DeliveryPlan {
    this.notice.set('');
    return this.dispatchService.plan(this.orders(), { strategy: this.strategy(), variant });
  }
}
