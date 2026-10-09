USE FoodDelivery;

CREATE TABLE IF NOT EXISTS orders (
  id INT NOT NULL AUTO_INCREMENT,
  customer_id INT NOT NULL,
  box_quantity INT NOT NULL,
  ordered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivery_latitude DECIMAL(10,7) NOT NULL,
  delivery_longitude DECIMAL(10,7) NOT NULL,
  is_simulated BOOLEAN NOT NULL DEFAULT FALSE,

  PRIMARY KEY (id),

  CONSTRAINT fk_orders_customer
    FOREIGN KEY (customer_id)
    REFERENCES customer(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT chk_orders_box_quantity
    CHECK (box_quantity BETWEEN 1 AND 3),

  CONSTRAINT chk_orders_latitude
    CHECK (delivery_latitude BETWEEN -90 AND 90),

  CONSTRAINT chk_orders_longitude
    CHECK (delivery_longitude BETWEEN -180 AND 180)
) ENGINE=InnoDB;