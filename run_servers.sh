#!/usr/bin/env bash
set -e

# Ensure clean ports before starting
lsof -ti:3000,8000 | xargs kill -9 2>/dev/null || true

# Start FastAPI backend in background
echo "Starting FastAPI backend on port 8000..."
.venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 1

# Start Next.js frontend on port 3000
echo "Starting Next.js frontend on port 3000..."
pnpm dev --port 3000 &
FRONTEND_PID=$!

cleanup() {
  echo "Shutting down servers..."
  kill -9 $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  exit 0
}

trap cleanup EXIT INT TERM

# Robust watchdog loop to keep both servers permanently alive
while true; do
  if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "Restarting backend..."
    .venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000 &
    BACKEND_PID=$!
  fi
  if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo "Restarting frontend..."
    pnpm dev --port 3000 &
    FRONTEND_PID=$!
  fi
  sleep 4
done
