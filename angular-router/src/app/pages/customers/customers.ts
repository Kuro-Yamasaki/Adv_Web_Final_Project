import { Component, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { Customer } from '../../models/customer';
import { CustomerService } from '../../services/customer.service';

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [ReactiveFormsModule],
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
  readonly saving = signal(false);
  readonly formError = signal('');
  readonly successMessage = signal('');

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

  ngOnInit(): void {
    this.loadCustomers();
  }

  loadCustomers(): void {
    if (this.loading()) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    this.customerService.getAll().subscribe({
      next: (data) => {
        this.customers.set(data);
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

  openAddForm(): void {
    this.customerForm.reset();
    this.formError.set('');
    this.successMessage.set('');
    this.showAddForm.set(true);
  }

  cancelAddForm(): void {
    if (this.saving()) {
      return;
    }

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

    // Validators.required ไม่ปฏิเสธข้อความที่เป็นช่องว่างล้วน
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

    this.saving.set(true);

    this.customerService
      .create({
        first_name: firstName,
        last_name: lastName,
        phone,
        latitude,
        longitude,
      })
      .subscribe({
        next: (result) => {
          this.saving.set(false);
          this.customerForm.reset();
          this.showAddForm.set(false);

          this.successMessage.set(
            `เพิ่มลูกค้าสำเร็จ รหัสลูกค้า ${result.last_idx}`,
          );

          this.loadCustomers();
        },
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);

          this.formError.set(
            error.status === 0
              ? 'ติดต่อ API ไม่ได้ กรุณาตรวจอินเทอร์เน็ตหรือ CORS'
              : `บันทึกไม่สำเร็จ (HTTP ${error.status}) กรุณาตรวจข้อมูลแล้วลองใหม่`,
          );
        },
      });
  }
}