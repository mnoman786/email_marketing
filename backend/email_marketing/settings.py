import sys
from pathlib import Path
from decouple import config

BASE_DIR = Path(__file__).resolve().parent.parent

# True under `manage.py test` — used below to run Celery tasks eagerly
# (in-process, synchronously) so dispatcher tasks that fan out chunk tasks via
# .delay() don't need a live broker/worker in the test environment.
TESTING = 'test' in sys.argv

SECRET_KEY = config('SECRET_KEY', default='django-insecure-dev-key-change-in-production-xyz123')
DEBUG = config('DEBUG', default=True, cast=bool)
ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='*').split(',')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party
    'corsheaders',
    'django_celery_beat',
    'django_celery_results',
    # Apps
    'apps.accounts',
    'apps.contacts',
    'apps.email_templates',
    'apps.smtp_accounts',
    'apps.campaigns',
    'apps.analytics',
    'apps.sequences',
    'apps.inbox',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'email_marketing.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'email_marketing.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

DB_URL = config('DATABASE_URL', default=None)
if DB_URL:
    import dj_database_url
    DATABASES['default'] = dj_database_url.parse(DB_URL)

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Outside MEDIA_ROOT on purpose — never reachable through the public /media/
# static mount. Inbox attachments live here and are only ever served through
# the authenticated, ownership-checked download endpoint in apps.inbox.views.
PRIVATE_MEDIA_ROOT = BASE_DIR / 'private_media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

AUTH_USER_MODEL = 'accounts.User'

# CORS
CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:3000,http://127.0.0.1:3000'
).split(',')
CORS_ALLOW_CREDENTIALS = True

# Celery
CELERY_BROKER_URL = config('REDIS_URL', default='redis://localhost:6379/0')
# Redis instead of django-db: every task run (sends, IMAP polls, sequence
# steps) used to write a result row to the relational DB even though almost
# nothing ever reads it back. Redis + a TTL means results just expire instead
# of accumulating, and CELERY_TASK_IGNORE_RESULT below means most tasks skip
# writing a result at all — only ones that explicitly opt back in (e.g. the
# contact bulk-import task, polled via AsyncResult for progress) store one.
CELERY_RESULT_BACKEND = config('REDIS_URL', default='redis://localhost:6379/0')
CELERY_RESULT_EXPIRES = 3600
CELERY_TASK_IGNORE_RESULT = True
CELERY_CACHE_BACKEND = 'default'
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE
# Long-running tasks (campaign batches) shouldn't be prefetched ahead of
# shorter ones (IMAP polls, tracking) — prefetch=1 means a worker only grabs
# its next task once it's actually free, instead of hoarding several
# long batch jobs while short ones queue up behind them.
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
# Recycle worker child processes periodically — long sending sessions can
# accumulate memory (SMTP connection objects, etc.) that a single process
# would otherwise hold for the lifetime of the worker. Under the gevent pool
# there's a single process running many greenlets, so recycling every 100 tasks
# thrashes (it waits for in-flight greenlets to drain); set this much higher,
# or 0 to disable, via env. Prefork deployments can keep the conservative 100.
CELERY_WORKER_MAX_TASKS_PER_CHILD = config(
    'CELERY_MAX_TASKS_PER_CHILD', default=2000, cast=int
)
# Backstop so a hung SMTP connection or runaway task can't block a worker
# indefinitely; individual tasks (e.g. the batch sender) can set a tighter
# limit themselves, as send_campaign_batch_task does.
CELERY_TASK_TIME_LIMIT = 1800
CELERY_TASK_SOFT_TIME_LIMIT = 1700
# Fan-out dispatchers (bulk import/verify/campaign send) call .delay() on chunk
# tasks and never block waiting on them, so eager mode is only needed to make
# those chunk tasks actually run under the test runner (no live broker/worker
# there); production always uses the real async path.
CELERY_TASK_ALWAYS_EAGER = config('CELERY_TASK_ALWAYS_EAGER', default=TESTING, cast=bool)
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'
CELERY_BEAT_SCHEDULE = {
    'enroll-due-contacts': {
        'task': 'apps.sequences.tasks.enroll_due_contacts',
        'schedule': 300.0,  # every 5 minutes
    },
    'process-due-campaign-steps': {
        'task': 'apps.sequences.tasks.process_due_campaign_steps',
        'schedule': 60.0,
    },
    'poll-imap-replies': {
        'task': 'apps.smtp_accounts.tasks.poll_imap_replies',
        'schedule': 180.0,
    },
    'run-warmup': {
        'task': 'apps.smtp_accounts.tasks.run_warmup',
        'schedule': 900.0,  # every 15 min — volume is spread across the day
    },
    'auto-optimize-campaign-steps': {
        'task': 'apps.sequences.tasks.auto_optimize_campaign_steps',
        'schedule': 1800.0,  # every 30 min
    },
    'refresh-disposable-domains': {
        'task': 'apps.contacts.tasks.refresh_disposable_domains_task',
        'schedule': 604800.0,  # weekly — keep the temp-mail blocklist current
    },
}

