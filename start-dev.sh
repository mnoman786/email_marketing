#!/usr/bin/env bash
# ============================================================
#  MailFlow — Linux/Mac Development Launcher
#  Backend:  Django runserver  → port 9001
#  Frontend: Next.js dev       → port 3000
# ============================================================
set -e

BACKEND_PORT=9001
FRONTEND_PORT=3000
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
VENV="$BACKEND/venv"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}"
echo "  MailFlow — Development Environment"
echo "  Backend  → http://localhost:${BACKEND_PORT}"
echo "  Frontend → http://localhost:${FRONTEND_PORT}"
echo -e "${NC}"

# ─── Virtual environment ──────────────────────────────────────
if [ ! -f "$VENV/bin/activate" ]; then
    echo -e "${YELLOW}[SETUP]${NC} Creating Python virtual environment..."
    python3 -m venv "$VENV"
fi

source "$VENV/bin/activate"

# ─── Backend dependencies ─────────────────────────────────────
echo -e "${YELLOW}[SETUP]${NC} Installing backend dependencies..."
pip install -r "$BACKEND/requirements.txt" --quiet

# ─── Backend .env ─────────────────────────────────────────────
if [ ! -f "$BACKEND/.env" ]; then
    echo -e "${YELLOW}[SETUP]${NC} Creating backend .env..."
    SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(50))")
    cat > "$BACKEND/.env" <<EOF
SECRET_KEY=${SECRET_KEY}
DEBUG=True
ALLOWED_HOSTS=*
CORS_ALLOWED_ORIGINS=http://localhost:${FRONTEND_PORT}
ENCRYPTION_KEY=
REDIS_URL=redis://localhost:6379/0
EOF
fi

# ─── Frontend .env ────────────────────────────────────────────
echo "NEXT_PUBLIC_API_URL=http://localhost:${BACKEND_PORT}" > "$FRONTEND/.env.local"

# ─── Migrations ───────────────────────────────────────────────
echo -e "${YELLOW}[SETUP]${NC} Running migrations..."
cd "$BACKEND"
python manage.py makemigrations --no-input 2>/dev/null || true
python manage.py migrate --no-input

# ─── Frontend node_modules ────────────────────────────────────
if [ ! -d "$FRONTEND/node_modules" ]; then
    echo -e "${YELLOW}[SETUP]${NC} Installing frontend dependencies..."
    cd "$FRONTEND" && npm install --prefer-offline
fi

# ─── Cleanup on exit ──────────────────────────────────────────
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
    echo ""
    echo -e "${YELLOW}Stopping servers...${NC}"
    [ -n "$BACKEND_PID"  ] && kill "$BACKEND_PID"  2>/dev/null || true
    [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
    echo "Done."
    exit 0
}
trap cleanup SIGINT SIGTERM

# ─── Start backend ────────────────────────────────────────────
echo -e "${GREEN}[START]${NC} Backend  → http://localhost:${BACKEND_PORT}"
cd "$BACKEND"
python manage.py runserver "0.0.0.0:${BACKEND_PORT}" &
BACKEND_PID=$!

sleep 2

# ─── Start frontend ───────────────────────────────────────────
echo -e "${GREEN}[START]${NC} Frontend → http://localhost:${FRONTEND_PORT}"
cd "$FRONTEND"
npm run dev -- --port "$FRONTEND_PORT" &
FRONTEND_PID=$!

sleep 3

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  MailFlow is running!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${CYAN}Frontend${NC}  → http://localhost:${FRONTEND_PORT}"
echo -e "  ${CYAN}API${NC}       → http://localhost:${BACKEND_PORT}/api/"
echo -e "  ${CYAN}Admin${NC}     → http://localhost:${BACKEND_PORT}/admin/"
echo ""
echo "  Press Ctrl+C to stop both servers."
echo ""

wait
