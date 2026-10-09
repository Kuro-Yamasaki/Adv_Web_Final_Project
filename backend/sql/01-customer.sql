-- Run once on your MySQL server using an account allowed to create databases/tables.
CREATE DATABASE IF NOT EXISTS FoodDelivery CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE FoodDelivery;

CREATE TABLE IF NOT EXISTS customer (
  id INT NOT NULL AUTO_INCREMENT,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  PRIMARY KEY (id),
  CHECK (latitude BETWEEN -90 AND 90),
  CHECK (longitude BETWEEN -180 AND 180)
) ENGINE=InnoDB;
