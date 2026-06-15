"""
crm-backend — FastAPI application entry point.

Routes added per phase:
  Phase 1:  /health
  Phase 3:  /api/v1/customers, /api/v1/orders
  Phase 5:  /api/v1/segments
  Phase 7:  /api/v1/campaigns, /api/v1/webhooks, /ws/campaigns/{id}, /api/v1/analytics
  Phase 8:  /api/v1/auth
  Phase 9:  /api/v1/ai
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from fastapi.openapi.utils import get_openapi

from app.core.config import settings

# Bearer security scheme — shows up in Swagger Authorize button
_bearer_scheme = HTTPBearer(auto_error=False)

app = FastAPI(
    title="Xeno Mini CRM",
    description="AI-native Mini CRM — backend API\n\n**Auth:** Click **Authorize** (top right), paste your JWT from `POST /api/v1/auth/login`.",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    swagger_ui_parameters={"persistAuthorization": True},
)

# CORS — allow all configured frontend origins (dev + production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Health check (unauthenticated)
# ---------------------------------------------------------------------------

@app.get("/health", tags=["health"])
async def health() -> dict:
    """Liveness probe — returns service name and status."""
    return {"service": "crm-backend", "status": "ok"}


# ---------------------------------------------------------------------------
# Routers — registered as each phase is completed
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Routers — order here controls order in /docs
# ---------------------------------------------------------------------------

# 1. Auth (first in docs)
from app.routers import auth  # noqa: E402
app.include_router(auth.router, prefix="/api/v1")

# 2. Customers & Orders
from app.routers import customers, orders  # noqa: E402
app.include_router(customers.router, prefix="/api/v1")
app.include_router(orders.router, prefix="/api/v1")

# 3. Segmentation
from app.routers import segments  # noqa: E402
app.include_router(segments.router, prefix="/api/v1")

# 4. Campaigns & Analytics
from app.routers import campaigns, analytics  # noqa: E402
app.include_router(campaigns.router, prefix="/api/v1")
app.include_router(analytics.router, prefix="/api/v1")

# 5. AI
from app.routers import ai  # noqa: E402
app.include_router(ai.router, prefix="/api/v1")

# 6. Webhooks — internal, hidden from public docs
from app.routers import webhooks  # noqa: E402
app.include_router(webhooks.router, prefix="/api/v1")

# 7. WebSocket — real-time delivery events
from fastapi import WebSocket, WebSocketDisconnect  # noqa: E402
from app.core.websocket import ws_manager  # noqa: E402

@app.websocket("/ws/campaigns/{campaign_id}")
async def campaign_ws(campaign_id: str, websocket: WebSocket):
    await ws_manager.connect(campaign_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(campaign_id, websocket)



# ---------------------------------------------------------------------------
# Custom OpenAPI schema — injects BearerAuth so Swagger Authorize works
# ---------------------------------------------------------------------------

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    # Register the Bearer security scheme
    schema.setdefault("components", {}).setdefault("securitySchemes", {})
    schema["components"]["securitySchemes"]["BearerAuth"] = {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
    }
    # Apply globally to all operations (except /health, /auth/login, /webhooks)
    PUBLIC_PATHS = {"/health", "/api/v1/auth/login", "/api/v1/webhooks/channel-receipt"}
    for path, path_item in schema.get("paths", {}).items():
        if path in PUBLIC_PATHS:
            continue
        for method_item in path_item.values():
            if isinstance(method_item, dict):
                method_item.setdefault("security", [{"BearerAuth": []}])
    app.openapi_schema = schema
    return schema

app.openapi = custom_openapi
