import os
from pydantic_settings import BaseSettings
from typing import List, Optional
from datetime import timezone, timedelta
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
env_file = ROOT_DIR / ".env"

class Settings(BaseSettings):
    PROJECT_NAME: str = "BrandTrace"
    ENVIRONMENT: str = "development"
    TIMEZONE: str = "Asia/Kolkata"
    DATABASE_URL: str = "postgresql+psycopg2://brandtrace:brandtrace@127.0.0.1:5432/brandtrace_db"
    GROQ_API_KEY: Optional[str] = None
    GROQ_MODEL: str = "openai/gpt-oss-120b"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    SECRET_KEY: str = "brandtrace-secret-key-change-in-production"
    # In production set to "false"; role-picker header disabled when false.
    ALLOW_ROLE_SWITCHER: str = "true"
    # Comma-separated allowed origins; wildcard only in dev.
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    class Config:
        env_file = str(env_file)
        env_file_encoding = "utf-8"
        extra = "ignore"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def role_switcher_enabled(self) -> bool:
        return self.ALLOW_ROLE_SWITCHER.lower() == "true"

settings = Settings()

# ── Timezone ─────────────────────────────────────────────────────────────────
# Asia/Kolkata = UTC+05:30.  Used for:
#   • Interpreting date-only inputs ("31 Dec", "1 Dec 2026") as IST midnight
#     BEFORE converting to UTC for storage (rule 3).
#   • Stamping created_at / updated_at fields.
# NOT display-only — fact effective dates must be pinned to IST midnight.
IST = timezone(timedelta(hours=5, minutes=30), name="Asia/Kolkata")
