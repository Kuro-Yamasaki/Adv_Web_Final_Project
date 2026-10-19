import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { Observable } from 'rxjs';
import { Customer } from '../../models/customer';
import { Order, OrderStatus } from '../../models/order';
import { CustomerService } from '../../services/customer.service';
import { OrderService } from '../../services/order.service';

type Panel = 'none' | 'add' | 'simulate' | 'clear' | 'delete';

function describeError(error: HttpErrorResponse): string {
  if (error.status === 0) {
    return 'ติดต่อ API ไม่ได้ กรุณาตรวจอินเทอร์เน็ตหรือ CORS';
  }

  if (error.status === 404) {
    return 'ไม่พบข้อมูลนี้ อาจถูกลบไปแล้ว กรุณาโหลดข้อมูลใหม่';
  }

  const detail = error.error?.error;

  if (detail === 'Please add customers before simulating orders') {
    return 'ยังไม่มีลูกค้าในระบบ กรุณาเพิ่มลูกค้าก่อนจำลองออเดอร์';
  }

  if (detail === 'Only pending orders can be changed' || detail === 'Only pending orders can be deleted') {
    return 'ออเดอร์นี้แจกให้ไรเดอร์แล้ว แก้ไขหรือลบไม่ได้ กรุณาโหลดข้อมูลใหม่';
  }

  return typeof detail === 'string'
    ? `ทำรายการไม่สำเร็จ (HTTP ${error.status}): ${detail}`
    : `ทำรายการไม่สำเร็จ (HTTP ${error.status}) กรุณาลองใหม่`;
}

// วันที่วันนี้ตามเวลาไทย รูปแบบ YYYY-MM-DD (ตรงกับ delivery_date ที่ backend บันทึก)
function todayBangkok(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
}

type DateFilter = 'today' | 'all';
type StatusFilter = OrderStatus | 'all';

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'รอจัดส่ง',
  assigned: 'แจกงานแล้ว',
  delivered: 'ส่งแล้ว',
  cancelled: 'ยกเลิก',
};

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, RouterLink],
  templateUrl: './orders.html',
  styleUrl: './orders.css',
})
export class Orders implements OnInit {
  private readonly orderService = inject(OrderService);
  private readonly customerService = inject(CustomerService);
  private readonly fb = inject(FormBuilder);

  readonly quantityOptions = [1, 2, 3];

