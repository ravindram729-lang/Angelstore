@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js नहीं मिला। पहले Node.js install करें।
  pause
  exit /b 1
)
powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:8000/api/health; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  start "Angelstore CSC Backend" cmd /k "node server.js"
  timeout /t 2 /nobreak >nul
)
start "Angelstore CSC Customer" http://127.0.0.1:8000/customer.html
endlocal
