export interface Order {
  id: number;
  customer_id: number;
  first_name: string;
  last_name: string;
  phone: string;
  box_quantity: number;
  ordered_at: string;
  // MySQL DECIMAL อาจถูกส่งมาเป็น string
  delivery_latitude: number | string;
  delivery_longitude: number | string;
  // MySQL BOOLEAN ถูกส่งมาเป็น 0 / 1
  is_simulated: number | boolean;
}

export interface OrderInput {
  customer_id: number;
  box_quantity: number;
}

export interface SimulateOrdersResult {
  message: string;
  created_orders: number;
  total_boxes: number;
  available_customers: number;
}
