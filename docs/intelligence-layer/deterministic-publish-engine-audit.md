# Deterministic Publish Engine Hardening - Code Audit

**Date:** 2025-01-03  
**Scope:** Campaign Publishing/Launching System  
**Goal:** Audit current publish engine implementation and identify gaps for deterministic hardening

---

## 1. WHERE IS ALL THIS CODE?

### 1.1 Entry Points (API Layer)

#### Campaign Service API
- **Location:** `services/campaign_service/main.py`
- **Endpoints:**
  - `POST /plans/` (Lines 35-36) - Creates a Plan (DRAFT status)
  - `POST /plans/{plan_id}/submit` (Lines 43-50) - Converts Plan → Campaign
    - Calls `crud.convert_to_campaign()`
  - `POST /plans/{plan_id}/launch` - **DOES NOT EXIST** (smoke test expects this)
  
#### API Gateway
- **Location:** `services/api_gateway/main.py`
- Routes campaign service requests to `/campaigns` and `/plans`

---

### 1.2 Campaign Creation/Conversion (CRUD Layer)

#### Convert Plan to Campaign
- **Location:** `services/campaign_service/crud.py`
- **Function:** `convert_to_campaign()` (Lines 54-80)
- **Current Idempotency:**
  - Checks if campaign already exists by `plan_id` (Lines 57-60)
  - Returns existing campaign if found
  - **Gap:** Only idempotent at Plan→Campaign level, not at input level

#### Other CRUD Functions
- `create_plan()` (Lines 24-36) - Creates Plan in DB
- `start_campaign()` (Lines 101-117) - Starts paused campaign
- `pause_campaign()` (Lines 119-132) - Pauses active campaign
- `stop_campaign()` (Lines 134-147) - Stops campaign

---

### 1.3 Async Launch Task (NOT CONNECTED)

- **Location:** `services/campaign_service/tasks.py`
- **Function:** `launch_campaign_task()` (Lines 7-51)
- **Purpose:** Celery task that should orchestrate platform adapter calls
- **Status:** ❌ **Defined but never called anywhere in codebase**
- **Current Behavior:**
  - Imports platform adapters (MetaAdsAdapter, GoogleAdsAdapter)
  - Calls `adapter.create_campaign(plan_data)` for each platform
  - Returns results
- **Gap:** This task exists but is not triggered by Plan→Campaign conversion

---

### 1.4 Platform Adapters

#### Base Adapter
- **Location:** `services/campaign_service/adapters/base.py`
- **Class:** `BaseAdapter`
- **Method:** `_create_campaign_sandbox()` (Lines 57-65)
- **Issue:** Uses `time.time()` for mock IDs (Line 61) - **NON-DETERMINISTIC**
  ```python
  "id": f"mock_{self.platform_name}_{int(time.time())}"
  ```

#### Meta Ads Adapter
- **Location:** `services/campaign_service/adapters/adapter_m.py`
- **Class:** `MetaAdsAdapter`
- **Method:** `_create_campaign_real()` (Lines 8-16)
- **Status:** Stub implementation with hard-coded ID `"9876543210"`

#### Google Ads Adapter
- **Location:** `services/campaign_service/adapters/adapter_g.py`
- **Class:** `GoogleAdsAdapter`
- **Method:** `_create_campaign_real()` (Lines 8-16)
- **Status:** Stub implementation with hard-coded ID `"1234567890"`

---

### 1.5 Platform Service Connectors (Alternative Path)

#### Meta Ads Connector
- **Location:** `services/platform_service/connectors/meta.py`
- **Method:** `launch_campaign()` (Lines 138-161)
- **Issue:** Uses `os.urandom(4)` for platform campaign IDs (Line 153) - **NON-DETERMINISTIC**
  ```python
  "platform_campaign_id": f"meta_stub_{int(os.urandom(4).hex(), 16)}"
  ```
- **Status:** ❌ **Not called by main campaign flow**

---

### 1.6 Agent Service (Separate Flow)

#### Launch Campaign Tool
- **Location:** `services/agent_service/tools.py`
- **Function:** `launch_campaign()` (Lines 182-205)
- **Issue:** Uses `uuid.uuid4()` for campaign_id (Line 200) - **NON-DETERMINISTIC**
  ```python
  campaign_id = str(uuid.uuid4())
  ```
- **Context:** Called by orchestrator/chat interface, separate from main API flow
- **Current Behavior:** Returns stub response, no actual publishing

---

### 1.7 Reference Implementation (Good Pattern)

