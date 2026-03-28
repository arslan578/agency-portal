FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY services/creative_service/requirements.txt .
COPY services/shared/requirements.txt /tmp/req_shared.txt
RUN pip install --no-cache-dir -r requirements.txt -r /tmp/req_shared.txt

COPY packages /app/packages
COPY services/creative_service /app/services/creative_service
COPY services/shared /app/services/shared

ENV PYTHONPATH=/app

CMD ["uvicorn", "services.creative_service.main:app", "--host", "0.0.0.0", "--port", "8000"]
