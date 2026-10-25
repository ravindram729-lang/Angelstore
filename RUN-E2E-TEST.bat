@echo off
setlocal
cd /d %~dp0
if exist data.json del /q data.json
if exist e2e-server.pid del /q e2e-server.pid
start "Angelstore E2E Server" /b cmd /c "set PORT=8015&&node server.js > e2e-server.log 2>&1"
timeout /t 2 /nobreak >nul
node E2E-TEST.js
set ERR=%ERRORLEVEL%
for /f "tokens=2" %%P in ('tasklist /FI "IMAGENAME eq node.exe" /FO LIST ^| findstr "PID:"') do taskkill /PID %%P /F >nul 2>&1
exit /b %ERR%
