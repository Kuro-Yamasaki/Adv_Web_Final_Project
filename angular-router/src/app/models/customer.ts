export interface Customer {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  latitude: number;
  longitude: number;
} 

export type CustomerInput = Omit<Customer, 'id'>;