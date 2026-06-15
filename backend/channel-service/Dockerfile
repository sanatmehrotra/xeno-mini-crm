FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

# Render injects $PORT — fall back to 8001 for local Docker use
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8001}
