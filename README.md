# MailFlow — Premium SaaS Email Marketing Platform

A full-stack, production-ready Email Marketing Platform built with **Next.js** (frontend) and **Django + DRF** (backend).

---

## Architecture Overview

```
email_marketing/
├── backend/                  # Django + DRF API
│   ├── email_marketing/      # Project config (settings, URLs, Celery)
│   ├── apps/
│   │   ├── accounts/         # User auth (JWT)
│   │   ├── contacts/         # Contacts + Lists management
│   │   ├── email_templates/  # Email template editor
│   │   ├── smtp_accounts/    # SMTP accounts (encrypted passwords)
│   │   ├── campaigns/        # Campaign management + sending
│   │   └── analytics/        # Send logs + dashboard stats
│   ├── requirements.txt
│   └── manage.py
└── frontend/                 # Next.js 14 App Router
    ├── app/
    │   ├── (auth)/           # Login + Register pages
    │   └── (dashboard)/      # Protected dashboard pages
    │       ├── dashboard/    # KPI dashboard
    │       ├── contacts/     # Contact management
    │       ├── lists/        # Contact lists
    │       ├── templates/    # Email template editor
    │       ├── smtp/         # SMTP account management
    │       ├── campaigns/    # Campaign management
    │       ├── analytics/    # Send logs & analytics
    │       └── settings/     # User profile & settings
    ├── components/
    │   ├── layout/           # Sidebar, Topbar
    │   ├── ui/               # Button, Input, Card, Dialog, etc.
    │   ├── shared/           # StatusBadge, StatCard, EmptyState, etc.
    │   ├── contacts/         # Contact forms, import dialog
    │   ├── templates/        # HTML template editor (Monaco)
    │   ├── smtp/             # SMTP form + test dialog
    │   └── campaigns/        # Campaign form
    └── lib/
        ├── api.ts            # Axios API client
        ├── types.ts          # TypeScript interfaces
        └── auth.ts           # Auth helpers
```

---

## Features

### Core Modules
| Module | Features |
|--------|----------|
| **Contacts** | Add/edit/delete contacts, bulk CSV import, status tracking, custom fields |
| **Contact Lists** | Create/manage lists, assign contacts to multiple lists |
| **Email Templates** | Monaco HTML editor, subject, preview text, template variables `{{variable}}` |
| **SMTP Accounts** | Multiple SMTP configs, encrypted passwords, TLS/SSL/STARTTLS support |
| **SMTP Routing** | Weighted probability routing across SMTP accounts, per-campaign override |
| **Campaigns** | Create, schedule, send, pause, cancel campaigns |
| **Analytics** | Send logs, SMTP performance, open/click tracking, retry failed |

### Key Technical Features
- **SMTP Probability Routing** — Weighted random selection across SMTP accounts during sending
- **Retry & Fallback** — Up to 3 retries with different SMTP accounts on failure
- **Idempotent Sending** — Celery tasks with deduplication, safe to retry
- **Encrypted SMTP Passwords** — Fernet encryption using `cryptography` library
- **JWT Authentication** — Access + refresh tokens with auto-refresh interceptor
- **Real-time Updates** — Auto-polling for active campaigns every 5-10 seconds
- **Dark/Light Mode** — System-preference aware with manual toggle

---

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- Redis (for Celery, optional for development)

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate     # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Setup environment
cp .env.example .env
# Edit .env with your settings

# Run migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Start development server
python manage.py runserver
```

Backend runs at: **http://localhost:8000**
Django Admin: **http://localhost:8000/admin/**

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Setup environment
# .env.local already has: NEXT_PUBLIC_API_URL=http://localhost:8000

# Start development server
npm run dev
```

Frontend runs at: **http://localhost:3000**

### Start Celery (for campaign sending)

```bash
cd backend

# Start Redis first (or use docker)
# docker run -d -p 6379:6379 redis:alpine

# Start Celery worker
celery -A email_marketing worker -l info

# Start Celery beat (for scheduled campaigns)
celery -A email_marketing beat -l info
```

---

## Environment Variables

### Backend `.env`

```env
SECRET_KEY=your-super-secret-key-here
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
DATABASE_URL=sqlite:///db.sqlite3          # or postgresql://user:pass@host/db
REDIS_URL=redis://localhost:6379/0
CORS_ALLOWED_ORIGINS=http://localhost:3000
# Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
ENCRYPTION_KEY=your-fernet-key-here
```

### Frontend `.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register/` | Create account |
| POST | `/api/auth/login/` | Login (returns JWT) |
| POST | `/api/auth/logout/` | Invalidate refresh token |
| GET/PATCH | `/api/auth/profile/` | View/update profile |
| POST | `/api/auth/change-password/` | Change password |
| POST | `/api/token/refresh/` | Refresh access token |

