# KaivoCore - Run Commands

## Setup (One Time)

### 1. Create Database
```bash
createdb kaivo
```

### 2. Create Enum Types (Required Before Migration)
```bash
psql -U $(whoami) -d kaivo << 'EOF'
DO $$ BEGIN CREATE TYPE plantier AS ENUM ('FREE', 'STARTER', 'GROWTH', 'SCALE', 'ENTERPRISE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE planstatus AS ENUM ('DRAFT', 'CONVERTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE agencyrole AS ENUM ('ADMIN', 'MEMBER', 'VIEWER'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE clientrole AS ENUM ('OPERATOR', 'VIEWER'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE invoicestatus AS ENUM ('DRAFT', 'SENT', 'PAID', 'OVERDUE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE campaignstatus AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'DISABLED', 'COMPLETED', 'ERROR'); EXCEPTION WHEN duplicate_object THEN null; END $$;
EOF
```

### 3. Run Migrations
```bash
cd /Users/deeptanshusankhwar/Documents/templates/KaivoCore
export $(cat .env | grep -v '^#' | xargs)
export PYTHONPATH="${PWD}:${PYTHONPATH}"
python3 -m alembic upgrade head
```

### 4. Install Dependencies
```bash
# Python dependencies
find services -name "requirements.txt" -exec pip3 install -r {} \;
pip3 install alembic python-dotenv

# Frontend dependencies
cd apps/frontend && npm install && cd ../..
```

---

## Run Services

**Note:** If using a virtual environment (`.venv`), activate it first:
```bash
source .venv/bin/activate
```

### Terminal 1: Backend API
```bash
cd /Users/deeptanshusankhwar/Documents/templates/KaivoCore
export $(cat .env | grep -v '^#' | xargs)
export PYTHONPATH="${PWD}:${PYTHONPATH}"
python3 -m uvicorn services.api_gateway.main:app --host 0.0.0.0 --port 8000
```
**URL:** http://localhost:8000

### Terminal 2: Celery Worker
```bash
cd /Users/deeptanshusankhwar/Documents/templates/KaivoCore
export $(cat .env | grep -v '^#' | xargs)
export PYTHONPATH="${PWD}:${PYTHONPATH}"
python3 -m celery -A services.shared.celery_app worker --loglevel=INFO
```

### Terminal 3: Frontend
```bash
cd /Users/deeptanshusankhwar/Documents/templates/KaivoCore/apps/frontend

# Create .env.local if it doesn't exist
cat > .env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
EOF

npm run dev
```
**URL:** http://localhost:3000

**Note:** Replace `your-google-client-id` with actual Google OAuth credentials if you want Google Sign-In to work.

### Terminal 4: Redis (if not running)
```bash
redis-server
```

---

## Verify

### Check Backend
```bash
curl http://localhost:8000/healthz
```

### Check Frontend
Open browser: http://localhost:3000

### Check Celery
```bash
cd /Users/deeptanshusankhwar/Documents/templates/KaivoCore
python3 run_heartbeat.py
```

---

## Stop Services

```bash
# Kill backend
lsof -ti:8000 | xargs kill -9

# Kill frontend
lsof -ti:3000 | xargs kill -9

# Kill celery
pkill -f "celery.*worker"
```

---

## Reset Database (if needed)

```bash
dropdb kaivo
createdb kaivo
# Then run enum types creation and migrations again
```

