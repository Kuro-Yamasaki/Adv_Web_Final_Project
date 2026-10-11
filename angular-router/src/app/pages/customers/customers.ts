import { Component, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';

import { Customer } from '../../models/customer';
import { CustomerService } from '../../services/customer.service';

@Component({
  selector: 'app-customers',
  standalone: true,
  templateUrl: './customers.html',
  styleUrl: './customers.css',
})
export class Customers implements OnInit {
  private readonly customerService = inject(CustomerService);

  readonly customers = signal<Customer[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  ngOnInit(): void {
    this.loadCustomers();
  }

  loadCustomers(): void {
    // ป้องกันการกดโหลดซ้ำระหว่างรอคำตอบ
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
        if (error.status === 0) {
          this.errorMessage.set(
            'ติดต่อ API ไม่ได้ กรุณาตรวจอินเทอร์เน็ตหรือการตั้งค่า CORS',
          );
        } else {
          this.errorMessage.set(
            `โหลดข้อมูลไม่สำเร็จ (HTTP ${error.status}) กรุณาลองใหม่`,
          );
        }

        this.loading.set(false);
      },
    });
  }
}