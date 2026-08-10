@echo off
echo =================================
echo   GlicoScan v4 — Iniciando...
echo =================================
echo.
taskkill /f /im ngrok.exe >nul 2>&1
taskkill /f /im python.exe >nul 2>&1
timeout /t 1 /nobreak > nul

start "Backend" cmd /k "cd /d "%~dp0backend" && python server.py"
timeout /t 2 /nobreak > nul
start "Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"
timeout /t 3 /nobreak > nul
start "ngrok" cmd /k "ngrok http 3000"
timeout /t 2 /nobreak > nul
start http://localhost:3000

echo.
echo  PC:     http://localhost:3000
echo  iPhone: link no CMD ngrok
pause