#### Shopify Integration
- **Location:** `integrations/shopify/services/integration_service.py`
- **Function:** `promote()` (Lines 35-90)
- **Pattern to Follow:**
  - **Deterministic Idempotency Key** (Lines 45-55):
    ```python
    normalized_budget = f"{float(input_data.presets.daily_budget_usd):.2f}"
    raw_key = f"{input_data.shop_domain}|{input_data.product.shopify_product_id}|{input_data.presets.goal.value}|{normalized_budget}|{input_data.presets.channels.value}"
    idempotency_key = hashlib.md5(raw_key.encode()).hexdigest()
    ```
  - **Idempotency Check** (Lines 58-65):
    ```python
    existing_campaign = await self.persistence.get_campaign_by_idempotency_key(idempotency_key)
    if existing_campaign:
        return existing_campaign  # Return existing, don't create duplicate
    ```
  - **Status:** ✅ This is the pattern to replicate

---

## 2. HOW IS IT CURRENTLY WORKING?

### 2.1 Current Flow (API Path - Main Flow)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Frontend → POST /plans/                                     │
│    ├─ Creates Plan (DRAFT status) in database                  │
│    ├─ Returns Plan ID                                          │
│    └─ No platform publishing                                    │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Frontend → POST /plans/{plan_id}/submit                     │
│    ├─ Calls crud.convert_to_campaign(plan_id)                  │
│    ├─ Checks if campaign exists (by plan_id only)              │
│    ├─ Creates Campaign record in database                      │
│    ├─ Sets campaign.status = ACTIVE                            │
│    └─ Returns Campaign object                                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. ❌ NO PLATFORM PUBLISHING HAPPENS                            │
│    ├─ launch_campaign_task() exists but is never called        │
│    ├─ Platform adapters are not invoked                        │
│    ├─ Campaign exists in DB but not on Meta/Google             │
│    └─ platform_campaign_ids remains empty {}                   │
└─────────────────────────────────────────────────────────────────┘
```

**Current State:** Campaigns are created in Kaivo database but never published to advertising platforms.

---

### 2.2 Current Flow (Agent Service Path - Separate)

```
┌─────────────────────────────────────────────────────────────────┐
│ Agent/Orchestrator → launch_campaign() in tools.py             │
│    ├─ Safety layer check (optional, via OS runtime)            │
│    ├─ Generates random UUID: campaign_id = uuid.uuid4()        │
│    ├─ Returns LaunchCampaignOutput with stub data              │
│    └─ No actual platform publishing                            │
└─────────────────────``────────────────────────────────────────────┘
```

**Current State:** Separate flow for chat/agent interface, also doesn't publish to platforms.

---

## 3. CURRENT BEHAVIOR vs EXPECTED BEHAVIOR

### 3.1 Issue 1: No Actual Platform Publishing

#### Current Behavior
- Plan → Campaign conversion only creates a database record
- No platform API calls are made
- Campaign status = ACTIVE but exists only in Kaivo database
- `campaign.platform_campaign_ids` remains empty: `{}`

#### Expected Behavior
- Plan → Campaign conversion should trigger platform publishing
- Platform adapters should be called to create campaigns on Meta/Google
- Platform campaign IDs should be stored in `campaign.platform_campaign_ids`
- Example: `{"meta": "campaign_123", "google": "campaign_456"}`

#### Gap
- `launch_campaign_task()` exists but is never invoked
- No connection between `convert_to_campaign()` and platform publishing
- Platform adapters are defined but not used

---

### 3.2 Issue 2: Non-Deterministic IDs

#### Current Behavior

| Location | Code | Issue |
|----------|------|-------|
| `services/agent_service/tools.py:200` | `campaign_id = str(uuid.uuid4())` | Random UUID - different every time |
| `services/campaign_service/adapters/base.py:61` | `f"mock_{self.platform_name}_{int(time.time())}"` | Time-based - different every time |
| `services/platform_service/connectors/meta.py:153` | `f"meta_stub_{int(os.urandom(4).hex(), 16)}"` | Random - different every time |

**Problem:** Same inputs → different IDs each execution

#### Expected Behavior

**Deterministic ID Generation:**
- Same inputs → same IDs every time
- Use hash-based IDs derived from campaign input
- Example pattern (from Shopify integration):
  ```python
  import hashlib
  
  # Normalize inputs
  normalized_budget = f"{budget:.2f}"
  sorted_platforms = "|".join(sorted(platform_allocations.keys()))
  
  # Create deterministic key
  raw_key = f"{account_id}|{name}|{goal}|{normalized_budget}|{sorted_platforms}"
  campaign_id = f"cmp_{hashlib.md5(raw_key.encode()).hexdigest()[:12]}"
  ```

**Benefits:**
- Idempotency: Same request = same result
- Replayability: Exact execution replay
- Testability: Predictable outputs

---

### 3.3 Issue 3: No Input-Level Idempotency

#### Current Behavior

**Location:** `services/campaign_service/crud.py:54-60`

```python
def convert_to_campaign(db: Session, plan_id: int):
    # Idempotency Check: Returns existing campaign if plan is already converted
    existing_campaign = db.query(models.Campaign).filter(
        models.Campaign.plan_id == plan_id
    ).first()
    if existing_campaign:
        return existing_campaign
