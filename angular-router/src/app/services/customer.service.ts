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
}