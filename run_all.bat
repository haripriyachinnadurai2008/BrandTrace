@echo off
title BrandTrace - 1-Click Local Runner
color 0A
echo ====================================================================
echo  BRANDTRACE - 1-CLICK LOCAL PROTOTYPE LAUNCHER
echo  "The LLM extracts, the backend verifies, humans decide."
echo ====================================================================
echo.

set ROOT_DIR=%~dp0
set PG_BIN=C:\Users\Hari Priya\.gemini\antigravity\scratch\pgsql\pgsql\bin
set PG_DATA=C:\Users\Hari Priya\.gemini\antigravity\scratch\pgsql\data

:: 1. Start PostgreSQL 16 if not already listening on port 5432
echo [1/5] Checking PostgreSQL status on port 5432...
netstat -ano | findstr ":5432 " | findstr "LISTENING" >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%PG_DATA%\postmaster.pid" del /f /q "%PG_DATA%\postmaster.pid" >nul 2>&1
    echo       Starting local PostgreSQL 16 server...
    "%PG_BIN%\pg_ctl.exe" -D "%PG_DATA%" -l "%ROOT_DIR%postgres_server.log" start
    timeout /t 3 /nobreak >nul
) else (
    echo       [OK] PostgreSQL 16 is already active and listening.
)

:: 2. Ensure environment files exist
echo [2/5] Checking environment configuration...
if not exist "%ROOT_DIR%backend\.env" (
    echo       Creating backend\.env...
    (
        echo DATABASE_URL=postgresql+psycopg2://brandtrace:brandtrace@127.0.0.1:5432/brandtrace_db
        echo SECRET_KEY=brandtrace-local-development-secret-key-2026
        echo GROQ_API_KEY=""
        echo ENVIRONMENT=development
        echo ALLOW_ROLE_SWITCHER=true
        echo CORS_ORIGINS=http://localhost:5173
        echo TIMEZONE=Asia/Kolkata
        echo HOST=0.0.0.0
        echo PORT=8000
    ) > "%ROOT_DIR%backend\.env"
)

if not exist "%ROOT_DIR%frontend\.env.local" (
    echo       Creating frontend\.env.local...
    (
        echo VITE_API_BASE_URL=http://localhost:8000
        echo VITE_ALLOW_ROLE_SWITCHER=true
    ) > "%ROOT_DIR%frontend\.env.local"
)
echo       [OK] Environment files verified.

:: 3. Run database seed (F001 v1, 5 pieces, Festive Launch, 4 users)
echo [3/5] Seeding PostgreSQL database (Aura Audio demo dataset)...
cd /d "%ROOT_DIR%"
python seed\run_seed.py
if %errorlevel% neq 0 (
    echo [WARNING] Seed script encountered an issue. Continuing to launch services...
)

:: 4. Start FastAPI Backend in new window
echo [4/5] Launching FastAPI Backend on http://localhost:8000...
start "BrandTrace Backend (FastAPI)" cmd /k "cd /d ""%ROOT_DIR%backend"" && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

:: 5. Start React Frontend in new window
echo [5/5] Launching React+Vite Frontend on http://localhost:5173...
start "BrandTrace Frontend (Vite)" cmd /k "cd /d ""%ROOT_DIR%frontend"" && npm run dev"

echo.
echo ====================================================================
echo  BRANDTRACE IS READY!
echo  Backend:  http://localhost:8000 (Health: http://localhost:8000/health)
echo  Frontend: http://localhost:5173
echo ====================================================================
echo.
timeout /t 3 /nobreak >nul
start http://localhost:5173
pause