# Email verification / temp-mail blocking.
# When True, disposable (temp-mail) addresses are rejected on import and manual add
# instead of being stored as invalid — keeps the lead base clean at the door.
BLOCK_DISPOSABLE_ON_IMPORT = config('BLOCK_DISPOSABLE_ON_IMPORT', default=True, cast=bool)
# Opt-in SMTP RCPT mailbox probe (see apps/contacts/verification.py). Off by default
# to protect the sending IP's reputation.
EMAIL_VERIFY_SMTP_PROBE = config('EMAIL_VERIFY_SMTP_PROBE', default=False, cast=bool)

# Chunk sizes for the dispatcher/chunk-task split in bulk import, re-verification,
# and campaign sending (see apps/contacts/tasks.py, apps/sequences/tasks.py).
# Each chunk runs as its own Celery task so a large job fans out across the
# worker pool's concurrency instead of one task looping over everything
# sequentially. Sized with a safety margin under CELERY_TASK_TIME_LIMIT even at
# a pessimistic per-row/per-send cost (e.g. 100 rows x 8s SMTP-probe timeout
# worst case = ~13 min, well under the 30 min hard limit).
BULK_IMPORT_CHUNK_SIZE = config('BULK_IMPORT_CHUNK_SIZE', default=100, cast=int)
VERIFY_CHUNK_SIZE = config('VERIFY_CHUNK_SIZE', default=100, cast=int)
CAMPAIGN_SEND_BATCH_SIZE = config('CAMPAIGN_SEND_BATCH_SIZE', default=50, cast=int)
# Caps how many due enrollments one process_due_campaign_steps tick will pick
# up (ordered oldest-due-first). Leftovers are swept up on the next 60s tick —
# self-correcting, and bounds both per-tick memory and how many batch tasks
# one tick can flood the queue with.
CAMPAIGN_MAX_DUE_PER_TICK = config('CAMPAIGN_MAX_DUE_PER_TICK', default=5000, cast=int)

# Encryption key for SMTP passwords
ENCRYPTION_KEY = config('ENCRYPTION_KEY', default='')

# Public base URL used to build tracking pixel / click-redirect URLs in emails
SITE_URL = config('SITE_URL', default='http://localhost:8000')

# Frontend base URL — used to build links (e.g. email verification) that the
# user clicks and that resolve to a page in the Next.js app, not the API.
FRONTEND_URL = config('FRONTEND_URL', default='http://localhost:3000')

# Transactional email (account verification, etc.). Distinct from the per-user
# SMTP accounts used to send campaigns — this is the system's own mailbox.
EMAIL_BACKEND = config(
    'EMAIL_BACKEND',
    default='django.core.mail.backends.smtp.EmailBackend',
)
EMAIL_HOST = config('EMAIL_HOST', default='')
EMAIL_PORT = config('EMAIL_PORT', default=587, cast=int)
EMAIL_USE_TLS = config('EMAIL_USE_TLS', default=True, cast=bool)
EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')
DEFAULT_FROM_EMAIL = config('DEFAULT_FROM_EMAIL', default='no-reply@mailflow.local')

# Token lifetime (hours) for email-verification links.
EMAIL_VERIFICATION_TOKEN_HOURS = config(
    'EMAIL_VERIFICATION_TOKEN_HOURS', default=48, cast=int
)

# Redis-backed cache (was LocMemCache — per-process, so it neither shared
# data across worker processes nor actually reduced DB load across them).
# This also makes the IMAP poll-overlap lock in apps/smtp_accounts/tasks.py
# correctly shared across multiple worker processes, not just one.
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': config('REDIS_URL', default='redis://localhost:6379/0'),
        'KEY_PREFIX': 'mailflow',
    }
}
