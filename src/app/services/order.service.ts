import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Order, OrderInput, OrderStatus, SimulateOrdersResult } from '../models/order';

@Injectable({
    providedIn: 'root',
})
export class OrderService {
    private readonly http = inject(HttpClient);

    private readonly apiUrl =
        'https://adv-web-api.onrender.com/orders';

    // กรองตามวันส่ง (YYYY-MM-DD) และ/หรือสถานะได้
    getAll(filter: { date?: string; status?: OrderStatus } = {}): Observable<Order[]> {
        return this.http.get<Order[]>(this.apiUrl, { params: { ...filter } });
    }

    create(
        data: OrderInput,
    ): Observable<{ affected_row: number; last_idx: number }> {
        return this.http.post<{
            affected_row: number;
            last_idx: number;
        }>(this.apiUrl, data);
    }

    // แก้ได้เฉพาะจำนวนกล่อง
    updateQuantity(
        id: number,
        boxQuantity: number,
    ): Observable<{ message: string; affected_row: number }> {
        return this.http.patch<{
            message: string;
            affected_row: number;
        }>(`${this.apiUrl}/${id}`, { box_quantity: boxQuantity });
    }

    remove(id: number): Observable<{ affected_row: number }> {
        return this.http.delete<{ affected_row: number }>(
            `${this.apiUrl}/${id}`,
        );
    }

    simulate(count: number): Observable<SimulateOrdersResult> {
        return this.http.post<SimulateOrdersResult>(
            `${this.apiUrl}/simulate`,
            { count },
        );
    }

    clearSimulated(): Observable<{ message: string; affected_row: number }> {
        return this.http.delete<{
            message: string;
            affected_row: number;
        }>(`${this.apiUrl}/simulated`);
    }
}
