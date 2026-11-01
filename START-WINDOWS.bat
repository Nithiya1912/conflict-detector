@echo off
title CICD AI - Cross-Instruction Conflict Detector
cd /d "%~dp0backend"

rem --- find Python 3.11+ ---
set PY=
where py >nul 2>nul && set PY=py -3
if not defined PY ( where python >nul 2>nul && set PY=python )
if not defined PY (
  echo.
  echo  Python is not installed.
  echo  Please install Python 3.11 or newer from https://www.python.org/downloads/
  echo  IMPORTANT: tick "Add python.exe to PATH" during installation, then run this file again.
  echo.
  pause
  exit /b 1
)

rem --- first run: create the private Python environment and install packages ---
if not exist .venv\Scripts\python.exe (
  echo First-time setup: installing required packages. This takes 2-5 minutes and needs internet...
  %PY% -m venv .venv || ( echo Could not create the Python environment. & pause & exit /b 1 )
  .venv\Scripts\python.exe -m pip install --quiet --upgrade pip
  .venv\Scripts\python.exe -m pip install --quiet -r requirements.txt || ( echo Package installation failed - check the internet connection and try again. & pause & exit /b 1 )
)
if not exist .env copy .env.example .env >nul

echo.
echo  ============================================================
echo   CICD AI is starting...
echo   The browser will open at  http://localhost:8000
echo   Keep this window open while using the app.
echo   To stop the app, close this window.
echo  ============================================================
echo.
start "" cmd /c "timeout /t 8 /nobreak >nul & start http://localhost:8000"
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
pause
