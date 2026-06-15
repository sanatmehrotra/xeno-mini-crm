# Xeno Mini CRM — Backend

An **AI-native Mini CRM** built for D2C/retail brands. Ingest customers and orders, segment audiences with rule-based or natural-language queries, dispatch personalized campaigns over simulated channels, and measure performance with AI-generated insights.

> **Demo brand:** BrewBharat — an Indian D2C coffee brand (275 customers, 1 200 orders seeded).

---

## Table of Contents

1. [Architecture](#architecture)
2. [Tech Stack](#tech-stack)
3. [Quick Start](#quick-start)
4. [Environment Variables](#environment-variables)
5. [API Reference](#api-reference)
6. [Core Concepts](#core-concepts)
7. [Project Structure](#project-structure)
8. [Running Tests](#running-tests)
9. [Deployment](#deployment)
10. [Build Status](#build-status)
11. [Known Limitations & Future Work](#known-limitations--future-work)

---

## Architecture

```
                     Marketer (Swagger UI / Frontend / Postman)
                                        │
                          ┌─────────────▼────────────┐
                          │    crm-backend  :8000     │
                          │                           │
                          │  🔐 Auth                  │
                          │  👥 Customers & Orders    │
                          │  📊 Segments              │
                          │  📣 Campaigns             │
                          │  📈 Analytics             │
                          │  🤖 AI Agent (SSE)        │
                          │  🔗 Webhooks (internal)   │
                          │  ⚡ WebSocket (realtime)  │
                          └──────────┬────────────────┘
                                     │
              ┌──────────────────────┼───────────────────────┐
              │                      │                         │
         PostgreSQL :5432       Redis :6379           channel-service :8001
         (primary DB)           (cache / future       (messaging stub:
          8 tables               Celery broker)        email/SMS/WhatsApp/RCS)
```

**Campaign dispatch → delivery callback flow:**

```
POST /campaigns/{id}/launch
         │
         ▼  (asyncio BackgroundTask)
  recompute segment members
  create Communication rows (status=queued)
  for each recipient:
    POST channel-service/send ──► simulate_delivery() [async]
                                        │
                            fires per-stage callbacks:
                            sent → delivered → opened → clicked
                                        │
                                        ▼
              POST crm-backend/api/v1/webhooks/channel-receipt
                  │  1. HMAC-SHA256 validation
                  │  2. Idempotency (ON CONFLICT DO NOTHING)
                  │  3. Forward-only status state machine
                  │  4. WebSocket broadcast → /ws/campaigns/{id}
                  │  5. Attribution check → attribute_order()
                  ▼
         Marketer's dashboard sees live delivery events
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full technical breakdown.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **API Framework** | FastAPI 0.115.5 (async) |
| **Database** | PostgreSQL 16 via SQLAlchemy 2.0 (async) + asyncpg |
| **Migrations** | Alembic |
| **Cache / Broker** | Redis 7 |
| **Auth** | JWT (python-jose) + bcrypt (passlib) |
| **AI** | OpenRouter API (Claude 3.5 Sonnet / Gemini Flash) |
| **HTTP Client** | httpx (async) |
| **Validation** | Pydantic v2 |
| **Tests** | pytest + pytest-asyncio |
| **Container** | Docker + Docker Compose v2 |
| **Python** | 3.12 |

---

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose v2)
- An [OpenRouter](https://openrouter.ai/keys) API key *(optional — AI features only)*

### 1. Clone

```bash
git clone <repo-url>
cd xeno-mini-crm
```

### 2. Configure environment

```bash
cp crm-backend/.env.example crm-backend/.env
cp channel-service/.env.example channel-service/.env
```

Edit `crm-backend/.env` — the important fields:

| Field | What to set |
|---|---|
| `OPENROUTER_API_KEY` | Your key from openrouter.ai (leave blank to skip AI) |
| `ADMIN_PASSWORD_HASH` | Run `python crm-backend/scripts/hash_password.py <password>` |
| `CHANNEL_HMAC_SECRET` | Any 32+ char string — must match `HMAC_SECRET` in channel-service |
| `JWT_SECRET` | Any long random string |

> **Note on `$$` in the hash:** Docker Compose v2 interpolates `$` signs in env_file values.  
> The hash generator script (`hash_password.py`) outputs the correctly escaped `$$` version automatically.

### 3. Start all services

```bash
docker compose up --build -d
```

This starts: `postgres`, `redis`, `crm-backend`, `channel-service`.

### 4. Run migrations

```bash
docker compose exec crm-backend alembic upgrade head
```

Expected output:
```
INFO  Running upgrade  -> 001_initial_schema, Initial schema — all tables and indexes.
```

### 5. Seed demo data (BrewBharat)

```bash
docker compose exec crm-backend python scripts/seed.py
```

Expected output:
```
Seeding 275 customers...
  Customers: {'created': 275, 'updated': 0, 'total': 275}
Seeding 1200 orders in batches of 100...
  Batch 1: created=100 skipped=0
  ...
Done. Orders: created=1200, skipped=0
```

### 6. Open Swagger UI

- **crm-backend:** http://localhost:8000/docs
- **channel-service:** http://localhost:8001/docs

**Login:**
1. `POST /api/v1/auth/login` → `{ "email": "admin@xeno.local", "password": "admin123" }`
2. Copy `access_token`
3. Click **Authorize** → paste token (no "Bearer" prefix) → **Authorize**

---

## Environment Variables

### crm-backend

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql+asyncpg://user:pass@postgres:5432/xeno_crm` |
| `REDIS_URL` | ✅ | `redis://redis:6379/0` |
| `CHANNEL_SERVICE_URL` | ✅ | `http://channel-service:8001` |
| `CHANNEL_HMAC_SECRET` | ✅ | Shared secret for webhook HMAC validation |
| `JWT_SECRET` | ✅ | Secret for signing JWTs |
| `ADMIN_EMAIL` | ✅ | Login email for the single admin |
| `ADMIN_PASSWORD_HASH` | ✅ | bcrypt hash of admin password (use `hash_password.py`) |
| `OPENROUTER_API_KEY` | ⚠️ | Required for AI features; leave blank to disable |
| `AI_MODEL_FAST` | ⚠️ | Model for fast tasks (default: `google/gemini-flash-1.5`) |
| `AI_MODEL_SMART` | ⚠️ | Model for reasoning tasks (default: `anthropic/claude-3.5-sonnet`) |
| `ATTRIBUTION_WINDOW_HOURS` | ✅ | Hours after campaign send to attribute orders (default: 72) |
| `FRONTEND_ORIGIN` | ✅ | CORS origin for the frontend (default: `http://localhost:3000`) |

### channel-service

| Variable | Required | Description |
|---|---|---|
| `PORT` | ✅ | Service port (default: 8001) |
| `CRM_CALLBACK_URL` | ✅ | Where to send delivery events (crm-backend webhook) |
| `HMAC_SECRET` | ✅ | Must match `CHANNEL_HMAC_SECRET` in crm-backend |

---

## API Reference

All endpoints require `Authorization: Bearer <token>` except `/health` and `/api/v1/auth/login`.

### 🔐 Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Get JWT token |
| `GET` | `/api/v1/auth/me` | Verify token, get current user |

### 👥 Customers

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/customers` | List customers (paginated, searchable, sortable) |
| `POST` | `/api/v1/customers` | Create a customer |
| `POST` | `/api/v1/customers/import` | Bulk upsert by email (JSON array) |
| `GET` | `/api/v1/customers/{id}` | Customer detail + last 10 orders |

### 📦 Orders

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/orders` | Create order (updates customer aggregates + attribution) |
| `POST` | `/api/v1/orders/import` | Bulk import orders (JSON array) |

### 📊 Segments

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/segments/preview` | Dry-run rules — count matching customers |
| `POST` | `/api/v1/segments/from-nl` | Natural language → rules (AI, does NOT save) |
| `POST` | `/api/v1/segments` | Save segment + compute members |
| `GET` | `/api/v1/segments` | List all segments |
| `GET` | `/api/v1/segments/{id}` | Segment detail |
| `GET` | `/api/v1/segments/{id}/preview` | Sample 10 members |
| `DELETE` | `/api/v1/segments/{id}` | Delete segment |

**Segment rule DSL:**
```json
// Simple rule
{ "field": "total_spent", "op": "gte", "value": 5000 }

// Compound rule (AND/OR)
{
  "operator": "AND",
  "conditions": [
    { "field": "total_spent", "op": "gte", "value": 5000 },
    { "field": "days_since_last_purchase", "op": "gte", "value": 30 }
  ]
}
```

Supported fields: `total_spent`, `order_count`, `days_since_last_purchase`, `days_since_first_purchase`, `tags_contains`, `city`, `tier`, `acquisition_channel`

Supported operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`

### 📣 Campaigns

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/campaigns` | Create campaign (status: draft) |
| `GET` | `/api/v1/campaigns` | List campaigns |
| `GET` | `/api/v1/campaigns/{id}` | Campaign detail |
| `POST` | `/api/v1/campaigns/{id}/launch` | Launch → 202 (async dispatch) |
| `GET` | `/api/v1/campaigns/{id}/analytics` | Funnel + attribution stats |
| `DELETE` | `/api/v1/campaigns/{id}` | Delete draft campaign |

**Channels:** `email` · `sms` · `whatsapp` · `rcs`

**Message template variables:** `{name}`, `{email}`, `{total_spent}`, `{order_count}`, `{tier}`, `{city}`, `{days_inactive}`

### 📈 Analytics

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/analytics/overview` | Global totals (customers, orders, campaigns, revenue) |

### 🤖 AI

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/ai/draft-message` | Generate campaign message for a segment |
| `GET` | `/api/v1/ai/insights/{campaign_id}` | AI summary of campaign performance |
| `POST` | `/api/v1/ai/agent/chat` | Conversational agent (SSE streaming) |

**Agent SSE event types:**
```
tool_call       → AI called a tool (e.g. preview_segment)
tool_result     → Tool execution result
text_delta      → Streamed text response chunk
done            → Conversation complete
pending_confirmation → Waiting for user to confirm before launching
```

### ⚡ WebSocket

```
ws://localhost:8000/ws/campaigns/{campaign_id}
```

Receives real-time delivery events as JSON:
```json
{ "type": "delivery_event", "event": "delivered", "communication_id": "...", "occurred_at": "..." }
```

---

## Core Concepts

### Segmentation Engine

Rules are compiled recursively at query time — no pre-materialization. The engine validates fields and operators against an allowlist (defense against injection from the AI path).

`compute_members()` runs `SELECT customer_id FROM customers WHERE <compiled_rule>` and atomically replaces `segment_members` in a single transaction.

### Campaign Lifecycle

```
draft → running → completed
         │
         ▼ (on launch)
  Communication rows: queued → sent → delivered → opened/read → clicked
```

Status updates are **forward-only** — a `clicked` event cannot downgrade to `delivered`.

### Attribution

When an order is created (or a `clicked`/`delivered` event arrives), `attribute_order()` checks if the customer received a campaign communication in the last `ATTRIBUTION_WINDOW_HOURS`. Priority: `clicked > opened/read > delivered > sent`. The winning campaign gets credit.

### HMAC Webhook Security

channel-service signs every callback with `HMAC-SHA256(body, shared_secret)` in the `X-Channel-Signature` header. crm-backend validates using `hmac.compare_digest()` (constant-time, prevents timing attacks). Invalid signatures → 403.

### AI Agent Loop

```
User message
    │
    ▼ (max 6 iterations)
  LLM (with tools)
    ├── tool_call → dispatch_tool() → service function → tool_result
    ├── ...
    └── final text response (streamed via SSE)
```

`launch_campaign` requires `confirm=True` — without it, the agent surfaces a `pending_confirmation` state so the user explicitly approves before any campaign fires.

---

## Project Structure

```
xeno-mini-crm/
├── docker-compose.yml              # Local dev stack (postgres, redis, both services)
├── .gitignore
├── docs/
│   ├── ARCHITECTURE.md             # System diagrams + scale tradeoffs
│   └── AI_WORKFLOW.md              # AI generation log + decisions + prompts
│
├── crm-backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── pytest.ini
│   ├── .env.example                # Template — copy to .env (gitignored)
│   ├── alembic/
│   │   └── versions/001_initial_schema.py
│   ├── app/
│   │   ├── main.py                 # FastAPI app + router registration + OpenAPI schema
│   │   ├── dependencies.py         # get_db_dep, get_current_user
│   │   ├── core/
│   │   │   ├── config.py           # pydantic-settings (all env vars)
│   │   │   ├── database.py         # async engine, session factories
│   │   │   ├── security.py         # JWT create/decode, bcrypt verify
│   │   │   └── websocket.py        # WebSocket connection manager
│   │   ├── models/                 # SQLAlchemy ORM models
│   │   │   ├── customer.py
│   │   │   ├── order.py
│   │   │   ├── segment.py
│   │   │   ├── campaign.py
│   │   │   ├── communication.py
│   │   │   └── ai_conversation.py
│   │   ├── repositories/           # DB queries (all raw SQLAlchemy)
│   │   │   ├── customer_repo.py
│   │   │   ├── order_repo.py
│   │   │   ├── segment_repo.py
│   │   │   └── campaign_repo.py
│   │   ├── schemas/                # Pydantic request/response models
│   │   │   ├── customer.py
│   │   │   ├── order.py
│   │   │   ├── segment.py
│   │   │   └── campaign.py
│   │   ├── services/               # Business logic
│   │   │   ├── customer_service.py
│   │   │   ├── order_service.py
│   │   │   ├── segment_service.py  # Rule compiler + compute_members
│   │   │   ├── campaign_service.py # Lifecycle + funnel analytics
│   │   │   └── attribution_service.py
│   │   ├── routers/                # HTTP endpoints
│   │   │   ├── auth.py
│   │   │   ├── customers.py
│   │   │   ├── orders.py
│   │   │   ├── segments.py
│   │   │   ├── campaigns.py
│   │   │   ├── analytics.py
│   │   │   ├── webhooks.py         # HMAC-validated channel callbacks
│   │   │   └── ai.py
│   │   ├── tasks/
│   │   │   └── dispatch.py         # asyncio campaign dispatch (→ Celery Phase 10)
│   │   └── ai/
│   │       ├── agent.py            # Tool-calling loop + SSE streaming
│   │       ├── tools.py            # Tool registry + dispatch_tool()
│   │       ├── client.py           # OpenRouter LLM wrapper
│   │       └── prompts.py          # System prompts
│   ├── scripts/
│   │   ├── seed.py                 # Load customers.json + orders.json via API
│   │   └── hash_password.py        # Generate bcrypt hash for ADMIN_PASSWORD_HASH
│   ├── seed_data/
│   │   ├── customers.json          # 275 BrewBharat customers (gitignored)
│   │   └── orders.json             # 1200 orders (gitignored)
│   └── tests/
│       ├── conftest.py             # Async DB fixtures
│       ├── test_segmentation.py
│       ├── test_webhooks.py
│       ├── test_campaigns.py
│       ├── test_attribution.py
│       └── test_ai_tools.py
│
└── channel-service/
    ├── Dockerfile
    ├── requirements.txt
    ├── .env.example
    ├── app/
    │   ├── main.py                 # FastAPI app: POST /send, GET /health
    │   ├── config.py               # pydantic-settings
    │   ├── models.py               # SendRequest Pydantic model
    │   ├── simulator.py            # Per-channel delivery simulation (config-driven)
    │   └── callbacks.py            # HMAC-signed callback sender with retry/backoff
    └── tests/
        └── test_send.py
```

---

## Running Tests

```bash
# Start postgres (must be running)
docker compose up postgres redis -d

# Run full test suite
docker compose exec crm-backend pytest tests/ -v

# Run a specific test file
docker compose exec crm-backend pytest tests/test_segmentation.py -v

# With coverage
docker compose exec crm-backend pytest tests/ --cov=app --cov-report=term-missing
```

**Test coverage areas:**
- Segmentation rule compiler (simple + compound AND/OR rules)
- Webhook HMAC validation + idempotency
- Campaign lifecycle + delivery funnel
- Order attribution (engagement priority)
- AI tool functions (without LLM calls — mocked)
- Agent loop (pending_confirmation guardrail)
- channel-service /send endpoint + simulator + callback signing

---

## Deployment

### Option A: Railway (recommended for demos/startups)

1. Push repo to GitHub
2. [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add **PostgreSQL** plugin → add **Redis** plugin
4. Add a second service for `channel-service` (point to `./channel-service`)
5. Set all env vars in Railway's Variables panel (never use `.env` files in production)
6. Railway auto-detects Dockerfiles and deploys both services

### Option B: Render

1. Create two **Web Services** (one per service directory)
2. Create a **PostgreSQL** database + **Redis** instance
3. Set env vars per service in Render's dashboard
4. Point build context to each service directory

### Option C: Manual VPS / Docker Swarm

```bash
# On your server
git clone <repo>
cp crm-backend/.env.example crm-backend/.env
# Edit .env with production values
docker compose up -d --build
docker compose exec crm-backend alembic upgrade head
```

### Production checklist

- [ ] Replace `ADMIN_PASSWORD_HASH` with a strong password
- [ ] Use a random 64-char `JWT_SECRET`
- [ ] Use a random 32-char `CHANNEL_HMAC_SECRET`
- [ ] Set `FRONTEND_ORIGIN` to your actual frontend domain
- [ ] Set `OPENROUTER_API_KEY`
- [ ] Enable HTTPS (use a reverse proxy: nginx, Caddy, or Traefik)
- [ ] Set up database backups (pg_dump on a cron)
- [ ] Never commit `.env` files

### Data management

```bash
# Backup database
docker exec xeno-mini-crm-postgres-1 pg_dump -U user xeno_crm > backup_$(date +%Y%m%d).sql

# Restore database
docker exec -i xeno-mini-crm-postgres-1 psql -U user xeno_crm < backup.sql

# Wipe all data and start fresh (DESTRUCTIVE)
docker compose down -v
docker compose up -d
docker compose exec crm-backend alembic upgrade head
```

---

## Build Status

| Phase | Feature | Status |
|---|---|---|
| 1 | Scaffold (FastAPI, Docker, Alembic) | ✅ Complete |
| 2 | Database Schema (8 tables, indexes) | ✅ Complete |
| 3 | Customers & Orders CRUD | ✅ Complete |
| 4 | Seed Data (275 customers, 1200 orders) | ✅ Complete |
| 5 | Segmentation Engine (recursive rules) | ✅ Complete |
| 6 | Channel Service (simulator + callbacks) | ✅ Complete |
| 7 | Campaigns Core (lifecycle + analytics) | ✅ Complete |
| 8 | Auth (JWT + bcrypt single-admin) | ✅ Complete |
| 9 | AI Layer (agent + tools + SSE) | ✅ Complete |
| 10 | Scale Upgrade (Celery) | ⏳ Stubbed — uncomment in compose |
| 11 | Order Attribution | ✅ Complete |
| 12 | Tests | ✅ Complete |
| 13 | Documentation | ✅ Complete |

---

## Known Limitations & Future Work

| Area | Current State | Future Improvement |
|---|---|---|
| **Auth** | Single admin via env vars | Add `users` table + register/invite + RBAC |
| **Campaign dispatch** | `asyncio.BackgroundTask` | Celery workers (Phase 10, pre-scaffolded) |
| **Segment compute** | On-demand per campaign launch | Scheduled background refresh for large datasets |
| **Channel delivery** | Stub simulator only | Real SendGrid / Twilio / WhatsApp Business API |
| **AI models** | OpenRouter (any model) | Fine-tuned model on brand's own campaign data |
| **Analytics** | Per-campaign funnel + global overview | Time-series charts, cohort analysis, LTV trends |
| **Multi-tenancy** | Single brand | Workspace model for agencies managing multiple brands |
| **Rate limiting** | None | Add slowapi middleware per endpoint |
| **Observability** | stdout logs only | Add OpenTelemetry + Sentry + Prometheus |
