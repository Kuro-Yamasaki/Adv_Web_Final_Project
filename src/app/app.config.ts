import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { applySettings, ShopSettings } from './shop.config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),

    // โหลดพิกัดร้านจาก backend ก่อนแสดงหน้าแรก
    provideAppInitializer(async () => {
      const http = inject(HttpClient); // ต้องเรียกก่อน await
      try {
        const settings = await firstValueFrom(
          http.get<ShopSettings>('https://adv-web-api.onrender.com/settings'),
        );
        applySettings(settings);
      } catch {
        console.warn('โหลด /settings ไม่สำเร็จ ใช้พิกัดร้านค่าเริ่มต้นแทน');
      }
    }),
  ],
};