  readonly orders = signal<Order[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  readonly customers = signal<Customer[]>([]);
  readonly loadingCustomers = signal(false);
  readonly customerError = signal('');

  // คำขอที่เขียนข้อมูล (เพิ่ม แก้ ลบ จำลอง ล้าง) ทำได้ทีละรายการ
  readonly working = signal(false);
  readonly actionError = signal('');
  readonly successMessage = signal('');

  readonly panel = signal<Panel>('none');
  readonly deleteTarget = signal<Order | null>(null);
  readonly editingId = signal<number | null>(null);

  readonly busy = computed(() => this.loading() || this.working());
  readonly locked = computed(
    () => this.busy() || this.panel() !== 'none' || this.editingId() !== null,
  );

  readonly today = todayBangkok();
  readonly statusLabels = STATUS_LABELS;
  readonly statusOptions = Object.keys(STATUS_LABELS) as OrderStatus[];
  readonly dateFilter = signal<DateFilter>('today');
  readonly statusFilter = signal<StatusFilter>('all');

  // ออเดอร์ที่แสดงในตารางตามตัวกรอง (กรองฝั่งหน้าเว็บ สลับตัวกรองได้โดยไม่ต้องโหลดใหม่)
  readonly visibleOrders = computed(() =>
    this.orders().filter(
      (order) =>
        (this.dateFilter() === 'all' || order.delivery_date === this.today) &&
        (this.statusFilter() === 'all' || order.status === this.statusFilter()),
    ),
  );

  readonly totalBoxes = computed(() =>
    this.visibleOrders().reduce((sum, order) => sum + order.box_quantity, 0),
  );
  readonly pendingCount = computed(
    () => this.visibleOrders().filter((order) => order.status === 'pending').length,
  );
  readonly simulatedCount = computed(
    () => this.orders().filter((order) => this.isSimulated(order)).length,
  );

  readonly addForm = this.fb.group({
    customer_id: this.fb.control<number | null>(null, [Validators.required]),
    box_quantity: this.fb.nonNullable.control(1, [
      Validators.required,
      Validators.min(1),
      Validators.max(3),
    ]),
  });

  readonly simulateForm = this.fb.nonNullable.group({
    count: [25, [Validators.required, Validators.min(20), Validators.max(30)]],
  });

  readonly editQuantity = this.fb.nonNullable.control(1, [
    Validators.required,
    Validators.min(1),
    Validators.max(3),
  ]);

  ngOnInit(): void {
    this.loadOrders();
  }

  isSimulated(order: Order): boolean {
    return Boolean(Number(order.is_simulated));
  }

  loadOrders(): void {
    if (this.loading()) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    this.orderService.getAll().subscribe({
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

  private loadCustomers(): void {
    this.loadingCustomers.set(true);
    this.customerError.set('');

    this.customerService.getAll().subscribe({
      next: (data) => {
        this.customers.set(data);
        this.loadingCustomers.set(false);
      },

      error: (error: HttpErrorResponse) => {
        this.customerError.set(describeError(error));
        this.loadingCustomers.set(false);
      },
    });
  }

  private openPanel(panel: Panel): boolean {
    if (this.locked()) {
      return false;
    }

    this.actionError.set('');
    this.successMessage.set('');
    this.panel.set(panel);
    return true;
  }

  closePanel(): void {
    if (this.working()) {
      return;
    }

    this.panel.set('none');
    this.deleteTarget.set(null);
    this.actionError.set('');
  }

  openAddForm(): void {
    if (!this.openPanel('add')) {
      return;
    }

    this.addForm.reset({ customer_id: null, box_quantity: 1 });

    // โหลดลูกค้าใหม่ทุกครั้ง เผื่อเพิ่งเพิ่มลูกค้าจากอีกหน้า
    this.loadCustomers();
  }

  openSimulateForm(): void {
    if (this.openPanel('simulate')) {
      this.simulateForm.reset({ count: 25 });
    }
  }

  openClearConfirmation(): void {
    this.openPanel('clear');
  }

  // แก้หรือลบได้เฉพาะออเดอร์ที่ยังไม่แจกให้ไรเดอร์ (backend ก็ตรวจซ้ำ)
  isEditable(order: Order): boolean {
    return order.status === 'pending';
  }

  setDateFilter(value: string): void {
    this.dateFilter.set(value as DateFilter);
  }

  setStatusFilter(value: string): void {
    this.statusFilter.set(value as StatusFilter);
  }

  openDeleteConfirmation(order: Order): void {
    if (!this.isEditable(order)) {
      return;
    }

    if (this.openPanel('delete')) {
      this.deleteTarget.set(order);
    }
  }

  saveOrder(): void {
    if (this.working()) {
      return;
    }

    this.addForm.markAllAsTouched();

    const { customer_id, box_quantity } = this.addForm.getRawValue();

    if (this.addForm.invalid || customer_id === null) {
      this.actionError.set('กรุณาเลือกลูกค้าและจำนวนกล่อง 1–3 กล่อง');
      return;
    }

    this.submit(
      this.orderService.create({ customer_id, box_quantity }),
      (result) => `เพิ่มออเดอร์สำเร็จ รหัสออเดอร์ ${result.last_idx}`,
    );
  }

  simulateOrders(): void {
    if (this.working()) {
      return;
    }

    this.simulateForm.markAllAsTouched();

    const { count } = this.simulateForm.getRawValue();

    if (this.simulateForm.invalid || !Number.isInteger(count)) {
      this.actionError.set('จำนวนออเดอร์ต้องเป็นจำนวนเต็ม 20–30');
      return;
    }

    this.submit(
      this.orderService.simulate(count),
      (result) =>
        `จำลองออเดอร์สำเร็จ ${result.created_orders} รายการ ` +
        `รวม ${result.total_boxes} กล่อง ` +
        `(จากลูกค้า ${result.available_customers} คน)`,
    );
  }

  confirmClearSimulated(): void {
    if (this.working()) {
      return;
    }

    this.submit(
      this.orderService.clearSimulated(),
      (result) => `ล้างออเดอร์จำลองแล้ว ${result.affected_row} รายการ`,
    );
  }

  confirmDelete(): void {
    const order = this.deleteTarget();

    if (!order || this.working()) {
      return;
    }

    this.submit(
      this.orderService.remove(order.id),
      () => `ลบออเดอร์รหัส ${order.id} สำเร็จ`,
    );
  }

  startEdit(order: Order): void {
    if (this.locked() || !this.isEditable(order)) {
      return;
    }

    this.actionError.set('');
    this.successMessage.set('');
    this.editQuantity.setValue(order.box_quantity);
    this.editingId.set(order.id);
  }

  cancelEdit(): void {
    if (this.working()) {
      return;
    }

    this.editingId.set(null);
    this.actionError.set('');
  }

  saveEdit(order: Order): void {
    if (this.working()) {
      return;
    }

    const quantity = this.editQuantity.value;

    if (this.editQuantity.invalid) {
      this.actionError.set('จำนวนกล่องต้องอยู่ระหว่าง 1–3');
      return;
    }

    if (quantity === order.box_quantity) {
      this.cancelEdit();
      return;
    }

    this.submit(
      this.orderService.updateQuantity(order.id, quantity),
      () => `แก้ไขออเดอร์รหัส ${order.id} เป็น ${quantity} กล่องสำเร็จ`,
    );
  }

  // ส่งคำขอเขียนข้อมูล ถ้าสำเร็จจะปิดฟอร์มและโหลดออเดอร์ใหม่
  private submit<T>(request$: Observable<T>, toMessage: (result: T) => string): void {
    this.working.set(true);
    this.actionError.set('');
    this.successMessage.set('');

    request$.subscribe({
      next: (result) => {
        this.working.set(false);
        this.panel.set('none');
        this.deleteTarget.set(null);
        this.editingId.set(null);
        this.successMessage.set(toMessage(result));

        this.loadOrders();
      },

      error: (error: HttpErrorResponse) => {
        this.working.set(false);
        this.actionError.set(describeError(error));
      },
    });
  }
}
