#!/usr/bin/env bash
# =============================================================================
#  MailFlow — Build & Restart Helper
#  Pulls latest code (unless --no-pull), rebuilds the chosen service(s),
#  and restarts the matching systemd unit(s) created by setup.sh.
#
#  Usage:
#    ./build.sh                                    # interactive numbered menu
#    ./build.sh [backend|frontend|celery|beat|all|status|logs] ... [--no-pull]
#    ./build.sh [1|2|3|4|5|6|7] ...                 # same targets, by number
#
#  You can pass SEVERAL targets at once — they're pulled once, then rebuilt
#  in a fixed order (backend → frontend → celery → beat), deduplicated.
#
#  Examples:
#    ./build.sh                     # show menu (accepts e.g. "1 2 4")
#    ./build.sh backend             # just the Django/gunicorn service
#    ./build.sh 2                   # = frontend
#    ./build.sh backend frontend    # rebuild both
#    ./build.sh 1 3 4               # backend + celery + beat
#    ./build.sh celery              # just the Celery worker
#    ./build.sh beat                # just Celery beat
#    ./build.sh backend frontend --no-pull   # rebuild both without git pull
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
TOKENS=()
for arg in "$@"; do
    if [ "$arg" = "--no-pull" ]; then
        PULL=false
    else
        TOKENS+=("$arg")
    fi
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

# Populates the global TOKENS array rather than echoing+capturing via $(...) —
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
    echo "  Tip: pick several at once, e.g. '1 2 4' or '1,2,4'."
    echo ""
    read -p "  Enter your choice(s) [0-7]: " CHOICE
    if [ "$CHOICE" = "0" ] || [ -z "$CHOICE" ]; then
        echo "Bye."
        exit 0
    fi
    # Split the reply on spaces and/or commas into the TOKENS array.
    IFS=', ' read -r -a TOKENS <<< "$CHOICE"
}

if [ ${#TOKENS[@]} -eq 0 ]; then
    show_menu
fi

# Normalise every token (number or name) into a canonical target name.
TARGETS=()
for tok in "${TOKENS[@]}"; do
    [ -z "$tok" ] && continue
    if [[ "$tok" =~ ^[0-9]+$ ]]; then
        t="$(number_to_target "$tok")"
        [ -z "$t" ] && error "Invalid choice '${tok}' — expected a number 0-7."
    else
        t="$tok"
    fi
    TARGETS+=("$t")
done
[ ${#TARGETS[@]} -eq 0 ] && error "No target given."

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

# status/logs are standalone actions (logs blocks on -f), so if either is
# requested we run just that and exit — ignoring any other tokens.
for t in "${TARGETS[@]}"; do
    case "$t" in
        status)
            show_status
            exit 0
            ;;
        logs)
            # The token after `logs` (if any) names the service to tail.
            svc=""
            for i in "${!TARGETS[@]}"; do
                if [ "${TARGETS[$i]}" = "logs" ]; then
                    svc="${TARGETS[$((i + 1))]:-}"
                    break
                fi
            done
            show_logs "$svc"
            exit 0
            ;;
    esac
done

# Expand `all`, then de-duplicate while forcing a sensible build order
# (backend → frontend → celery → beat) regardless of how they were typed.
for t in "${TARGETS[@]}"; do
    if [ "$t" = "all" ]; then
        TARGETS=(backend frontend celery beat)
        break
    fi
done

# Reject unknown targets before doing any work.
for t in "${TARGETS[@]}"; do
    case "$t" in
        backend|frontend|celery|beat) ;;
        *) error "Unknown target '${t}'. Use: backend | frontend | celery | beat | all | status | logs <service>" ;;
    esac
done

SELECTED=()
for canon in backend frontend celery beat; do
    for t in "${TARGETS[@]}"; do
        if [ "$t" = "$canon" ]; then
            SELECTED+=("$canon")
            break
        fi
    done
done

info "Targets: ${SELECTED[*]}"
git_pull   # pull once, up front, no matter how many services we rebuild

for t in "${SELECTED[@]}"; do
    case "$t" in
        backend)  build_backend ;;
        frontend) build_frontend ;;
        celery)   restart_celery ;;
        beat)     restart_beat ;;
    esac
done

echo ""
success "Done — restarted: ${SELECTED[*]}"
