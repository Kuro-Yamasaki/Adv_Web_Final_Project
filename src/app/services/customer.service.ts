import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Customer, CustomerInput } from '../models/customer';

@Injectable({
    providedIn: 'root',
})
export class CustomerService {
    private readonly http = inject(HttpClient);

    private readonly apiUrl =
        'https://adv-web-api.onrender.com/customer';

    getAll(): Observable<Customer[]> {
        return this.http.get<Customer[]>(this.apiUrl);
    }
    create(
        data: CustomerInput,
    ): Observable<{ affected_row: number; last_idx: number }> {
        return this.http.post<{
            affected_row: number;
            last_idx: number;
        }>(this.apiUrl, data);
    }

    update(
        id: number,
        data: CustomerInput,
    ): Observable<{ message: string; affected_row: number }> {
        return this.http.put<{
            message: string;
            affected_row: number;
        }>(`${this.apiUrl}/${id}`, data);
    }

    remove(id: number): Observable<{ affected_row: number }> {
        return this.http.delete<{ affected_row: number }>(
            `${this.apiUrl}/${id}`,
        );
    }

    search(keyword: string): Observable<Customer[]> {
        return this.http.get<Customer[]>(`${this.apiUrl}/search`, {
            params: {
                q: keyword,
            },
        });
    }

    nearby(
        latitude: number,
        longitude: number,
    ): Observable<Customer[]> {
        return this.http.get<Customer[]>(`${this.apiUrl}/nearby`, {
            params: {
                latitude: latitude.toString(),
                longitude: longitude.toString(),
            },
        });
    }
}