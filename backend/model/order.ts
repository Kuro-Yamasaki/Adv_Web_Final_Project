export interface OrderPostRequest {
  customer_id: number;
  box_quantity: number;
}
export const ORDER_STATUSES = ["pending", "assigned", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];