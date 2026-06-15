# =============================================================================
# Dockerfile — crm-backend (production-ready)
# =============================================================================
# Multi-stage build:
#   builder  → installs Python deps into a clean venv
#   runtime  → copies only the venv + app code; no build tools in final image
#
# Railway detects this automatically when the root directory is set to
# backend/crm-backend in the Railway dashboard.
# =============================================================================

# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build deps (needed by some packages like psycopg2-binary, bcrypt)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Create an isolated venv
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

# Non-root user for security
RUN useradd --no-create-home --shell /bin/false appuser

WORKDIR /app

# Runtime system deps only
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy venv from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy application code
COPY --chown=appuser:appuser . .

USER appuser

EXPOSE 8000

# Run Alembic migrations then start Uvicorn.
# Railway sets $PORT; fall back to 8000 for local use.
CMD alembic upgrade head && \
    uvicorn app.main:app \
      --host 0.0.0.0 \
      --port ${PORT:-8000} \
      --workers 2 \
      --log-level info
