import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RiderJob } from '../models/delivery-plan';

@Injectable({
    providedIn: 'root',
})
export class PlanService {
    private readonly http = inject(HttpClient);

    private readonly apiUrl =
        'https://adv-web-api.onrender.com/plans';

    // ดึงใบงานของไรเดอร์ 1 คนจากเลขใบงาน (backend ตอบ 404 ถ้าไม่พบ)
    getJob(jobCode: string): Observable<RiderJob> {
        return this.http.get<RiderJob>(
            `${this.apiUrl}/jobs/${encodeURIComponent(jobCode)}`,
        );
    }
}
