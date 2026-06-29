from pathlib import Path
from decouple import config

BASE_DIR = Path(__file__).resolve().parent.parent

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
# would otherwise hold for the lifetime of the worker.
CELERY_WORKER_MAX_TASKS_PER_CHILD = 100
# Backstop so a hung SMTP connection or runaway task can't block a worker
# indefinitely; individual tasks (e.g. the batch sender) can set a tighter
# limit themselves, as send_campaign_batch_task does.
CELERY_TASK_TIME_LIMIT = 1800
CELERY_TASK_SOFT_TIME_LIMIT = 1700
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'
CELERY_BEAT_SCHEDULE = {
    'process-scheduled-campaigns': {
        'task': 'apps.campaigns.tasks.process_scheduled_campaigns',
        'schedule': 60.0,
    },
    'recover-stuck-campaigns': {
        'task': 'apps.campaigns.tasks.recover_stuck_campaigns',
        'schedule': 300.0,  # every 5 minutes
    },
    'enroll-due-contacts': {
        'task': 'apps.sequences.tasks.enroll_due_contacts',
        'schedule': 300.0,  # every 5 minutes
    },
    'process-due-sequence-steps': {
        'task': 'apps.sequences.tasks.process_due_sequence_steps',
        'schedule': 60.0,
    },
    'poll-imap-replies': {
        'task': 'apps.smtp_accounts.tasks.poll_imap_replies',
        'schedule': 180.0,
    },
}

# Encryption key for SMTP passwords
ENCRYPTION_KEY = config('ENCRYPTION_KEY', default='')

# Public base URL used to build tracking pixel / click-redirect URLs in emails
SITE_URL = config('SITE_URL', default='http://localhost:8000')

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
