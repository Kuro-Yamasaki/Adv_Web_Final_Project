USE FoodDelivery;

ALTER TABLE orders
  ADD COLUMN delivery_date DATE NULL AFTER ordered_at,
  ADD COLUMN status ENUM('pending','assigned','delivered','cancelled')
    NOT NULL DEFAULT 'pending' AFTER delivery_date;

-- เติมวันที่ให้ออเดอร์เก่าที่มีอยู่ แล้วค่อยบังคับ NOT NULL
UPDATE orders SET delivery_date = DATE(ordered_at) WHERE delivery_date IS NULL;
ALTER TABLE orders MODIFY delivery_date DATE NOT NULL;

CREATE INDEX idx_orders_date_status ON orders (delivery_date, status);