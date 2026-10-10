#!/usr/bin/env bash
# =============================================================================
#  MailFlow — Full Production Setup Script
#  Backend:  Gunicorn + Django  → systemd → chosen port
#  Frontend: Next.js            → systemd → chosen port
#  Celery:   worker + beat      → systemd → Redis DB > 10
#  Proxy:    Nginx (optional)   → port 80 / 443
# =============================================================================
set -e

# ─── Colours ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERR]${NC}   $*"; exit 1; }

# ─── Configuration (edit before running, or override via env vars) ──────────
BACKEND_PORT="${BACKEND_PORT:-9006}"
FRONTEND_PORT="${FRONTEND_PORT:-4001}"
DOMAIN="${DOMAIN:-}"              # e.g. "mail.example.com" — leave blank to skip nginx
SERVER_IP="${SERVER_IP:-}"
# Kept above 10 on purpose so this app's queue/cache doesn't collide with
# other apps' DB 0-10 on a shared Redis instance. Broker, result backend, and
# Django's cache all read this same REDIS_URL today.
REDIS_DB="${REDIS_DB:-11}"
REDIS_URL="redis://localhost:6379/${REDIS_DB}"
# Worker pool. gevent is the right default here: campaign sends, IMAP polls and
# warmup are all I/O-bound (blocked on SMTP/IMAP network), so one process with
# many greenlets vastly out-throughputs 4 prefork OS processes. Concurrency is
# the greenlet count under gevent — 100 is reasonable; raise for bigger sends.
# Override to prefork (CELERY_POOL=prefork CELERY_CONCURRENCY=4) for CPU-bound work.
CELERY_POOL="${CELERY_POOL:-gevent}"
if [ "$CELERY_POOL" = "gevent" ] || [ "$CELERY_POOL" = "eventlet" ]; then
    CELERY_CONCURRENCY="${CELERY_CONCURRENCY:-100}"
else
    CELERY_CONCURRENCY="${CELERY_CONCURRENCY:-4}"
fi
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/venv"
SERVICE_USER="$(whoami)"
# Project Python version: 3.12.14
PYTHON_BIN="python3"
NODE_BIN="node"
NPM_BIN="npm"

ask_port() {
    local label="$1" value="$2" answer
    if [ -t 0 ]; then
        read -r -p "  ${label} port [${value}]: " answer
        value="${answer:-$value}"
    fi
    [[ "$value" =~ ^[0-9]+$ ]] && (( 10#$value >= 1 && 10#$value <= 65535 )) \
        || error "${label} port must be between 1 and 65535."
    printf -v "$3" '%d' "$((10#$value))"
}

ask_port "Frontend" "$FRONTEND_PORT" FRONTEND_PORT
ask_port "Backend" "$BACKEND_PORT" BACKEND_PORT
[ "$FRONTEND_PORT" != "$BACKEND_PORT" ] || error "Frontend and backend ports must differ."

# The browser must reach a real server address. Public IP is preferred on a
# cloud VM; route/hostname detection also supports private LAN deployments.
if [ -z "$SERVER_IP" ] && command -v curl >/dev/null 2>&1; then
    SERVER_IP="$(curl -4fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
fi
if [ -z "$SERVER_IP" ] && command -v ip >/dev/null 2>&1; then
    SERVER_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '/src/ {for (i=1; i<=NF; i++) if ($i=="src") {print $(i+1); exit}}')"
fi
if [ -z "$SERVER_IP" ]; then
    SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi
[ -n "$SERVER_IP" ] || error "Could not detect a server IP. Re-run with SERVER_IP=your.ip.address."
if [ -n "$DOMAIN" ] && [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9.-]+$ ]]; then
    error "DOMAIN must be a DNS hostname without a scheme or port."
fi

