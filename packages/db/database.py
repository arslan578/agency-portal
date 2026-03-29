from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from pathlib import Path

# Load .env from project root (same as api_gateway) so DATABASE_URL is always correct
try:
    from dotenv import load_dotenv
    _root = Path(__file__).resolve().parent.parent.parent  # packages/db -> project root
    _env_path = _root / ".env"
    if _env_path.exists():
        load_dotenv(dotenv_path=_env_path)
except ImportError:
    pass  # dotenv not installed, rely on system env vars

if os.getenv("TEST_MODE", "false").lower() == "true":
    DATABASE_URL = "sqlite:///:memory:"
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    if os.getenv("DATABASE_URL"):
        DATABASE_URL = os.getenv("DATABASE_URL")
    else:
        user = os.getenv("DB_USER", "user")
        password = os.getenv("DB_PASSWORD", "password")
        host = os.getenv("DB_HOST", "db")
        port = os.getenv("DB_PORT", "5432")
        dbname = os.getenv("DB_NAME", "kaivo")
        DATABASE_URL = f"postgresql://{user}:{password}@{host}:{port}/{dbname}"
    engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Legacy DBs may omit columns added after their last migration; repair once per process.
from packages.db.orm_schema_repair import ensure_orm_schema

ensure_orm_schema(engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