```

**Current Logic:**
- ✅ If Plan #1 is converted twice → returns existing campaign (idempotent)
- ❌ If Plan #2 is created with identical campaign inputs → creates duplicate (not idempotent)

**Gap:** Idempotency only at Plan→Campaign level, not at input level

#### Expected Behavior

**Input-Level Idempotency:**
- Generate deterministic idempotency key from campaign inputs
- Check if campaign with same inputs already exists
- If exists, return existing campaign (don't create duplicate)

**Pattern (from Shopify integration):**
```python
# Generate deterministic key
raw_key = f"{account_id}|{name}|{goal}|{normalized_budget}|{platforms_hash}"
idempotency_key = hashlib.md5(raw_key.encode()).hexdigest()

# Check for existing
existing = db.query(Campaign).filter(
    Campaign.idempotency_key == idempotency_key
).first()

if existing:
    return existing  # Return existing, don't create duplicate
```

**Benefits:**
- Prevents duplicate campaigns with identical parameters
- Safe retry behavior
- User-friendly (no accidental duplicates)

---

### 3.4 Issue 4: Non-Deterministic Timestamps

#### Current Behavior

**Database Model:** `packages/db/models.py:208`
```python
created_at = Column(DateTime(timezone=True), server_default=func.now())
```

**Problem:**
- Uses server `now()` - different timestamp every time
- Cannot replay exact execution (timestamps will differ)
- Non-deterministic for replay scenarios

#### Expected Behavior

**Deterministic Timestamps:**
- Accept `created_at` as input parameter (with default to `now()`)
- For replay scenarios, use provided timestamp
- Allows exact replay of execution

**Pattern:**
```python
def convert_to_campaign(db: Session, plan_id: int, created_at: Optional[datetime] = None):
    if created_at is None:
        created_at = datetime.now(timezone.utc)
    
    campaign = models.Campaign(
        # ... other fields ...
        created_at=created_at
    )