FRONTEND_URL="http://${SERVER_IP}:${FRONTEND_PORT}"
API_URL="http://${SERVER_IP}:${BACKEND_PORT}"
if [ -n "$DOMAIN" ]; then
    FRONTEND_URL="https://${DOMAIN}"
    API_URL="https://${DOMAIN}"
fi

# ─── Banner ──────────────────────────────────────────────────────────────────
echo -e "${CYAN}"
echo "  ███╗   ███╗ █████╗ ██╗██╗     ███████╗██╗      ██████╗ ██╗    ██╗"
echo "  ████╗ ████║██╔══██╗██║██║     ██╔════╝██║     ██╔═══██╗██║    ██║"
echo "  ██╔████╔██║███████║██║██║     █████╗  ██║     ██║   ██║██║ █╗ ██║"
echo "  ██║╚██╔╝██║██╔══██║██║██║     ██╔══╝  ██║     ██║   ██║██║███╗██║"
echo "  ██║ ╚═╝ ██║██║  ██║██║███████╗██║     ███████╗╚██████╔╝╚███╔███╔╝"
echo "  ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝╚══════╝╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝ "
echo -e "${NC}"
echo -e "${GREEN}  Email Marketing Platform — Production Setup${NC}"
echo -e "  Backend  → ${API_URL}"
echo -e "  Frontend → ${FRONTEND_URL}"
echo ""

# ─── Preflight checks & auto-install ─────────────────────────────────────────
info "Checking prerequisites..."

command -v systemctl >/dev/null 2>&1 || error "systemctl not found. This script requires a systemd-based Linux system."
if [ -n "$DOMAIN" ]; then
    command -v nginx >/dev/null 2>&1 || error "DOMAIN requires Nginx for HTTPS. Install nginx or leave DOMAIN unset."
    command -v certbot >/dev/null 2>&1 || error "DOMAIN requires Certbot for HTTPS. Install certbot and python3-certbot-nginx."
fi

# Detect package manager
if command -v apt-get >/dev/null 2>&1; then
    PKG_MGR="apt-get"
elif command -v dnf >/dev/null 2>&1; then
    PKG_MGR="dnf"
elif command -v yum >/dev/null 2>&1; then
    PKG_MGR="yum"
else
    PKG_MGR=""
fi

# ── Auto-install Python 3 ──────────────────────────────────────────────────
if ! command -v $PYTHON_BIN >/dev/null 2>&1; then
    warn "Python 3 not found — installing..."
    if [ "$PKG_MGR" = "apt-get" ]; then
        sudo apt-get update -qq
        sudo apt-get install -y python3 python3-pip python3-venv
    elif [ "$PKG_MGR" = "dnf" ] || [ "$PKG_MGR" = "yum" ]; then
        sudo $PKG_MGR install -y python3 python3-pip
    else
        error "Cannot auto-install Python 3. Please install it manually and re-run."
    fi
fi
command -v $PYTHON_BIN >/dev/null 2>&1 || error "Python 3 installation failed."
python3 - "$SERVER_IP" <<'PY' || error "SERVER_IP must be a valid IPv4 address."
import ipaddress
import sys
ipaddress.IPv4Address(sys.argv[1])
PY

# ── Auto-install Node.js v20 LTS ──────────────────────────────────────────
if ! command -v $NODE_BIN >/dev/null 2>&1; then
    warn "Node.js not found — installing Node.js 20 LTS via NodeSource..."
    if [ "$PKG_MGR" = "apt-get" ]; then
        sudo apt-get install -y ca-certificates curl gnupg
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif [ "$PKG_MGR" = "dnf" ] || [ "$PKG_MGR" = "yum" ]; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
        sudo $PKG_MGR install -y nodejs
    else
        # Fallback: install via nvm
        warn "No supported package manager — installing Node.js via nvm..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
        nvm install 20
        nvm use 20
        NODE_BIN="node"
        NPM_BIN="npm"
    fi
fi
command -v $NODE_BIN >/dev/null 2>&1 || error "Node.js installation failed."
command -v $NPM_BIN  >/dev/null 2>&1 || error "npm not found after Node.js install."

