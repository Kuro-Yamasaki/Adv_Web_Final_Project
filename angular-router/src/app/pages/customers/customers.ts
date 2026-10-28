import { Component, computed, inject, OnInit, signal, viewChild, } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators, } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, type Observable } from 'rxjs';
import { DecimalPipe } from '@angular/common';
import { CustomerMap } from '../../components/customer-map/customer-map';
import { Customer } from '../../models/customer';
import { CustomerService } from '../../services/customer.service';
import { DELIVERY_RADIUS_KM, GeoPoint, SHOP_LOCATION } from '../../shop.config';
import { distanceKm } from '../../utils/geo';

type CustomerFilter =
  | { type: 'all' }
  | { type: 'name'; keyword: string }
  | {
    type: 'nearby';
    latitude: number;
    longitude: number;
  };

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [ReactiveFormsModule, DecimalPipe, CustomerMap],
  templateUrl: './customers.html',
  styleUrl: './customers.css',
})
export class Customers implements OnInit {
  private readonly customerService = inject(CustomerService);
  private readonly fb = inject(FormBuilder);

  readonly customers = signal<Customer[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  readonly showAddForm = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly deleteTarget = signal<Customer | null>(null);
  readonly deleting = signal(false);
  readonly deleteError = signal('');
  readonly saving = signal(false);
  readonly formError = signal('');
  readonly successMessage = signal('');

  readonly activeFilter = signal<CustomerFilter>({ type: 'all' });
  readonly activeKeyword = computed(() => {
    const filter = this.activeFilter();
    return filter.type === 'name' ? filter.keyword : '';
  });
  readonly activeCenter = computed(() => {
    const filter = this.activeFilter();
    return filter.type === 'nearby' ? filter : null;
  });

  readonly nearbyError = signal('');
  readonly searchError = signal('');

  // แผงค้นลูกค้าใกล้จุด (ซ่อนไว้จนกว่าจะกดเปิด)
  readonly showNearby = signal(false);
  // รอให้ผู้ใช้คลิกจุดศูนย์กลางการค้นบนแผนที่
  readonly pickingCenter = signal(false);

  // ระหว่างโหลด บันทึก หรือรอยืนยันลบ ห้ามเริ่มงานอื่นซ้อน
  readonly busy = computed(
    () => this.loading() || this.saving() || this.deleting() || this.deleteTarget() !== null,
  );

  // คลิกแผนที่ได้เมื่อเปิดฟอร์มเพิ่ม/แก้ไข หรือกำลังเลือกจุดค้นหา
  readonly mapPickEnabled = computed(
    () => (this.showAddForm() && !this.saving()) || this.pickingCenter(),
  );

  readonly nearbyForm = this.fb.group({
    latitude: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(-90),
      Validators.max(90),
    ]),
    longitude: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(-180),
      Validators.max(180),
    ]),
  });

  readonly searchForm = this.fb.nonNullable.group({
    q: ['', [Validators.maxLength(100)]],
  });

  readonly customerForm = this.fb.group({
    first_name: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.maxLength(100),
    ]),
    last_name: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.maxLength(100),
    ]),
    phone: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.maxLength(20),
    ]),
    latitude: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(-90),
      Validators.max(90),
    ]),
    longitude: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(-180),
      Validators.max(180),
    ]),
  });

  readonly deliveryRadiusKm = DELIVERY_RADIUS_KM;
  private readonly customerMap = viewChild(CustomerMap);

  private readonly customerFormValue = toSignal(this.customerForm.valueChanges, {
    initialValue: this.customerForm.value,
  });

  // พิกัดในฟอร์มเพิ่ม/แก้ไข ใช้แสดงหมุดสีเขียวบนแผนที่
  readonly pickedPoint = computed<GeoPoint | null>(() => {
    if (!this.showAddForm()) {
      return null;
    }

    const { latitude, longitude } = this.customerFormValue();

    if (
      latitude == null ||
      longitude == null ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      return null;
    }

    return { latitude, longitude };
  });

  readonly pickedDistanceKm = computed(() => {
    const point = this.pickedPoint();
    return point ? distanceKm(SHOP_LOCATION, point) : null;
  });

  ngOnInit(): void {
    this.loadCustomers();
  }

  distanceFromShop(customer: Customer): number {
    return distanceKm(SHOP_LOCATION, customer);
  }

  fullName(customer: Customer): string {
    return `${customer.first_name} ${customer.last_name}`;
  }

  // คลิกหรือลากหมุดบนแผนที่
  // - กำลังเลือกจุดค้นหา → ค้นลูกค้าในรัศมี 1 กม. จากจุดนั้นทันที
  // - เปิดฟอร์มอยู่ → เติมพิกัดลงฟอร์ม
  onMapPick(raw: GeoPoint): void {
    const point: GeoPoint = {
      latitude: Number(raw.latitude.toFixed(6)),
      longitude: Number(raw.longitude.toFixed(6)),
    };

    if (this.pickingCenter()) {
      this.pickingCenter.set(false);
      this.nearbyForm.setValue(point);
      this.searchNearby();
      return;
    }

    if (!this.showAddForm() || this.saving()) {
      return;
    }

    this.customerForm.patchValue(point);
    this.customerForm.controls.latitude.markAsTouched();
    this.customerForm.controls.longitude.markAsTouched();
  }

  toggleNearby(): void {
    this.showNearby.update((open) => !open);
    this.pickingCenter.set(false);
  }

  startPickCenter(): void {
    if (this.busy() || this.showAddForm()) {
      return;
    }

    this.pickingCenter.update((picking) => !picking);
    this.nearbyError.set('');

    if (this.pickingCenter()) {
      this.scrollTo('customer-map-section');
    }
  }

  // ค้นลูกค้าในรัศมี 1 กม. รอบร้าน
  useShopAsCenter(): void {
    this.pickingCenter.set(false);
    this.nearbyForm.setValue({
      latitude: SHOP_LOCATION.latitude,
      longitude: SHOP_LOCATION.longitude,
    });
    this.searchNearby();
  }

  private scrollTo(id: string): void {
    // รอให้ Angular วาดส่วนที่เพิ่งเปิดก่อน แล้วค่อยเลื่อนไปหา
    setTimeout(() =>
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }

  showOnMap(customer: Customer): void {
    document
      .getElementById('customer-map-section')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    this.customerMap()?.focusCustomer(customer.id);
  }

  loadCustomers(
    filter: CustomerFilter = this.activeFilter(),
  ): void {
    if (
      this.loading() ||
      this.saving() ||
      this.deleting() ||
      this.deleteTarget() !== null
    ) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    let request$: Observable<Customer[]>;

    if (filter.type === 'name') {
      request$ = this.customerService.search(filter.keyword);
    } else if (filter.type === 'nearby') {
      request$ = this.customerService.nearby(
        filter.latitude,
        filter.longitude,
      );
    } else {
      request$ = this.customerService.getAll();
    }

    request$.subscribe({
      next: (data) => {
        this.customers.set(data);
        this.activeFilter.set(filter);

        this.searchForm.controls.q.setValue(
          filter.type === 'name' ? filter.keyword : '',
        );

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

  searchCustomers(): void {
    if (
      this.loading() ||
      this.saving() ||
      this.deleting() ||
      this.deleteTarget() !== null ||
      this.showAddForm()
    ) {
      return;
    }

    this.searchError.set('');
    this.successMessage.set('');
    this.searchForm.markAllAsTouched();

    if (this.searchForm.invalid) {
      this.searchError.set('คำค้นต้องไม่เกิน 100 ตัวอักษร');
      return;
    }

    const keyword = this.searchForm.controls.q.value.trim();

    this.nearbyError.set('');

    this.loadCustomers(
      keyword
        ? { type: 'name', keyword }
        : { type: 'all' },
    );
  }

  clearSearch(): void {
    if (
      this.loading() ||
      this.saving() ||
      this.deleting() ||
      this.deleteTarget() !== null ||
      this.showAddForm()
    ) {
      return;
    }

    this.searchForm.reset();
    this.nearbyForm.reset();
    this.searchError.set('');
    this.nearbyError.set('');
    this.successMessage.set('');

    this.loadCustomers({ type: 'all' });
  }

  searchNearby(): void {
    if (
      this.loading() ||
      this.saving() ||
      this.deleting() ||
      this.deleteTarget() !== null ||
      this.showAddForm()
    ) {
      return;
    }

    this.nearbyError.set('');
    this.searchError.set('');
    this.successMessage.set('');
    this.nearbyForm.markAllAsTouched();

    if (this.nearbyForm.invalid) {
      this.nearbyError.set(
        'กรุณากรอกละติจูด -90 ถึง 90 และลองจิจูด -180 ถึง 180',
      );
      return;
    }

    const { latitude, longitude } = this.nearbyForm.getRawValue();

    if (
      latitude === null ||
      longitude === null ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      this.nearbyError.set('กรุณากรอกพิกัดเป็นตัวเลขที่ถูกต้อง');
      return;
    }

    this.loadCustomers({
      type: 'nearby',
      latitude,
      longitude,
    });
  }

  openAddForm(): void {
    if (this.saving() || this.loading() || this.deleting() ||
      this.deleteTarget() !== null) {
      return;
    }

    this.editingId.set(null);
    this.customerForm.reset();
    this.formError.set('');
    this.successMessage.set('');
    this.pickingCenter.set(false);
    this.showAddForm.set(true);
    this.scrollTo('customer-map-section'); // แผนที่อยู่เหนือฟอร์ม เห็นทั้งคู่
  }

  openEditForm(customer: Customer): void {
    if (this.saving() || this.loading() || this.deleting() ||
      this.deleteTarget() !== null) {
      return;
    }

    this.editingId.set(customer.id);

    this.customerForm.reset({
      first_name: customer.first_name,
      last_name: customer.last_name,
      phone: customer.phone,
      latitude: customer.latitude,
      longitude: customer.longitude,
    });

    this.formError.set('');
    this.successMessage.set('');
    this.pickingCenter.set(false);
    this.showAddForm.set(true);
    this.scrollTo('customer-map-section'); // แผนที่อยู่เหนือฟอร์ม เห็นทั้งคู่
  }

  cancelAddForm(): void {
    if (this.saving()) {
      return;
    }

    this.editingId.set(null);
    this.customerForm.reset();
    this.formError.set('');
    this.showAddForm.set(false);
  }

  saveCustomer(): void {
    if (this.saving() || this.loading()) {
      return;
    }

    this.customerForm.markAllAsTouched();
    this.formError.set('');
    this.successMessage.set('');

    if (this.customerForm.invalid) {
      this.formError.set('กรุณากรอกข้อมูลให้ครบและตรวจช่วงค่าพิกัด');
      return;
    }

    const value = this.customerForm.getRawValue();

    const firstName = value.first_name.trim();
    const lastName = value.last_name.trim();
    const phone = value.phone.trim();
    const latitude = value.latitude;
    const longitude = value.longitude;

    if (!firstName || !lastName || !phone) {
      this.formError.set('ชื่อ นามสกุล และเบอร์โทรต้องไม่เป็นช่องว่าง');
      return;
    }

    if (
      latitude === null ||
      longitude === null ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      this.formError.set('กรุณากรอกพิกัดเป็นตัวเลขที่ถูกต้อง');
      return;
    }

    const data = {
      first_name: firstName,
      last_name: lastName,
      phone,
      latitude,
      longitude,
    };

    const id = this.editingId();

    // แปลงผลสำเร็จของทั้ง POST และ PUT ให้เป็นข้อความ
    const request$ =
      id === null
        ? this.customerService.create(data).pipe(
          map(
            (result) =>
              `เพิ่มลูกค้าสำเร็จ รหัสลูกค้า ${result.last_idx}`,
          ),
        )
        : this.customerService.update(id, data).pipe(
          map(() => `แก้ไขลูกค้ารหัส ${id} สำเร็จ`),
        );

    this.saving.set(true);

    request$.subscribe({
      next: (message) => {
        this.saving.set(false);
        this.customerForm.reset();
        this.editingId.set(null);
        this.showAddForm.set(false);
        this.successMessage.set(message);

        this.loadCustomers();
      },

      error: (error: HttpErrorResponse) => {
        this.saving.set(false);

        if (error.status === 0) {
          this.formError.set(
            'ติดต่อ API ไม่ได้ กรุณาตรวจอินเทอร์เน็ตหรือ CORS',
          );
        } else if (error.status === 404) {
          this.formError.set(
            'ไม่พบลูกค้ารายนี้ อาจถูกลบไปแล้ว กรุณายกเลิกและโหลดข้อมูลใหม่',
          );
        } else {
          this.formError.set(
            `บันทึกไม่สำเร็จ (HTTP ${error.status}) กรุณาตรวจข้อมูลแล้วลองใหม่`,
          );
        }
      },
    });
  }

  openDeleteConfirmation(customer: Customer): void {
    if (
      this.loading() ||
      this.saving() ||
      this.deleting() ||
      this.showAddForm()
    ) {
      return;
    }

    this.deleteTarget.set(customer);
    this.deleteError.set('');
    this.successMessage.set('');
    this.pickingCenter.set(false);
    this.scrollTo('customer-delete');
  }

  cancelDelete(): void {
    if (this.deleting()) {
      return;
    }

    this.deleteTarget.set(null);
    this.deleteError.set('');
  }

  confirmDelete(): void {
    const customer = this.deleteTarget();

    if (
      !customer ||
      this.loading() ||
      this.saving() ||
      this.deleting()
    ) {
      return;
    }

    this.deleting.set(true);
    this.deleteError.set('');

    this.customerService.remove(customer.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleteTarget.set(null);

        this.successMessage.set(
          `ลบลูกค้ารหัส ${customer.id} สำเร็จ`,
        );

        this.loadCustomers();
      },

      error: (error: HttpErrorResponse) => {
        this.deleting.set(false);

        if (error.status === 409) {
          this.deleteError.set(
            'ลบไม่ได้ เพราะลูกค้ารายนี้มีออเดอร์อ้างอิงอยู่',
          );
        } else if (error.status === 404) {
          this.deleteError.set(
            'ไม่พบลูกค้ารายนี้ อาจถูกลบไปแล้ว กรุณายกเลิกและโหลดข้อมูลใหม่',
          );
        } else if (error.status === 0) {
          this.deleteError.set(
            'ติดต่อ API ไม่ได้ กรุณาตรวจอินเทอร์เน็ตหรือ CORS',
          );
        } else {
          this.deleteError.set(
            `ลบไม่สำเร็จ (HTTP ${error.status}) กรุณาลองใหม่`,
          );
        }
      },
    });
  }

}