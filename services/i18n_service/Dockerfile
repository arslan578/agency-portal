FROM python:3.11-slim

WORKDIR /app

COPY ./services/i18n_service/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /app/requirements.txt

COPY ./services/i18n_service /app/services/i18n_service
# Need to copy packages if referenced? i18n seems self contained.
# But main.py imports "services.i18n_service.translator". So we need root context.
# We are copying into /app/services/i18n_service.
# PYTHONPATH needs to include /app.

ENV PYTHONPATH=/app
ENV PORT=8000

CMD ["uvicorn", "services.i18n_service.main:app", "--host", "0.0.0.0", "--port", "8000"]
