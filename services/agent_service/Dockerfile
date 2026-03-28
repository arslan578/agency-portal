FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY services/agent_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY packages /app/packages
COPY services/agent_service /app/services/agent_service

ENV PYTHONPATH=/app

CMD ["uvicorn", "services.agent_service.main:app", "--host", "0.0.0.0", "--port", "8000"]
