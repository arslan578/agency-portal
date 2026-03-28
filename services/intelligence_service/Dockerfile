FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY services/intelligence_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY packages /app/packages
COPY services/intelligence_service /app/services/intelligence_service
COPY services/shared /app/services/shared
COPY services/campaign_service /app/services/campaign_service
COPY services/reporting_service /app/services/reporting_service
COPY services/shared /app/shared
COPY run_heartbeat.py /app/run_heartbeat.py

ENV PYTHONPATH=/app

CMD ["uvicorn", "services.intelligence_service.main:app", "--host", "0.0.0.0", "--port", "8000"]
