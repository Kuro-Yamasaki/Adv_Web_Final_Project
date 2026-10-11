export interface Customer {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  latitude: number;
  longitude: number;
  distance_km?: number;
} 

export type CustomerInput = Omit<Customer, 'id' | 'distance_km'>;
