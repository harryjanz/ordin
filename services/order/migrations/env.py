import os, sys
os.environ.setdefault("DB_URL", "mysql+pymysql://placeholder:placeholder@localhost/fk_order")
os.environ.setdefault("JWT_SECRET", "placeholder")
os.environ.setdefault("INTERNAL_SECRET", "placeholder")
os.environ.setdefault("QR_SECRET", "placeholder")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")

from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from main import Base
from config import require_env

config = context.config
config.set_main_option("sqlalchemy.url", require_env("DB_URL").replace("mysql+aiomysql://", "mysql+pymysql://"))
if config.config_file_name:
    fileConfig(config.config_file_name)
target_metadata = Base.metadata


def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
