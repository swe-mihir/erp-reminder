@echo off
title ERP Reminder
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed. Download the LTS version from https://nodejs.org
  echo  install it, then double-click this file again.
  echo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing packages, this happens only once...
  call npm install --no-audit --no-fund
  if errorlevel 1 ( pause & exit /b 1 )
)
call npx tsx scripts/local.ts
pause
