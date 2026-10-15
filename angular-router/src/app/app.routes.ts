import { Routes } from '@angular/router';

// โหลดแต่ละหน้าเมื่อเปิดใช้ (lazy) เพื่อให้ไฟล์เริ่มต้นเล็ก
export const routes: Routes = [
  {
    path: '',
    redirectTo: 'customers',
    pathMatch: 'full',
  },
  {
    path: 'customers',
    loadComponent: () => import('./pages/customers/customers').then((m) => m.Customers),
  },
  {
    path: 'orders',
    loadComponent: () => import('./pages/orders/orders').then((m) => m.Orders),
  },
  {
    path: '**',
    redirectTo: 'customers',
  },
];
