@echo off
title BrandTrace - Reset Demo Dataset
color 0E
echo ====================================================================
echo  BRANDTRACE - RESET DEMO DATASET
echo  Teardown and reseed initial Aura Audio facts, pieces, and rules.
echo ====================================================================
echo.

set ROOT_DIR=%~dp0
set PG_BIN=C:\Users\Hari Priya\.gemini\antigravity\scratch\pgsql\pgsql\bin
set PG_DATA=C:\Users\Hari Priya\.gemini\antigravity\scratch\pgsql\data

echo Checking PostgreSQL status on port 5432...
netstat -ano | findstr ":5432 " | findstr "LISTENING" >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%PG_DATA%\postmaster.pid" del /f /q "%PG_DATA%\postmaster.pid" >nul 2>&1
    echo Starting PostgreSQL 16 server...
    "%PG_BIN%\pg_ctl.exe" -D "%PG_DATA%" start
    timeout /t 3 /nobreak >nul
)

echo Executing seed runner...
cd /d "%ROOT_DIR%"
python seed\run_seed.py

echo.
echo ====================================================================
echo  DEMO STATE RESET COMPLETE:
echo  • Fact F001 v1 (₹4,999) restored
echo  • 5 pieces restored (LinkedIn approved, Email approved, Instagram draft,
echo                       Brochure live, Webinar archived)
echo  • Campaign 'Festive Launch' active
echo  • 4 Users ready: Admin, Creator, Reviewer, Agency
echo ====================================================================
echo.
pause

