@echo off
echo =================================
echo   GlicoScan v4 — Instalacao
echo =================================
echo.
echo [1/2] Instalando Python...
cd /d "%~dp0backend"
pip install flask flask-cors requests
echo.
echo [2/2] Instalando Frontend...
cd /d "%~dp0frontend"
npm install
echo.
echo ================================
echo  Pronto! Execute RODAR.bat
echo ================================
pause
