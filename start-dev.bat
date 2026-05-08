@echo off
REM ============================================================
REM  MailFlow — Windows Development Launcher
REM  Backend:  Django runserver  → port 9001
REM  Frontend: Next.js dev       → port 3000
REM ============================================================
setlocal EnableDelayedExpansion

set BACKEND_PORT=9001
set FRONTEND_PORT=3000
set ROOT=%~dp0
set BACKEND=%ROOT%backend
set FRONTEND=%ROOT%frontend
set VENV=%BACKEND%\venv

echo.
echo  MailFlow — Starting Development Environment
echo  Backend  ^> http://localhost:%BACKEND_PORT%
echo  Frontend ^> http://localhost:%FRONTEND_PORT%
echo.

REM ─── Check Python ─────────────────────────────────────────
where python >nul 2>&1 || (
    echo [ERROR] Python not found. Please install Python 3.9+
    pause & exit /b 1
)

REM ─── Check Node ───────────────────────────────────────────
where node >nul 2>&1 || (
    echo [ERROR] Node.js not found. Please install Node.js 18+
    pause & exit /b 1
)

REM ─── Backend: create venv if missing ──────────────────────
if not exist "%VENV%\Scripts\activate.bat" (
    echo [SETUP] Creating Python virtual environment...
    python -m venv "%VENV%"
)

REM ─── Backend: install requirements ────────────────────────
echo [SETUP] Installing backend dependencies...
call "%VENV%\Scripts\activate.bat"
pip install -r "%BACKEND%\requirements.txt" --quiet --disable-pip-version-check

REM ─── Backend: create .env if missing ──────────────────────
if not exist "%BACKEND%\.env" (
    echo [SETUP] Creating backend .env...
    python -c "import secrets; k=secrets.token_urlsafe(50); open(r'%BACKEND%\.env','w').write(f'SECRET_KEY={k}\nDEBUG=True\nALLOWED_HOSTS=*\nCORS_ALLOWED_ORIGINS=http://localhost:%FRONTEND_PORT%\nENCRYPTION_KEY=\nREDIS_URL=redis://localhost:6379/0\n')"
    echo [SETUP] .env created.
)

REM ─── Backend: run migrations ──────────────────────────────
echo [SETUP] Running migrations...
cd /d "%BACKEND%"
python manage.py makemigrations --no-input 2>nul
python manage.py migrate --no-input

REM ─── Frontend: install node_modules if missing ─────────────
if not exist "%FRONTEND%\node_modules" (
    echo [SETUP] Installing frontend dependencies...
    cd /d "%FRONTEND%"
    npm install --prefer-offline
)

REM ─── Frontend: set backend URL ────────────────────────────
echo NEXT_PUBLIC_API_URL=http://localhost:%BACKEND_PORT%> "%FRONTEND%\.env.local"

REM ─── Launch both in separate windows ──────────────────────
echo.
echo [START] Launching backend on port %BACKEND_PORT%...
start "MailFlow Backend (:%BACKEND_PORT%)" cmd /k "cd /d %BACKEND% && call venv\Scripts\activate && python manage.py runserver 0.0.0.0:%BACKEND_PORT%"

timeout /t 2 /nobreak >nul

echo [START] Launching frontend on port %FRONTEND_PORT%...
start "MailFlow Frontend (:%FRONTEND_PORT%)" cmd /k "cd /d %FRONTEND% && npm run dev -- --port %FRONTEND_PORT%"

timeout /t 3 /nobreak >nul

echo.
echo  ============================================================
echo   MailFlow is running!
echo  ============================================================
echo   Frontend  :  http://localhost:%FRONTEND_PORT%
echo   Backend   :  http://localhost:%BACKEND_PORT%/api/
echo   Admin     :  http://localhost:%BACKEND_PORT%/admin/
echo  ============================================================
echo.
echo  Both windows are open. Close them to stop the servers.
echo  Press any key to open the app in your browser...
pause >nul

start http://localhost:%FRONTEND_PORT%
