#!/bin/bash
# CICD AI - double-click to start on macOS (or run: bash START-MAC.command)
cd "$(dirname "$0")/backend" || exit 1

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python is not installed. Install Python 3.11+ from https://www.python.org/downloads/ and run this again."
  read -r -p "Press Enter to close"; exit 1
fi

if [ ! -x .venv/bin/python ]; then
  echo "First-time setup: installing required packages (2-5 minutes, needs internet)..."
  python3 -m venv .venv || { echo "Could not create the Python environment."; read -r; exit 1; }
  .venv/bin/python -m pip install --quiet --upgrade pip
  .venv/bin/python -m pip install --quiet -r requirements.txt || { echo "Package installation failed - check internet and retry."; read -r; exit 1; }
fi
[ -f .env ] || cp .env.example .env

echo ""
echo "  CICD AI is starting... the browser will open at http://localhost:8000"
echo "  Keep this window open while using the app. Close it to stop."
echo ""
(sleep 8 && open "http://localhost:8000") &
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
