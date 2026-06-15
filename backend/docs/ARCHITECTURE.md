# Architecture — Xeno Mini CRM Backend

> **Last updated:** June 2026  
> **Status:** All 13 phases complete

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Service Map](#service-map)
3. [Database Schema](#database-schema)
4. [Request Lifecycle](#request-lifecycle)
5. [Campaign Dispatch & Callback Flow](#campaign-dispatch--callback-flow)
6. [Segmentation Engine](#segmentation-engine)
7. [AI Architecture](#ai-architecture)
8. [Security Model](#security-model)
9. [Scale Assumptions & Tradeoffs](#scale-assumptions--tradeoffs)

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Marketer / Client                         │
│              (Swagger UI · Frontend · Postman · cURL)            │
└──────────────────────────┬──────────────────────────────────────┘
                           │  HTTP + WebSocket
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    crm-backend  :8000                            │
│                                                                  │
│  🔐 Auth          POST /auth/login · GET /auth/me               │
│  👥 Customers     GET/POST /customers · POST /customers/import  │
│  📦 Orders        POST /orders · POST /orders/import            │
│  📊 Segments      POST /segments/preview · POST /segments       │
│                   POST /segments/from-nl                         │
│  📣 Campaigns     POST/GET /campaigns                           │
│                   POST /campaigns/{id}/launch                    │
│                   GET /campaigns/{id}/analytics                  │
│  📈 Analytics     GET /analytics/overview                       │
│  🤖 AI            POST /ai/draft-message                        │
│                   GET /ai/insights/{id}                          │
│                   POST /ai/agent/chat  (SSE)                     │
│  ⚡ WebSocket     ws://host/ws/campaigns/{id}  (realtime)       │
│  🔗 Webhooks      POST /webhooks/channel-receipt (internal)     │
└──────┬──────────────────┬───────────────────────────────────────┘
       │                  │
       │          ┌───────▼─────────────────┐
       │          │   channel-service :8001  │
       │          │                          │
       │          │  POST /send              │
       │          │  GET  /health            │
       │          └───────┬─────────────────┘
       │                  │ HMAC-signed callbacks
       │                  └──────────────────────┐
       │                                         │
┌──────▼──────────┐    ┌───────────┐            │
│  PostgreSQL :5432│    │ Redis :6379│            │
│                  │    │           │            │
│  8 tables        │    │ (cache,   │            │
│  Named volume    │    │  future   │            │
│  pgdata          │    │  Celery   │            │
└──────────────────┘    │  broker)  │            │
                        └───────────┘            │
                                                 │
                    ◄────────────────────────────┘
                    (webhook delivery events)
```

---

## Service Map

### crm-backend (port 8000)

| Component | Path | Responsibility |
|---|---|---|
| `app/main.py` | — | FastAPI app, router registration, OpenAPI schema |
| `app/core/config.py` | — | All env vars via pydantic-settings |
| `app/core/database.py` | — | Async SQLAlchemy engine + dual session pattern |
| `app/core/security.py` | — | JWT create/decode, bcrypt verify |
| `app/core/websocket.py` | — | WebSocket connection manager |
| `app/models/` | — | SQLAlchemy ORM models (8 tables) |
| `app/repositories/` | — | All raw DB queries (no business logic) |
| `app/schemas/` | — | Pydantic v2 request/response models |
| `app/services/` | — | Business logic (segment engine, campaign lifecycle, attribution) |
| `app/routers/` | — | HTTP endpoint handlers (thin — delegate to services) |
| `app/tasks/dispatch.py` | — | Background campaign dispatch |
| `app/ai/` | — | LLM client, agent loop, tool registry |

### channel-service (port 8001)

| Component | Responsibility |
|---|---|
| `app/main.py` | `POST /send` (202 immediately) + `GET /health` |
| `app/simulator.py` | Config-driven delivery simulation |
| `app/callbacks.py` | HMAC-signed HTTP callbacks to crm-backend |

---

## Database Schema

### Tables

```
customers
├── id (UUID PK)
├── external_id (VARCHAR, unique nullable)
├── name, email (unique), phone
├── total_spent (NUMERIC 12,2)   ← atomic aggregate
├── order_count (INT)             ← atomic aggregate
├── first_purchase_at, last_purchase_at
├── attributes (JSONB)            ← city, tier, gender, acquisition_channel
├── tags (JSONB array)            ← vip, lapsed, high_value, etc.
├── created_at, updated_at, deleted_at (soft delete)
└── indexes: email, external_id, GIN(attributes), GIN(tags), partial(deleted_at IS NULL)

orders
├── id (UUID PK)
├── customer_id (FK → customers)
├── external_id (VARCHAR, unique nullable)
├── amount (NUMERIC 10,2)
├── items (JSONB)                 ← [{name, qty, price}]
├── channel (VARCHAR)             ← online | app | offline
├── status (VARCHAR)              ← completed
├── ordered_at, created_at
└── indexes: customer_id, ordered_at

segments
├── id (UUID PK)
├── name (VARCHAR)
├── rules (JSONB)                 ← rule DSL
├── member_count (INT)            ← cached after compute
├── last_computed_at
└── created_at, updated_at

segment_members
├── segment_id (FK → segments)
├── customer_id (FK → customers)
└── PRIMARY KEY (segment_id, customer_id)   ← no duplicates

campaigns
├── id (UUID PK)
├── name (VARCHAR)
├── segment_id (FK → segments)
├── channel (VARCHAR)             ← email | sms | whatsapp | rcs
├── message_template (TEXT)       ← with {name} {tier} etc.
├── status (VARCHAR)              ← draft | running | completed
└── created_at, updated_at, launched_at, completed_at

communications
├── id (UUID PK)
├── campaign_id (FK → campaigns)
├── customer_id (FK → customers)
├── channel, message (TEXT)
├── status (VARCHAR)              ← queued | sent | delivered | opened | read | clicked
└── created_at, updated_at

communication_events
├── id (UUID PK)
├── communication_id (FK → communications)
├── event_type (VARCHAR)          ← sent | delivered | opened | read | clicked | failed
├── occurred_at
└── UNIQUE (communication_id, event_type)   ← idempotency key

ai_conversations
├── id (UUID PK)
├── title (VARCHAR)
├── messages (JSONB array)
└── created_at, updated_at
```

### Key Constraints

| Constraint | Location | Purpose |
|---|---|---|
| `UNIQUE(communication_id, event_type)` | `communication_events` | Idempotency — duplicate webhook callbacks silently ignored |
| `UNIQUE(segment_id, customer_id)` | `segment_members` | No customer appears in a segment twice |
| `UNIQUE(email)` on customers | `customers` | Email is the deduplication key for imports |
| Soft delete via `deleted_at` | `customers` | Historical data preserved after "deletion" |

---

## Request Lifecycle

### Standard authenticated request

```
Client
  │  POST /api/v1/campaigns (Authorization: Bearer <jwt>)
  │
  ▼
FastAPI middleware stack
  ├── CORSMiddleware (check origin)
  └── Route match → router handler
        │
        ├── get_current_user(token) dependency
        │     └── decode_access_token(jwt) → email
        │
        ├── get_db_dep() dependency
        │     └── AsyncSession (auto-commit on success, rollback on exception)
        │
        └── Handler → service function → repository → DB
              └── return Pydantic response model
```

### Background task (campaign dispatch)

```
POST /campaigns/{id}/launch
  │
  └── asyncio.create_task(dispatch_campaign(id))
        │  (runs concurrently, not blocking the response)
        │
        ├── recompute segment members
        ├── create Communication rows (status=queued)
        └── for each recipient:
              POST channel-service/send
              (returns 202 — channel-service handles async)
```

> **Why a separate DB session for dispatch:**  
> FastAPI's `Depends(get_db_dep)` is tied to the request lifetime. Once the response is sent, the session closes. Background tasks need their own session via `async with get_db() as db:`.

---

## Campaign Dispatch & Callback Flow

```
Marketer
  │
  ▼  POST /api/v1/campaigns/{id}/launch
crm-backend validates:
  • campaign status == "draft"
  • segment.member_count > 0
  │
  ▼  202 Accepted (response sent immediately)
     asyncio.create_task(dispatch_campaign)
  │
  ▼  [background]
  1. SELECT members from segment_members
  2. Campaign status → "running"
  3. For each member:
     INSERT Communication (status=queued)
     POST http://channel-service:8001/send
         {message_id, campaign_id, customer_id,
          channel, recipient, message}
  4. Campaign status → "completed"
  │
channel-service
  ▼  202 Accepted immediately
     asyncio.create_task(simulate_delivery)
  │
  ▼  [background] per stage, after random delay:
     roll dice against CHANNEL_CONFIG[channel][stage].rate
     if success → next stage
     if fail    → "failed" event
  │
  ▼  For each event (sent / delivered / opened / clicked / failed):
     POST http://crm-backend:8000/api/v1/webhooks/channel-receipt
     Headers: X-Channel-Signature: sha256=<hmac_hex>
     Body: {message_id, event, occurred_at, reason}
  │
crm-backend webhook handler:
  1.  Validate HMAC → 403 if mismatch
  2.  INSERT communication_events ON CONFLICT DO NOTHING
  3.  Skip if duplicate (idempotent)
  4.  UPDATE communications.status (forward-only state machine)
  5.  Broadcast JSON to /ws/campaigns/{id}
  6.  Call attribution_service.attribute_order() if engagement event
  │
  ▼  WebSocket push to connected dashboards:
     {"type": "delivery_event", "event": "delivered",
      "communication_id": "...", "occurred_at": "..."}
```

### Communication status state machine

```
queued ──► sent ──► delivered ──► opened/read ──► clicked
                        │
                        └──► failed (terminal)
```

Rules:
- **Forward-only** — a `delivered` event cannot downgrade a `clicked` communication
- `failed` is terminal — no further updates accepted
- `opened` and `read` are equivalent priority for attribution

---

## Segmentation Engine

### Rule DSL

```json
// Simple rule
{
  "field": "total_spent",
  "op": "gte",
  "value": 5000
}

// Compound rule (recursive AND/OR)
{
  "operator": "AND",
  "conditions": [
    { "field": "total_spent", "op": "gte", "value": 5000 },
    {
      "operator": "OR",
      "conditions": [
        { "field": "days_since_last_purchase", "op": "gte", "value": 30 },
        { "field": "order_count", "op": "lte", "value": 2 }
      ]
    }
  ]
}
```

### Supported fields

| Field | Type | SQL mapping |
|---|---|---|
| `total_spent` | numeric | `customers.total_spent` |
| `order_count` | int | `customers.order_count` |
| `days_since_last_purchase` | int | `EXTRACT(epoch FROM now() - last_purchase_at) / 86400` |
| `days_since_first_purchase` | int | `EXTRACT(epoch FROM now() - first_purchase_at) / 86400` |
| `city` | string | `customers.attributes->>'city'` |
| `tier` | string | `customers.attributes->>'tier'` |
| `acquisition_channel` | string | `customers.attributes->>'acquisition_channel'` |
| `tags_contains` | string | `customers.tags @> '["value"]'` |

### Supported operators

`eq` · `ne` · `gt` · `gte` · `lt` · `lte` · `in` · `contains`

### Security

`compile_rules()` validates every `field` and `op` against an allowlist **before** building any SQL. This is critical because the NL→rules AI path feeds AI-generated JSON directly into this function. Without the allowlist, a prompt injection could create arbitrary SQL fragments.

### Compute flow

```
POST /segments/{id}/launch triggers:
  DELETE FROM segment_members WHERE segment_id = ?
  INSERT INTO segment_members (segment_id, customer_id)
    SELECT ?, id FROM customers
    WHERE <compiled_rule>
    AND deleted_at IS NULL
  UPDATE segments SET member_count = ?, last_computed_at = NOW()
```

All three statements run in a single transaction — no partial state possible.

---

## AI Architecture

### Two surfaces, one tool layer

```
┌─────────────────────────────────────────────────────┐
│                    ai/tools.py                       │
│                                                      │
│  tool_search_customers()    → customer_repo         │
│  tool_preview_segment()     → segment_service       │
│  tool_create_segment()      → segment_service       │
│  tool_draft_message()       → llm_client (FAST)     │
│  tool_launch_campaign()     → asyncio.create_task   │
│  tool_get_campaign_analytics() → campaign_service   │
│  tool_get_insights()        → llm_client (SMART)    │
└──────────────────────────────────────────────────────┘
                        ▲             ▲
          ┌─────────────┘             └──────────────┐
          │                                          │
┌─────────┴──────────┐              ┌────────────────┴────────┐
│  Direct endpoints   │              │  Conversational Agent   │
│                     │              │                         │
│ POST /ai/draft-msg  │              │ POST /ai/agent/chat     │
│ GET  /ai/insights   │              │   ↓ SSE stream          │
│ POST /segments/from-nl             │ run_agent() loop        │
│                     │              │   max 6 iterations      │
│ (FAST model)        │              │   tool_call events      │
│                     │              │   tool_result events    │
└─────────────────────┘              │   text_delta events     │
                                     │   done event            │
                                     │                         │
                                     │ pending_confirmation    │
                                     │ on launch_campaign      │
                                     │ without confirm=True    │
                                     └─────────────────────────┘
```

### Agent SSE event types

| Event type | When | Payload |
|---|---|---|
| `tool_call` | AI calls a tool | `{name, arguments}` |
| `tool_result` | Tool returned | `{name, result}` |
| `text_delta` | Streaming text | `{content}` |
| `done` | Conversation complete | `{message}` |
| `pending_confirmation` | `launch_campaign` called without `confirm=True` | `{campaign_id, message}` |
| `error` | Any exception | `{message}` |

---

## Security Model

### Authentication

- Single admin credential stored as bcrypt hash in env var (`ADMIN_PASSWORD_HASH`)
- JWT tokens, 24h expiry, signed with `JWT_SECRET`
- All routes require `Authorization: Bearer <token>` except `/health` and `/auth/login`

### Webhook integrity (HMAC-SHA256)

```
channel-service signs every callback:
  signature = HMAC-SHA256(request_body_bytes, HMAC_SECRET).hexdigest()
  header: X-Channel-Signature: <signature>

crm-backend validates:
  expected = HMAC-SHA256(request_body_bytes, CHANNEL_HMAC_SECRET).hexdigest()
  if not hmac.compare_digest(signature, expected):
      raise HTTPException(403)
```

`hmac.compare_digest()` is constant-time — prevents timing attacks.

### SQL injection prevention

- Segment `field` and `op` values validated against an allowlist before SQL generation
- All queries use SQLAlchemy parameterized expressions — no raw string interpolation
- `sort_by` in customer list validated against an allowlist before `getattr(Model, sort_by)`

### CORS

Controlled by `FRONTEND_ORIGIN` env var. Set to your actual frontend domain in production.

---

## Scale Assumptions & Tradeoffs

### Current design (demo scale: ~10K customers)

| Component | Approach | Bottleneck at scale |
|---|---|---|
| Campaign dispatch | `asyncio.create_task()` | Blocks event loop for 10K+ HTTP calls |
| Segment compute | On-demand per launch | Full table scan for large datasets |
| Analytics | `GROUP BY` per request | Slow for millions of events |
| Auth | Single admin, env var | No multi-user, no RBAC |

### Phase 10 upgrade path (production scale: 100K+ customers)

**Campaign dispatch → Celery**
```python
# Before (asyncio)
asyncio.create_task(dispatch_campaign(campaign_id))

# After (Celery)
dispatch_campaign.delay(str(campaign_id))
```
Celery workers run in separate processes, can be horizontally scaled, and have built-in retry logic. The stub is ready in `docker-compose.yml` (uncomment `crm-worker`).

**Segment compute → Scheduled refresh**
- For segments used in recurring campaigns, schedule `compute_members()` every 15 min via Celery Beat
- For very large datasets, use PostgreSQL materialized views with `REFRESH MATERIALIZED VIEW CONCURRENTLY`

**Analytics → Pre-aggregation**
- Nightly job aggregates `communication_events` into a summary table per campaign
- Real-time queries hit the summary; only today's events hit the raw table

**Read replicas**
- Route `GET /customers`, `GET /analytics/*`, `POST /segments/preview` to a read replica
- Write operations (order creation, campaign launch, webhooks) stay on primary

### What doesn't change at scale

- HMAC webhook security — same pattern, just more callbacks per second
- Idempotency via `ON CONFLICT DO NOTHING` — works correctly under high concurrency
- Attribution window logic — same query, just add a database index on `communications.created_at`
- AI tools — stateless, already async, no changes needed