# ── Auto-install common build tools ───────────────────────────────────────
if [ "$PKG_MGR" = "apt-get" ]; then
    info "Installing system build tools..."
    sudo apt-get install -y build-essential libssl-dev libffi-dev python3-dev git curl --no-install-recommends -qq
fi

# ── Auto-install Redis ─────────────────────────────────────────────────────
# Celery (campaign sending, sequence steps, IMAP polling) and Django's cache
# both depend on this — install and enable it rather than just detecting it.
if ! command -v redis-cli >/dev/null 2>&1; then
    warn "Redis not found — installing..."
    if [ "$PKG_MGR" = "apt-get" ]; then
        sudo apt-get install -y redis-server -qq
    elif [ "$PKG_MGR" = "dnf" ] || [ "$PKG_MGR" = "yum" ]; then
        sudo $PKG_MGR install -y redis
    else
        error "Cannot auto-install Redis. Please install it manually and re-run."
    fi
fi
# Ubuntu/Debian's package installs the unit as "redis-server"; RHEL-based
# distros name it "redis" — try the Debian name first since that's the
# primary target here, fall back to the other if it doesn't exist.
if systemctl list-unit-files redis-server.service >/dev/null 2>&1; then
    REDIS_SERVICE="redis-server"
else
    REDIS_SERVICE="redis"
fi
sudo systemctl enable --now "$REDIS_SERVICE"
command -v redis-cli >/dev/null 2>&1 && redis-cli ping >/dev/null 2>&1 \
    && success "Redis running (${REDIS_SERVICE}.service), using DB index ${REDIS_DB}." \
    || error "Redis installed but not responding to ping — check: sudo systemctl status ${REDIS_SERVICE}"

