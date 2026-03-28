FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY services/campaign_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY packages /app/packages
COPY services/campaign_service /app/services/campaign_service
COPY services/shared /app/services/shared
COPY services/account_service /app/services/account_service
COPY services/billing_service /app/services/billing_service
COPY services/platform_service /app/services/platform_service
COPY services/__init__.py /app/services/__init__.py
COPY alembic.ini /app/alembic.ini
COPY migrations /app/migrations
COPY tests /app/tests

ENV PYTHONPATH=/app

CMD ["uvicorn", "services.campaign_service.main:app", "--host", "0.0.0.0", "--port", "8000"]
