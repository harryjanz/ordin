-- FoodKiosk init.sql
-- SOMENTE DEV LOCAL. Cria bancos, usuários e grants.
-- Schema e seeds são gerenciados via Alembic (ORD-006): cada serviço roda
-- "alembic upgrade head" no startup antes de subir o uvicorn.
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
