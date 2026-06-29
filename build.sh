#!/usr/bin/env bash
# =============================================================================
#  MailFlow — Build & Restart Helper
#  Pulls latest code (unless --no-pull), rebuilds the chosen service(s),
#  and restarts the matching systemd unit(s) created by setup.sh.
#
#  Usage:
#    ./build.sh                          # interactive numbered menu
#    ./build.sh [backend|frontend|celery|beat|all|status|logs] [--no-pull]
#    ./build.sh [1|2|3|4|5|6|7]           # same targets, by number
#
#  Examples:
#    ./build.sh                # show menu, pick a number
#    ./build.sh backend        # just the Django/gunicorn service
#    ./build.sh 2              # = frontend
#    ./build.sh celery         # just the Celery worker
#    ./build.sh beat           # just Celery beat
#    ./build.sh backend --no-pull   # rebuild without git pull first
#
#  Extra subcommands:
#    ./build.sh status         # systemctl status for all four services
#    ./build.sh logs <service> # journalctl -f for one service (backend/frontend/celery/beat)
# =============================================================================
set -e

# ─── Colours ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERR]${NC}   $*"; exit 1; }

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/venv"

SERVICE_BACKEND=mailflow-backend
SERVICE_FRONTEND=mailflow-frontend
SERVICE_CELERY=mailflow-celery
SERVICE_BEAT=mailflow-beat

PULL=true
for arg in "$@"; do
    [ "$arg" = "--no-pull" ] && PULL=false
done

command -v systemctl >/dev/null 2>&1 || error "systemctl not found — this script requires a systemd-based Linux system."

# Map a number (from the menu, or typed directly as an arg) to a target name.
number_to_target() {
    case "$1" in
        1) echo backend ;;
        2) echo frontend ;;
        3) echo celery ;;
        4) echo beat ;;
        5) echo all ;;
        6) echo status ;;
        7) echo logs ;;
        *) echo "" ;;
    esac
}

# Sets the global MENU_TARGET rather than echoing+capturing via $(...) —
# command substitution runs in a subshell, where `exit` only kills the
# subshell, not the whole script (choosing "Exit" wouldn't actually exit).
show_menu() {
    echo ""
    echo "  MailFlow — Build & Restart"
    echo "  ────────────────────────────"
    echo "  1) Backend   (Django/gunicorn)"
    echo "  2) Frontend  (Next.js)"
    echo "  3) Celery worker"
    echo "  4) Celery beat"
    echo "  5) All"
    echo "  6) Status (all services)"
    echo "  7) Logs (pick a service)"
    echo "  0) Exit"
    echo ""
    read -p "  Enter your choice [0-7]: " CHOICE
    if [ "$CHOICE" = "0" ]; then
        echo "Bye."
        exit 0
    fi
    MENU_TARGET="$(number_to_target "$CHOICE")"
    if [ -z "$MENU_TARGET" ]; then
        error "Invalid choice '${CHOICE}' — expected a number 0-7."
    fi
    return 0
}

RAW="${1:-}"
if [ -z "$RAW" ]; then
    show_menu
    TARGET="$MENU_TARGET"
elif [[ "$RAW" =~ ^[0-9]+$ ]]; then
    TARGET="$(number_to_target "$RAW")"
    [ -z "$TARGET" ] && error "Invalid choice '${RAW}' — expected a number 1-7."
else
    TARGET="$RAW"
fi

git_pull() {
    if [ "$PULL" = true ]; then
        info "Pulling latest code..."
        git -C "$PROJECT_DIR" pull --ff-only || warn "git pull failed or skipped — continuing with current working tree."
    else
        info "Skipping git pull (--no-pull)."
    fi
}

restart_and_check() {
    local service="$1"
    info "Restarting ${service}..."
    sudo systemctl restart "$service"
    sleep 2
    if systemctl is-active --quiet "$service"; then
        success "${service} is running."
    else
        error "${service} failed to start — check: sudo journalctl -u ${service} -n 50"
    fi
}

build_backend() {
    info "━━━ Building backend..."
    cd "$BACKEND_DIR"
    [ -d "$VENV_DIR" ] || error "venv not found at ${VENV_DIR} — run setup.sh first."
    # shellcheck disable=SC1091
    source "$VENV_DIR/bin/activate"
    pip install -r requirements.txt --quiet
    python manage.py migrate --no-input
    python manage.py collectstatic --no-input --clear -v 0
    deactivate
    restart_and_check "$SERVICE_BACKEND"
}

build_frontend() {
    info "━━━ Building frontend..."
    cd "$FRONTEND_DIR"
    npm ci --prefer-offline --quiet
    npm run build
    restart_and_check "$SERVICE_FRONTEND"
}

restart_celery() {
    info "━━━ Restarting Celery worker..."
    [ -d "$VENV_DIR" ] || error "venv not found at ${VENV_DIR} — run setup.sh first."
    restart_and_check "$SERVICE_CELERY"
}

restart_beat() {
    info "━━━ Restarting Celery beat..."
    [ -d "$VENV_DIR" ] || error "venv not found at ${VENV_DIR} — run setup.sh first."
    restart_and_check "$SERVICE_BEAT"
}

show_status() {
    for s in "$SERVICE_BACKEND" "$SERVICE_FRONTEND" "$SERVICE_CELERY" "$SERVICE_BEAT"; do
        echo ""
        sudo systemctl status "$s" --no-pager -l || true
    done
}

show_logs() {
    local choice="$1"
    if [ -z "$choice" ]; then
        echo ""
        echo "  Which service?"
        echo "  1) Backend"
        echo "  2) Frontend"
        echo "  3) Celery worker"
        echo "  4) Celery beat"
        read -p "  Enter your choice [1-4]: " choice
        case "$choice" in
            1) choice=backend ;;
            2) choice=frontend ;;
            3) choice=celery ;;
            4) choice=beat ;;
        esac
    fi
    case "$choice" in
        backend)  sudo journalctl -u "$SERVICE_BACKEND" -f ;;
        frontend) sudo journalctl -u "$SERVICE_FRONTEND" -f ;;
        celery)   sudo journalctl -u "$SERVICE_CELERY" -f ;;
        beat)     sudo journalctl -u "$SERVICE_BEAT" -f ;;
        *) error "Unknown service '${choice}' — use backend, frontend, celery, or beat." ;;
    esac
}

case "$TARGET" in
    backend)
        git_pull
        build_backend
        ;;
    frontend)
        git_pull
        build_frontend
        ;;
    celery)
        git_pull
        restart_celery
        ;;
    beat)
        git_pull
        restart_beat
        ;;
    all)
        git_pull
        build_backend
        build_frontend
        restart_celery
        restart_beat
        ;;
    status)
        show_status
        exit 0
        ;;
    logs)
        show_logs "$2"
        exit 0
        ;;
    *)
        error "Unknown target '${TARGET}'. Use: backend | frontend | celery | beat | all | status | logs <service>"
        ;;
esac

echo ""
success "Done."