```

**Benefits:**
- Replayability: Exact execution replay
- Auditability: Traceable timestamps
- Testing: Predictable timestamp behavior

---

### 3.5 Issue 5: Missing Launch Endpoint

#### Current Behavior

**Expected (by smoke test):** `POST /plans/{id}/launch`  
**Actual:** `POST /plans/{id}/submit`

**Location:** `scripts/staging_api_smoke.sh:92`
```bash
LAUNCH_RES=$(curl -s -X POST "$API_HOST/api/campaign/plans/$PLAN_ID/launch" \
```

**Location:** `services/campaign_service/main.py:43`
```python
@app.post("/plans/{plan_id}/submit", response_model=CampaignOut)
def submit_plan(plan_id: int, db: Session = Depends(get_db)):
```

**Gap:** API endpoint naming mismatch

#### Expected Behavior

**Option 1:** Rename `/submit` to `/launch`  
**Option 2:** Add `/launch` endpoint (keep `/submit` for backward compatibility)

**Recommendation:** Add `/launch` endpoint that triggers platform publishing, keep `/submit` for DB-only conversion

---

### 3.6 Issue 6: Time-Based Randomness in Sandbox

#### Current Behavior

**Location:** `services/campaign_service/adapters/base.py:61`
```python
def _create_campaign_sandbox(self, plan_data: Dict[str, Any]) -> Dict[str, Any]:
    time.sleep(0.5) # Simulate latency
    return {
        "id": f"mock_{self.platform_name}_{int(time.time())}",  # ❌ Time-based
        "status": "created",
        "platform": self.platform_name,
        "sandbox": True
    }
```

**Problem:** Time-based IDs in sandbox mode are non-deterministic

#### Expected Behavior

**Deterministic Sandbox IDs:**
```python
def _create_campaign_sandbox(self, plan_data: Dict[str, Any]) -> Dict[str, Any]:
    # Generate deterministic ID from plan_data
    key_string = f"{plan_data.get('name', '')}|{plan_data.get('budget', 0)}"
    deterministic_id = hashlib.md5(key_string.encode()).hexdigest()[:10]
    
    return {
        "id": f"mock_{self.platform_name}_{deterministic_id}",  # ✅ Deterministic
        "status": "created",
        "platform": self.platform_name,
        "sandbox": True
    }
```

---

## 4. SUMMARY OF PROBLEMS

| # | Location | Issue | Impact | Priority |
|---|----------|-------|--------|----------|
| 1 | `crud.py:54-80` | No input-level idempotency | Duplicate campaigns possible | 🔴 High |
| 2 | `adapters/base.py:61` | `time.time()` in sandbox IDs | Non-deterministic | 🟡 Medium |
| 3 | `connectors/meta.py:153` | `os.urandom()` in IDs | Non-deterministic | 🟡 Medium |
| 4 | `agent_service/tools.py:200` | `uuid.uuid4()` for campaign_id | Non-deterministic | 🟡 Medium |
| 5 | `tasks.py:7-51` | Launch task not called | No platform publishing | 🔴 High |
| 6 | `main.py:43-50` | Endpoint `/submit` not `/launch` | API mismatch | 🟢 Low |
| 7 | All timestamps | Server `now()` used | Non-replayable | 🟡 Medium |

---

## 5. REFERENCE IMPLEMENTATION

### 5.1 Shopify Integration Pattern

**Location:** `integrations/shopify/services/integration_service.py:35-90`

**Key Features:**
1. **Deterministic Idempotency Key** (Lines 45-55)
   - Normalizes inputs (budget to 2 decimal places)
   - Creates hash from normalized inputs
   - Same inputs → same key

2. **Idempotency Check** (Lines 58-65)
   - Queries by idempotency_key
   - Returns existing if found
   - Prevents duplicates

3. **Structured Input Normalization**
   - Budget normalization: `f"{float(budget):.2f}"`
   - Sorted/consistent input ordering
   - Hash-based key generation

**This pattern should be replicated for campaign publishing.**

---

## 6. NEXT STEPS

### 6.1 Immediate Actions

1. **Add Deterministic Idempotency Keys**
   - Implement hash-based idempotency key generation
   - Add `idempotency_key` column to `campaigns` table
   - Check for existing campaigns by idempotency_key

2. **Replace Random/Time-Based IDs**
   - Replace `uuid.uuid4()` with hash-based IDs
   - Replace `time.time()` with deterministic IDs
   - Replace `os.urandom()` with deterministic IDs

3. **Connect Platform Publishing**
   - Invoke `launch_campaign_task()` from `convert_to_campaign()`
   - Or implement platform publishing directly in conversion flow
   - Store platform campaign IDs in `campaign.platform_campaign_ids`

### 6.2 Future Enhancements

1. **Deterministic Timestamps**
   - Accept `created_at` as input parameter
   - Support replay scenarios

2. **API Endpoint Alignment**
   - Add `/launch` endpoint or rename `/submit`
   - Align with smoke test expectations

3. **Testing**
   - Add tests for idempotency behavior
   - Add tests for deterministic ID generation
   - Add replay tests

---

## 7. RELATED ARCHITECTURE

### 7.1 Existing Deterministic Patterns

The orchestrator has existing deterministic patterns that can be referenced:

- **Phase 75:** Deterministic Replay Engine (`orchestrator/phases/phase_75_deterministic_replay_engine/`)
- **Phase 76:** Counterfactual Replay Engine (`orchestrator/phases/phase_76_counterfactual_replay_engine/`)
- **Execution Snapshot Engine:** (`orchestrator/modules/execution_snapshot_engine.js`)

These patterns use:
- Normalized JSON (sorted keys)
- Canonical serialization
- Hash-based verification
- Deterministic replay material

**The publish engine should align with these patterns.**

---

## APPENDIX

### A. Code Locations Reference

```
services/
├── campaign_service/
│   ├── main.py                    # API endpoints
│   ├── crud.py                    # Campaign conversion logic
│   ├── tasks.py                   # Async launch task (not connected)
│   └── adapters/
│       ├── base.py                # Base adapter (time.time() issue)
│       ├── adapter_m.py           # Meta adapter (stub)
│       └── adapter_g.py           # Google adapter (stub)
├── platform_service/
│   └── connectors/
│       └── meta.py                # Meta connector (os.urandom() issue)
├── agent_service/
│   └── tools.py                   # launch_campaign() (uuid.uuid4() issue)
└── api_gateway/
    └── main.py                    # Routes

integrations/
└── shopify/
    └── services/
        └── integration_service.py # ✅ Reference implementation

packages/
└── db/
    └── models.py                  # Campaign model
```

---

### B. Database Schema

**Campaign Model** (`packages/db/models.py:185-217`)

```python
class Campaign(Base):
    id = Column(Integer, primary_key=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=True)
    account_id = Column(Integer, index=True)
    name = Column(String, nullable=False)
    goal = Column(String, nullable=False)
    total_budget_cents = Column(Integer, nullable=False)
    status = Column(Enum(CampaignStatus), default=CampaignStatus.DRAFT)
    platform_allocations = Column(JSON, default={})
    platform_campaign_ids = Column(JSON, default={})  # Should store platform IDs
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
```

**Missing Field:** `idempotency_key` (should be added for deterministic hardening)

---

**End of Audit Document**

