FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY services/reporting_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY packages /app/packages
COPY services/reporting_service /app/services/reporting_service

ENV PYTHONPATH=/app

CMD ["uvicorn", "services.reporting_service.main:app", "--host", "0.0.0.0", "--port", "8000"]