### Contacts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/contacts/` | List/create contacts |
| GET/PATCH/DELETE | `/api/contacts/{id}/` | View/update/delete contact |
| POST | `/api/contacts/bulk_import/` | Bulk CSV import |
| POST | `/api/contacts/bulk_delete/` | Delete multiple contacts |
| GET/POST | `/api/contacts/lists/` | List/create contact lists |
| GET | `/api/contacts/lists/{id}/contacts/` | Contacts in a list |

### Templates
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/templates/` | List/create templates |
| GET/PATCH/DELETE | `/api/templates/{id}/` | View/update/delete template |
| POST | `/api/templates/{id}/preview/` | Render template with variables |
| POST | `/api/templates/{id}/duplicate/` | Duplicate template |

### SMTP Accounts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/smtp/` | List/create SMTP accounts |
| GET/PATCH/DELETE | `/api/smtp/{id}/` | View/update/delete |
| POST | `/api/smtp/{id}/test/` | Send test email |
| GET | `/api/smtp/stats/` | Probability weights overview |

### Campaigns
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/campaigns/` | List/create campaigns |
| GET/PATCH/DELETE | `/api/campaigns/{id}/` | View/update/delete |
| POST | `/api/campaigns/{id}/send/` | Send now or schedule |
| POST | `/api/campaigns/{id}/pause/` | Pause sending |
| POST | `/api/campaigns/{id}/cancel/` | Cancel campaign |
| POST | `/api/campaigns/{id}/duplicate/` | Duplicate campaign |
| GET | `/api/campaigns/{id}/stats/` | Campaign performance stats |
| GET/POST | `/api/campaigns/{id}/smtp_routes/` | Manage SMTP routing |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/dashboard/` | Dashboard KPI stats |
| GET | `/api/analytics/logs/` | Send logs (filterable) |
| POST | `/api/analytics/logs/retry_failed/` | Retry failed sends |

---

## SMTP Probability Routing

The platform distributes outgoing emails across SMTP accounts using **weighted random selection**:

```
Account A: weight=30  → ~50% of emails
Account B: weight=20  → ~33% of emails
Account C: weight=10  → ~17% of emails
```

**Algorithm:**
1. Sum all active SMTP account weights
2. Generate random number in `[0, total_weight]`
3. Walk cumulative weights until threshold exceeded
4. Use selected account for this email

**Fallback:** If sending fails, a different SMTP account is selected (up to 3 retries).

**Per-Campaign Override:** Enable "Custom SMTP Routing" on a campaign to set different weights per SMTP account just for that campaign.

---

## Production Deployment

### Backend (with PostgreSQL)

```bash
# .env
DATABASE_URL=postgresql://user:pass@host/dbname
DEBUG=False
SECRET_KEY=very-long-random-key
ENCRYPTION_KEY=fernet-key-from-generate-command
ALLOWED_HOSTS=yourdomain.com

# Collect static files
python manage.py collectstatic

# Run with gunicorn
gunicorn email_marketing.wsgi:application --bind 0.0.0.0:8000 --workers 4
```

### Frontend

```bash
npm run build
npm start
# or deploy to Vercel/Netlify
```

### Docker Compose (recommended)

```yaml
version: '3.8'
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: mailflow
      POSTGRES_USER: mailflow
      POSTGRES_PASSWORD: secret
  
  redis:
    image: redis:alpine
  
  backend:
    build: ./backend
    depends_on: [db, redis]
    environment:
      DATABASE_URL: postgresql://mailflow:secret@db/mailflow
      REDIS_URL: redis://redis:6379/0
  
  celery:
    build: ./backend
    command: celery -A email_marketing worker -l info
    depends_on: [db, redis]
  
  frontend:
    build: ./frontend
    environment:
      NEXT_PUBLIC_API_URL: http://backend:8000
```

---

## Tech Stack

### Backend
- **Django 4.2** — Web framework
- **Django REST Framework** — REST API
- **SimpleJWT** — JWT authentication
- **Celery + Redis** — Background task queue
- **cryptography (Fernet)** — SMTP password encryption
- **django-filter** — Query filtering
- **psycopg2** — PostgreSQL driver

### Frontend
- **Next.js 14** (App Router) — React framework
- **TypeScript** — Type safety
- **Tailwind CSS** — Utility-first styling
- **Radix UI** — Accessible primitives
- **Recharts** — Data visualization
- **TanStack Query** — Server state management
- **React Hook Form + Zod** — Forms and validation
- **Monaco Editor** — HTML template editor
- **next-themes** — Dark/light mode
- **Axios** — HTTP client

---

## Multi-Tenant Future

The codebase is designed for future multi-tenancy:
- All models have `user` foreign key — easy to add `organization` FK
- API views filter by `request.user` — extend to `request.user.organization`
- SMTP accounts, contacts, templates, campaigns all scoped per user

---

## License

MIT License — feel free to use for commercial projects.
