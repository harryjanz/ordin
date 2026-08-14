import os

os.environ.setdefault("INTERNAL_SECRET", "test-internal-ci")
os.environ.setdefault("EMAIL_PROVIDER", "smtp")
os.environ.setdefault("SMTP_HOST", "localhost")
os.environ.setdefault("SMTP_PORT", "2525")
os.environ.setdefault("SMTP_USER", "test")
os.environ.setdefault("SMTP_PASSWORD", "test")
os.environ.setdefault("EMAIL_FROM_ADDRESS", "no-reply@ordin.app")
os.environ.setdefault("AWS_REGION", "us-east-1")