PYTHON_VER=$($PYTHON_BIN -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
NODE_VER=$($NODE_BIN -e "process.stdout.write(process.version)")
info "Python $PYTHON_VER  |  Node $NODE_VER  |  npm $(npm -v)"

# ─── 1. Backend — Python virtual environment ──────────────────────────────────
echo ""
info "━━━ [1/8] Setting up Python virtual environment..."
if [ ! -x "$VENV_DIR/bin/pip" ]; then
    # `python3 -m venv --help` succeeds even when Debian's ensurepip package is
    # missing, so try creating the environment itself before deciding.
    if ! "$PYTHON_BIN" -m venv "$VENV_DIR"; then
        if [ "$PKG_MGR" = "apt-get" ]; then
            warn "Python ${PYTHON_VER} venv support is missing — installing python${PYTHON_VER}-venv..."
            sudo apt-get update -qq
            sudo apt-get install -y "python${PYTHON_VER}-venv"
            "$PYTHON_BIN" -m venv --clear "$VENV_DIR" || error "Could not create Python virtual environment."
        else
            error "Could not create Python virtual environment. Install the venv/ensurepip package for Python ${PYTHON_VER} and rerun."
        fi
    fi
fi
source "$VENV_DIR/bin/activate"
pip install --upgrade pip --quiet
pip install -r "$BACKEND_DIR/requirements.txt" --quiet
success "Python dependencies installed."

# ─── 2. Backend — Environment file ───────────────────────────────────────────
echo ""
info "━━━ [2/8] Configuring backend environment..."
ENV_FILE="$BACKEND_DIR/.env"

python - "$ENV_FILE" "$SERVER_IP" "$BACKEND_PORT" "$FRONTEND_PORT" "$DOMAIN" "$REDIS_URL" "$API_URL" "$FRONTEND_URL" <<'PY'
import secrets
import sys
from pathlib import Path
from cryptography.fernet import Fernet

path, server_ip, backend_port, frontend_port, domain, redis_url, api_url, frontend_url = sys.argv[1:]
env = Path(path)
lines = env.read_text().splitlines() if env.exists() else []
existing = {}
for line in lines:
    if '=' in line and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        existing[key] = value

secret = existing.get('SECRET_KEY', '')
if not secret or secret.startswith('django-insecure-') or secret == 'your-super-secret-key-here':
    secret = secrets.token_urlsafe(50)
encryption = existing.get('ENCRYPTION_KEY', '') or Fernet.generate_key().decode()
hosts = ['localhost', '127.0.0.1', server_ip]
origins = [f'http://localhost:{frontend_port}', f'http://127.0.0.1:{frontend_port}', f'http://{server_ip}:{frontend_port}']
if domain:
    hosts.append(domain)
    origins.append(f'https://{domain}')
updates = {
    'SECRET_KEY': secret,
    'ENCRYPTION_KEY': encryption,
    'DEBUG': 'False',
    'ALLOWED_HOSTS': ','.join(hosts),
    'DATABASE_URL': existing.get('DATABASE_URL') or 'sqlite:///db.sqlite3',
    'REDIS_URL': redis_url,
    'CORS_ALLOWED_ORIGINS': ','.join(origins),
    'CSRF_TRUSTED_ORIGINS': ','.join(origins),
    'SITE_URL': api_url,
    'FRONTEND_URL': frontend_url,
    'MAILBOX_OAUTH_REDIRECT_URI': frontend_url + '/accounts/oauth/callback',
    'SESSION_COOKIE_SECURE': 'True' if domain else 'False',
    'CSRF_COOKIE_SECURE': 'True' if domain else 'False',
}
output = []
seen = set()
for line in lines:
    key = line.split('=', 1)[0] if '=' in line and not line.lstrip().startswith('#') else None
    if key in updates:
        if key not in seen:
            output.append(f'{key}={updates[key]}')
            seen.add(key)
    else:
        output.append(line)
for key, value in updates.items():
    if key not in seen:
        output.append(f'{key}={value}')
env.write_text('\n'.join(output) + '\n')
env.chmod(0o600)
PY
success "Backend environment configured for ${SERVER_IP} (existing credentials preserved)."

# ─── 3. Backend — Migrations & static files ──────────────────────────────────
echo ""
info "━━━ [3/8] Running database migrations..."
cd "$BACKEND_DIR"
python manage.py migrate --no-input
python manage.py collectstatic --no-input --clear -v 0
success "Database migrated and static files collected."

# Prompt to create superuser
echo ""
CREATE_SU="n"
if [ -t 0 ]; then
    read -r -p "  Create Django superuser now? [y/N] " CREATE_SU
fi
if [[ "$CREATE_SU" = "y" || "$CREATE_SU" = "Y" ]]; then
    python manage.py createsuperuser
fi

# ─── 4. Backend — systemd service (Gunicorn) ─────────────────────────────────
echo ""
info "━━━ [4/8] Creating systemd service for backend (port ${BACKEND_PORT})..."

sudo tee /etc/systemd/system/mailflow-backend.service > /dev/null <<EOF
[Unit]
Description=MailFlow Backend (Gunicorn + Django)
After=network.target

[Service]
Type=notify
User=${SERVICE_USER}
WorkingDirectory=${BACKEND_DIR}
ExecStart=${VENV_DIR}/bin/gunicorn \\
    email_marketing.wsgi:application \\
    --bind 0.0.0.0:${BACKEND_PORT} \\
    --workers 4 \\
    --worker-class sync \\
    --timeout 120 \\
    --access-logfile ${BACKEND_DIR}/logs/access.log \\
    --error-logfile  ${BACKEND_DIR}/logs/error.log \\
    --log-level info
EnvironmentFile=${ENV_FILE}
Restart=on-failure
RestartSec=5s
StandardOutput=append:${BACKEND_DIR}/logs/stdout.log
StandardError=append:${BACKEND_DIR}/logs/stderr.log

[Install]
WantedBy=multi-user.target
EOF

mkdir -p "$BACKEND_DIR/logs"
sudo systemctl daemon-reload
sudo systemctl enable mailflow-backend
sudo systemctl restart mailflow-backend
sleep 2

if systemctl is-active --quiet mailflow-backend; then
    success "mailflow-backend service running on port ${BACKEND_PORT}."
else
    error "Backend failed to start. Check: sudo journalctl -u mailflow-backend -n 30"
fi

# ─── 5. Frontend — install & build ───────────────────────────────────────────
echo ""
info "━━━ [5/8] Installing frontend dependencies..."
cd "$FRONTEND_DIR"

# Point frontend at the backend
FE_ENV="$FRONTEND_DIR/.env.local"
python - "$FE_ENV" "$API_URL" <<'PY'
import sys
from pathlib import Path
path = Path(sys.argv[1])
lines = path.read_text().splitlines() if path.exists() else []
lines = [line for line in lines if not line.startswith('NEXT_PUBLIC_API_URL=')]
lines.append('NEXT_PUBLIC_API_URL=' + sys.argv[2])
path.write_text('\n'.join(lines) + '\n')
PY

$NPM_BIN install --prefer-offline --quiet
info "Building Next.js for production..."
$NPM_BIN run build
success "Frontend built."

# ─── 6. Frontend — systemd service (Next.js) ─────────────────────────────────
echo ""
info "━━━ [6/8] Creating systemd service for frontend (port ${FRONTEND_PORT})..."

sudo tee /etc/systemd/system/mailflow-frontend.service > /dev/null <<EOF
[Unit]
Description=MailFlow Frontend (Next.js)
After=network.target mailflow-backend.service

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${FRONTEND_DIR}
Environment=PORT=${FRONTEND_PORT}
Environment=NODE_ENV=production
ExecStart=$(which $NODE_BIN) node_modules/.bin/next start --hostname 0.0.0.0 --port ${FRONTEND_PORT}
Restart=on-failure
RestartSec=5s
StandardOutput=append:${FRONTEND_DIR}/.next/stdout.log
StandardError=append:${FRONTEND_DIR}/.next/stderr.log

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable mailflow-frontend
sudo systemctl restart mailflow-frontend
sleep 2

if systemctl is-active --quiet mailflow-frontend; then
    success "mailflow-frontend service running on port ${FRONTEND_PORT}."
else
    error "Frontend failed to start. Check: sudo journalctl -u mailflow-frontend -n 30"
fi

# ─── 7. Nginx reverse proxy (optional) ───────────────────────────────────────
if [ -n "$DOMAIN" ]; then
    echo ""
    info "━━━ [7/8] Configuring Nginx reverse proxy for ${DOMAIN}..."

    sudo tee /etc/nginx/sites-available/mailflow > /dev/null <<EOF
upstream mailflow_backend  { server 127.0.0.1:${BACKEND_PORT}; }
upstream mailflow_frontend { server 127.0.0.1:${FRONTEND_PORT}; }

server {
    listen 80;
    server_name ${DOMAIN};

    client_max_body_size 35M;

    # API → Django
    location /api/ {
        proxy_pass http://mailflow_backend;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    # Django admin
    location /admin/ {
        proxy_pass http://mailflow_backend;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Django static files
    location /static/ {
        alias ${BACKEND_DIR}/staticfiles/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Next.js frontend
    location / {
        proxy_pass http://mailflow_frontend;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade           \$http_upgrade;
        proxy_set_header Connection        "upgrade";
    }
}
EOF

    sudo ln -sf /etc/nginx/sites-available/mailflow /etc/nginx/sites-enabled/mailflow
    sudo nginx -t && sudo systemctl reload nginx
    success "Nginx configured for ${DOMAIN}."

    sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
        -m "admin@${DOMAIN}" --redirect
    success "SSL certificate installed."
else
    info "━━━ [7/8] Skipping Nginx (DOMAIN not set or nginx not installed)."
fi

# On hosts that use UFW, allow direct IP access on the selected ports.
if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q '^Status: active'; then
    sudo ufw allow "${FRONTEND_PORT}/tcp"
    sudo ufw allow "${BACKEND_PORT}/tcp"
    success "UFW allows frontend and backend ports."
fi

# ─── Celery worker + beat ─────────────────────────────────────────────────────
echo ""
info "━━━ [8/8] Creating Celery worker + beat services..."

sudo tee /etc/systemd/system/mailflow-celery.service > /dev/null <<EOF
[Unit]
Description=MailFlow Celery Worker
After=network.target ${REDIS_SERVICE}.service

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${BACKEND_DIR}
ExecStart=${VENV_DIR}/bin/celery -A email_marketing worker -l info --pool=${CELERY_POOL} --concurrency=${CELERY_CONCURRENCY}
EnvironmentFile=${ENV_FILE}
Restart=on-failure
RestartSec=10s
StandardOutput=append:${BACKEND_DIR}/logs/celery.log
StandardError=append:${BACKEND_DIR}/logs/celery-err.log

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/mailflow-beat.service > /dev/null <<EOF
[Unit]
Description=MailFlow Celery Beat (Scheduler)
After=network.target ${REDIS_SERVICE}.service mailflow-celery.service

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${BACKEND_DIR}
ExecStart=${VENV_DIR}/bin/celery -A email_marketing beat -l info \
    --scheduler django_celery_beat.schedulers:DatabaseScheduler
EnvironmentFile=${ENV_FILE}
Restart=on-failure
RestartSec=10s
StandardOutput=append:${BACKEND_DIR}/logs/celery-beat.log
StandardError=append:${BACKEND_DIR}/logs/celery-beat-err.log

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable mailflow-celery mailflow-beat
sudo systemctl restart mailflow-celery mailflow-beat
sleep 2

if systemctl is-active --quiet mailflow-celery && systemctl is-active --quiet mailflow-beat; then
    success "Celery worker (pool=${CELERY_POOL}, concurrency=${CELERY_CONCURRENCY}) + beat scheduler running."
else
    error "Celery failed to start. Check: sudo journalctl -u mailflow-celery -u mailflow-beat -n 30"
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  MailFlow is ready!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${CYAN}Frontend${NC}   →  ${FRONTEND_URL}"
echo -e "  ${CYAN}Backend API${NC} →  ${API_URL}/api/"
echo -e "  ${CYAN}Django Admin${NC}→  ${API_URL}/admin/"
[ -n "$DOMAIN" ] && echo -e "  ${CYAN}Domain${NC}     →  https://${DOMAIN}"
echo ""
echo -e "  ${YELLOW}Redis${NC}      →  DB index ${REDIS_DB} (${REDIS_URL})"
echo ""
echo -e "  ${YELLOW}Manage services:${NC}"
echo -e "    sudo systemctl status  mailflow-backend"
echo -e "    sudo systemctl restart mailflow-backend"
echo -e "    sudo systemctl status  mailflow-frontend"
echo -e "    sudo systemctl restart mailflow-frontend"
echo -e "    sudo systemctl status  mailflow-celery"
echo -e "    sudo systemctl status  mailflow-beat"
echo -e "    sudo systemctl restart mailflow-celery mailflow-beat"
echo -e "    sudo journalctl -u mailflow-backend  -f   # live logs"
echo -e "    sudo journalctl -u mailflow-frontend -f   # live logs"
echo -e "    sudo journalctl -u mailflow-celery   -f   # live logs"
echo ""
echo -e "  ${YELLOW}Logs:${NC}"
echo -e "    ${BACKEND_DIR}/logs/access.log"
echo -e "    ${BACKEND_DIR}/logs/error.log"
echo -e "    ${BACKEND_DIR}/logs/celery.log"
echo -e "    ${BACKEND_DIR}/logs/celery-beat.log"
echo ""
