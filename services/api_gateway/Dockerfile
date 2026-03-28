FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements from all services
# We use a trick to copy them to distinct names so we can install them all
COPY services/account_service/requirements.txt /tmp/req_account.txt
COPY services/agent_service/requirements.txt /tmp/req_agent.txt
COPY services/api_gateway/requirements.txt /tmp/req_api_gateway.txt
COPY services/audience_service/requirements.txt /tmp/req_audience.txt
COPY services/auth_service/requirements.txt /tmp/req_auth.txt
COPY services/billing_service/requirements.txt /tmp/req_billing.txt
COPY services/campaign_service/requirements.txt /tmp/req_campaign.txt
COPY services/creative_service/requirements.txt /tmp/req_creative.txt
COPY services/intelligence_service/requirements.txt /tmp/req_intelligence.txt
COPY services/policy_service/requirements.txt /tmp/req_policy.txt
COPY services/reporting_service/requirements.txt /tmp/req_reporting.txt
COPY services/i18n_service/requirements.txt /tmp/req_i18n.txt
COPY services/shared/requirements.txt /tmp/req_shared.txt

# Install all requirements
RUN pip install --no-cache-dir \
    -r /tmp/req_account.txt \
    -r /tmp/req_agent.txt \
    -r /tmp/req_api_gateway.txt \
    -r /tmp/req_audience.txt \
    -r /tmp/req_auth.txt \
    -r /tmp/req_billing.txt \
    -r /tmp/req_campaign.txt \
    -r /tmp/req_creative.txt \
    -r /tmp/req_intelligence.txt \
    -r /tmp/req_policy.txt \
    -r /tmp/req_reporting.txt \
    -r /tmp/req_i18n.txt \
    -r /tmp/req_shared.txt

# Copy source code
COPY packages /app/packages
COPY services /app/services
COPY integrations /app/integrations
COPY run_heartbeat.py /app/run_heartbeat.py


# Set PYTHONPATH
ENV PYTHONPATH=/app

# Expose port
EXPOSE 8000

# Start the Gateway
CMD ["uvicorn", "services.api_gateway.main:app", "--host", "0.0.0.0", "--port", "8000"]
