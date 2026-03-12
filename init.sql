-- FoodKiosk init.sql
CREATE DATABASE IF NOT EXISTS fk_auth;
CREATE DATABASE IF NOT EXISTS fk_company;
CREATE DATABASE IF NOT EXISTS fk_catalog;
CREATE DATABASE IF NOT EXISTS fk_order;
CREATE DATABASE IF NOT EXISTS fk_payment;

CREATE USER IF NOT EXISTS 'fk_auth'@'%'    IDENTIFIED BY 'auth_pass';
CREATE USER IF NOT EXISTS 'fk_company'@'%' IDENTIFIED BY 'company_pass';
CREATE USER IF NOT EXISTS 'fk_catalog'@'%' IDENTIFIED BY 'catalog_pass';
CREATE USER IF NOT EXISTS 'fk_order'@'%'   IDENTIFIED BY 'order_pass';
CREATE USER IF NOT EXISTS 'fk_payment'@'%' IDENTIFIED BY 'payment_pass';

GRANT ALL ON fk_auth.*    TO 'fk_auth'@'%';
GRANT ALL ON fk_company.* TO 'fk_company'@'%';
GRANT ALL ON fk_catalog.* TO 'fk_catalog'@'%';
GRANT ALL ON fk_order.*   TO 'fk_order'@'%';
GRANT ALL ON fk_payment.* TO 'fk_payment'@'%';
FLUSH PRIVILEGES;

USE fk_company;
CREATE TABLE IF NOT EXISTS companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  document VARCHAR(20) UNIQUE,
  pin VARCHAR(8) UNIQUE NOT NULL,
  plan ENUM('free','starter','pro','enterprise') DEFAULT 'free',
  active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  name VARCHAR(80) NOT NULL,
  email VARCHAR(120) UNIQUE NOT NULL,
  password_hash VARCHAR(128) NOT NULL,
  role ENUM('owner','manager','cashier') DEFAULT 'cashier',
  active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);
CREATE TABLE IF NOT EXISTS terminals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  label VARCHAR(80) NOT NULL,
  terminal_code VARCHAR(20) NOT NULL,
  tef_number VARCHAR(40) NOT NULL,
  tef_serial VARCHAR(40),
  active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);
INSERT IGNORE INTO companies (id,name,document,pin,plan,active) VALUES
  (1,'Burger House','12.345.678/0001-99','1234','pro',1),
  (2,'Pasta & Co',  '98.765.432/0001-11','5678','starter',1),
  (3,'Sweet Corner','11.222.333/0001-44','9999','free',1);
INSERT IGNORE INTO terminals (id,company_id,label,terminal_code,tef_number,tef_serial,active) VALUES
  (1,1,'Totem 1 - Entrada','T01','TEF-001-A','SN123456',1),
  (2,1,'Totem 2 - Caixa',  'T02','TEF-001-B','SN123457',1),
  (3,2,'Totem 1 - Salão',  'T01','TEF-002-A','SN789012',1);

USE fk_order;
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL, terminal_id INT NOT NULL,
  order_ref VARCHAR(12) UNIQUE NOT NULL,
  status ENUM('pending','paid','completed','cancelled') DEFAULT 'pending',
  total DECIMAL(10,2) NOT NULL, discount DECIMAL(10,2) DEFAULT 0,
  cpf VARCHAR(14), created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL, product_id INT NOT NULL,
  product_name VARCHAR(120) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  subtotal DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
CREATE TABLE IF NOT EXISTS tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_item_id INT NOT NULL,
  ticket_code VARCHAR(12) UNIQUE NOT NULL,
  qr_data TEXT NOT NULL, qr_image MEDIUMTEXT,
  order_ref VARCHAR(12) NOT NULL,
  unit_number INT NOT NULL, total_units INT NOT NULL,
  status ENUM('printed','collected','expired') DEFAULT 'printed',
  printed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  collected_at DATETIME, collected_by VARCHAR(80),
  collection_device VARCHAR(64),
  FOREIGN KEY (order_item_id) REFERENCES order_items(id)
);

USE fk_payment;
CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL, order_ref VARCHAR(12) NOT NULL,
  terminal_id INT NOT NULL, tef_number VARCHAR(40) NOT NULL,
  method ENUM('credit','debit','pix') NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('pending','approved','refused','cancelled','error') DEFAULT 'pending',
  nsu VARCHAR(40), authorization VARCHAR(40),
  paygo_response TEXT, cancelled_at DATETIME,
  cancel_nsu VARCHAR(40), cancel_auth VARCHAR(40),
  cancel_reason VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP
);