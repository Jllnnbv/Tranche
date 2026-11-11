#!/usr/bin/env bash

# Ambagan / Tranche start script
# Starts both the FastAPI backend and Next.js frontend together

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=========================================="
echo " Starting Ambagan / Tranche Application"
echo "=========================================="

# 1. Clean up any stale processes on ports 8000 & 3000
STALE_PIDS=$(lsof -ti:8000 -ti:3000 2>/dev/null || true)
if [ -n "$STALE_PIDS" ]; then
  echo "Freeing ports 8000 / 3000..."
  kill -9 $STALE_PIDS 2>/dev/null || true
  sleep 1
fi

# 2. Function to kill both servers when Ctrl+C is pressed
cleanup() {
  echo ""
  echo "Stopping servers..."
  kill $(jobs -p) 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 3. Start Backend
echo "Starting Backend on http://localhost:8000..."
.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload &
BACKEND_PID=$!

# Wait briefly for backend to initialize
sleep 1.5

# 4. Start Frontend
echo "Starting Frontend on http://localhost:3000..."
pnpm dev &
FRONTEND_PID=$!

echo ""
echo "------------------------------------------"
echo " App is running!"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:8000/docs"
echo " Press [Ctrl + C] anytime to stop both."
echo "------------------------------------------"
echo ""

# Keep running and wait for background jobs
wait
