import { Component, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { map } from 'rxjs';
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
  readonly editingId = signal<number | null>(null);
  readonly deleteTarget = signal<Customer | null>(null);
  readonly deleting = signal(false);
  readonly deleteError = signal('');
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
    if (this.loading() ||
      this.deleting() ||
      this.deleteTarget() !== null) {
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
    if (this.saving() || this.loading() || this.deleting() ||
      this.deleteTarget() !== null) {
      return;
    }

    this.editingId.set(null);
    this.customerForm.reset();
    this.formError.set('');
    this.successMessage.set('');
    this.showAddForm.set(true);

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
    this.showAddForm.set(true);
    this.deleting() ||
      this.deleteTarget() !== null
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