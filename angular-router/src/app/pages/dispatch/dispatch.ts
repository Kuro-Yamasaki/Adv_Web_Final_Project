import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { map, of, switchMap } from 'rxjs';
import { DeliveryPlan, PlanStrategy } from '../../models/delivery-plan';
import { Order } from '../../models/order';
import { OrderService } from '../../services/order.service';
import { PlanService } from '../../services/plan.service';
import { DELIVERY_RULES } from '../../shop.config';

// วันที่วันนี้ตามเวลาไทย รูปแบบ YYYY-MM-DD (ตรงกับ delivery_date ที่ backend บันทึก)
function todayBangkok(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// ลายเซ็นของแผน ใช้เช็กว่าแผนใหม่ต่างจากแผนเดิมจริงหรือไม่ (ไม่นับเลขใบงาน เพราะสุ่มใหม่ทุกครั้ง)
function planKey(plan: DeliveryPlan): string {
  return plan.routes
    .map((route) => route.stops.map((stop) => stop.order_id).join('>'))
    .sort()
    .join('|');
}

function describeError(error: HttpErrorResponse): string {
  if (error.status === 0) {
    return 'ติดต่อ API ไม่ได้ กรุณาตรวจอินเทอร์เน็ตหรือ CORS';
  }

  const detail = error.error?.error;

  if (detail === 'This date already has a confirmed plan') {
    return 'วันนี้ยืนยันแผนไปแล้ว คำนวณใหม่ไม่ได้';
  }

  if (detail === 'No pending orders for this date') {
    return 'วันนี้ไม่มีออเดอร์ที่รอจัดส่ง';
  }

  return typeof detail === 'string'
    ? `ทำรายการไม่สำเร็จ (HTTP ${error.status}): ${detail}`
    : `ทำรายการไม่สำเร็จ (HTTP ${error.status}) กรุณาลองใหม่`;
}

// จำนวน variant ที่ลองได้สูงสุดต่อการกด "เสนอเส้นทางอื่น" 1 ครั้ง (ลองทีละคำขอ)
const MAX_TRIES = 5;

const STRATEGY_OPTIONS: { value: PlanStrategy; label: string; hint: string }[] = [
  { value: 'min-cost', label: 'ค่าส่งถูกที่สุด', hint: 'กำไรมากที่สุด' },
  { value: 'min-distance', label: 'ระยะทางสั้นที่สุด', hint: 'ประหยัดน้ำมัน' },
  { value: 'min-riders', label: 'ใช้ไรเดอร์น้อยที่สุด', hint: 'เรียกรถน้อยคัน' },
];

// แผน 1 แผนพร้อมค่าที่ใช้คำนวณ เพื่อขอแผนเดิมจาก backend ซ้ำได้
interface PlanState {
  plan: DeliveryPlan;
  strategy: PlanStrategy;
  variant: number;
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
  private readonly planService = inject(PlanService);

  readonly rules = DELIVERY_RULES;
  readonly today = todayBangkok();

  readonly orders = signal<Order[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  readonly strategyOptions = STRATEGY_OPTIONS;
  readonly strategy = signal<PlanStrategy>('min-cost');

  readonly current = signal<PlanState | null>(null);
  // แผนก่อนกด "เสนอเส้นทางอื่น" หรือเปลี่ยนเป้าหมาย ใช้เทียบและย้อนกลับ
  readonly previous = signal<PlanState | null>(null);

  // คำขอคำนวณ/ยืนยันทำได้ทีละรายการ
  readonly working = signal(false);
  readonly actionError = signal('');
  readonly notice = signal('');

  readonly plan = computed(() => this.current()?.plan ?? null);
  readonly variant = computed(() => this.current()?.variant ?? 0);
  readonly confirmed = computed(() => this.plan()?.status === 'confirmed');
  readonly busy = computed(() => this.loading() || this.working());

  readonly totalBoxes = computed(() =>
    this.orders().reduce((sum, order) => sum + order.box_quantity, 0),
  );

  // แผนร่างที่ไม่ตรงกับออเดอร์ปัจจุบัน (มีการเพิ่ม/ลบ/แก้ออเดอร์หลังคำนวณ)
  readonly outdated = computed(() => {
    const plan = this.plan();
    return (
      plan !== null &&
      plan.status === 'draft' &&
      (plan.total_boxes !== this.totalBoxes() ||
        plan.routes.reduce((sum, route) => sum + route.stops.length, 0) !== this.orders().length)
    );
  });

  // ผลต่างของแผนปัจจุบันเทียบกับแผนก่อนหน้า (ค่าบวก = แผนใหม่มากกว่า)
  readonly comparison = computed(() => {
    const plan = this.plan();
    const previous = this.previous()?.plan;
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
    this.refresh();
  }

  // โหลดออเดอร์ที่รอส่งของวันนี้ และแผนที่บันทึกไว้แล้ว (ถ้ามี)
  refresh(): void {
    if (this.loading()) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');
    this.actionError.set('');
    this.notice.set('');
    this.previous.set(null);

    let pending = 2;
    const done = () => {
      pending--;
      if (pending === 0) this.loading.set(false);
    };
    const fail = (error: HttpErrorResponse) => {
      this.errorMessage.set(describeError(error));
      done();
    };

    this.orderService.getAll({ date: this.today, status: 'pending' }).subscribe({
      next: (data) => {
        this.orders.set(data);
        done();
      },
      error: fail,
    });

    // backend เรียงแผนที่ยืนยันแล้วไว้ก่อน ตามด้วย draft ล่าสุด
    this.planService
      .list(this.today)
      .pipe(
        switchMap((plans) =>
          plans.length
            ? this.planService
                .get(plans[0].id)
                .pipe(map((plan) => ({ plan, variant: plans[0].variant })))
            : of(null),
        ),
      )
      .subscribe({
        next: (saved) => {
          // backend ไม่ได้เก็บเป้าหมายของแผน จึงถือว่าเป็นเป้าหมายที่เลือกอยู่
          this.current.set(saved ? { ...saved, strategy: this.strategy() } : null);
          done();
        },
        error: fail,
      });
  }

  // คำนวณใหม่ตั้งแต่ต้นด้วยเป้าหมายที่เลือกอยู่
  calculate(): void {
    this.request(this.strategy(), 0, () => this.previous.set(null));
  }

  // เปลี่ยนเป้าหมาย ถ้ามีแผนร่างอยู่แล้วให้คำนวณใหม่ทันทีและเก็บแผนเดิมไว้เทียบ
  selectStrategy(strategy: PlanStrategy): void {
    if (strategy === this.strategy()) {
      return;
    }

    this.strategy.set(strategy);
    const current = this.current();
    if (current && !this.confirmed()) {
      this.request(strategy, 0, () => this.previous.set(current));
    }
  }

  // เสนอแผนอื่น ถ้า variant ถัดไปได้แผนเดิมซ้ำ ให้ลองต่ออีกไม่เกิน MAX_TRIES ครั้ง
  suggestAnother(): void {
    const current = this.current();
    if (!current || this.working()) {
      return;
    }

    const currentKey = planKey(current.plan);
    this.working.set(true);
    this.actionError.set('');
    this.notice.set('');

    const attempt = (variant: number, triesLeft: number) => {
      this.planService.calculate(current.strategy, variant, this.today).subscribe({
        next: (plan) => {
          if (planKey(plan) !== currentKey) {
            this.previous.set(current);
            this.current.set({ plan, strategy: current.strategy, variant });
            this.working.set(false);
          } else if (triesLeft > 1) {
            attempt(variant + 1, triesLeft - 1);
          } else {
            // backend บันทึกแผนล่าสุดทับไปแล้ว แต่เส้นทางเหมือนเดิม จึงใช้แผนนี้แทน (เลขใบงานใหม่)
            this.current.set({ plan, strategy: current.strategy, variant });
            this.notice.set('ไม่พบเส้นทางแบบอื่นที่ต่างจากเดิม แผนนี้น่าจะดีที่สุดแล้วสำหรับเป้าหมายนี้');
            this.working.set(false);
          }
        },
        error: (error: HttpErrorResponse) => {
          this.actionError.set(describeError(error));
          this.working.set(false);
        },
      });
    };

    attempt(current.variant + 1, MAX_TRIES);
  }

  // กลับไปใช้แผนก่อนหน้า backend เก็บแค่ร่างล่าสุด จึงต้องขอคำนวณแผนนั้นซ้ำ (ได้เส้นทางเดิม)
  usePreviousPlan(): void {
    const previous = this.previous();
    const current = this.current();
    if (!previous || !current) {
      return;
    }

    this.request(previous.strategy, previous.variant, () => {
      this.previous.set(current);
      this.strategy.set(previous.strategy);
    });
  }

  private request(strategy: PlanStrategy, variant: number, onSuccess: () => void): void {
    if (this.working()) {
      return;
    }

    this.working.set(true);
    this.actionError.set('');
    this.notice.set('');

    this.planService.calculate(strategy, variant, this.today).subscribe({
      next: (plan) => {
        onSuccess();
        this.current.set({ plan, strategy, variant });
        this.working.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.actionError.set(describeError(error));
        this.working.set(false);
      },
    });
  }
}
