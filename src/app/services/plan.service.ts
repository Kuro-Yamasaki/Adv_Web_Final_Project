import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DeliveryPlan, PlanStrategy, PlanSummary, RiderJob } from '../models/delivery-plan';
import { OrderStatus } from '../models/order';

@Injectable({
    providedIn: 'root',
})
export class PlanService {
    private readonly http = inject(HttpClient);

    private readonly apiUrl =
        'https://adv-web-api.onrender.com/plans';

    // คำนวณแผนจากออเดอร์ pending แล้วบันทึกเป็น draft (backend เก็บแค่ draft ล่าสุดของวัน)
    // 400 = วันนั้นไม่มีออเดอร์รอส่ง, 409 = วันนั้นยืนยันแผนไปแล้ว
    calculate(
        strategy: PlanStrategy,
        variant: number,
        date?: string,
    ): Observable<DeliveryPlan> {
        return this.http.post<DeliveryPlan>(this.apiUrl, { strategy, variant, date });
    }

    // แผนของวันนั้น แผนที่ยืนยันแล้วมาก่อน ตามด้วยแผนใหม่สุด
    list(date?: string): Observable<PlanSummary[]> {
        return this.http.get<PlanSummary[]>(this.apiUrl, {
            params: date ? { date } : {},
        });
    }

    get(id: number): Observable<DeliveryPlan> {
        return this.http.get<DeliveryPlan>(`${this.apiUrl}/${id}`);
    }

    // ยืนยันแผน ออเดอร์ในแผนจะเปลี่ยนเป็น assigned
    // 409 = ยืนยันไปแล้ว หรือออเดอร์เปลี่ยนหลังคำนวณ (ต้องคำนวณใหม่)
    confirm(id: number): Observable<DeliveryPlan> {
        return this.http.post<DeliveryPlan>(`${this.apiUrl}/${id}/confirm`, {});
    }

    // ไรเดอร์กดส่งแล้วทีละจุด ใช้ได้เฉพาะแผนที่ยืนยันแล้ว (409 ถ้ายังไม่ยืนยัน)
    // กดซ้ำได้ ถ้าส่งแล้วอยู่แล้ว backend ตอบสำเร็จเหมือนเดิม
    markDelivered(
        jobCode: string,
        orderId: number,
    ): Observable<{ order_id: number; status: OrderStatus }> {
        return this.http.post<{ order_id: number; status: OrderStatus }>(
            `${this.apiUrl}/jobs/${encodeURIComponent(jobCode)}/stops/${orderId}/delivered`,
            {},
        );
    }

    // ดึงใบงานของไรเดอร์ 1 คนจากเลขใบงาน (backend ตอบ 404 ถ้าไม่พบ)
    getJob(jobCode: string): Observable<RiderJob> {
        return this.http.get<RiderJob>(
            `${this.apiUrl}/jobs/${encodeURIComponent(jobCode)}`,
        );
    }
}
