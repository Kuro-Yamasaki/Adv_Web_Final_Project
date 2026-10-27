import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

const isRiderUrl = (url: string) => url.startsWith('/rider');

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly router = inject(Router);

  protected readonly title = signal('ส่งด่วนมื้อเที่ยง');

  // หน้าใบงานไรเดอร์ซ่อนเมนูของร้าน ไรเดอร์ที่เปิดลิงก์จาก LINE จะไม่เห็นหน้าจัดการลูกค้า/ออเดอร์
  protected readonly isRiderPage = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => isRiderUrl(event.urlAfterRedirects)),
    ),
    { initialValue: isRiderUrl(window.location.pathname) },
  );
}