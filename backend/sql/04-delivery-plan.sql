USE FoodDelivery;

-- แผนการส่ง 1 ครั้ง (กดคำนวณ 1 ครั้ง = 1 แผน)
CREATE TABLE IF NOT EXISTS delivery_plan (
  id INT NOT NULL AUTO_INCREMENT,
  plan_date DATE NOT NULL,
  status ENUM('draft','confirmed') NOT NULL DEFAULT 'draft',
  seed INT NOT NULL,
  total_boxes INT NOT NULL,
  total_distance_km DECIMAL(8,3) NOT NULL,
  revenue DECIMAL(10,2) NOT NULL,
  food_cost DECIMAL(10,2) NOT NULL,
  rider_fee DECIMAL(10,2) NOT NULL,
  profit DECIMAL(10,2) NOT NULL,
  latest_finish_at TIME NOT NULL,
  late_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_plan_date (plan_date, status)
) ENGINE=InnoDB;

-- ไรเดอร์ 1 คน ในแผน
CREATE TABLE IF NOT EXISTS plan_route (
  id INT NOT NULL AUTO_INCREMENT,
  plan_id INT NOT NULL,
  rider_no INT NOT NULL,
  job_code VARCHAR(12) NOT NULL,
  color VARCHAR(7) NOT NULL,
  total_boxes INT NOT NULL,
  distance_km DECIMAL(8,3) NOT NULL,
  duration_min INT NOT NULL,
  finish_at TIME NOT NULL,
  rider_fee DECIMAL(10,2) NOT NULL,
  late BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_job_code (job_code),
  UNIQUE KEY uq_plan_rider (plan_id, rider_no),
  CONSTRAINT fk_route_plan FOREIGN KEY (plan_id)
    REFERENCES delivery_plan(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- จุดส่งแต่ละจุด เรียงตาม seq (1, 2, 3)
CREATE TABLE IF NOT EXISTS plan_stop (
  id INT NOT NULL AUTO_INCREMENT,
  route_id INT NOT NULL,
  seq TINYINT NOT NULL,
  order_id INT NOT NULL,
  leg_km DECIMAL(8,3) NOT NULL,
  arrive_at TIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_route_seq (route_id, seq),
  CONSTRAINT fk_stop_route FOREIGN KEY (route_id)
    REFERENCES plan_route(id) ON DELETE CASCADE,
  CONSTRAINT fk_stop_order FOREIGN KEY (order_id)
    REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT chk_stop_seq CHECK (seq BETWEEN 1 AND 3)
) ENGINE=InnoDB;