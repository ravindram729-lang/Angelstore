@echo off
setlocal EnableExtensions
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js nahi mila. Node.js LTS install karein.
  pause
  exit /b 1
)

echo.
echo ============================================
echo   ANGELSTORE CSC - STARTING BACKEND
echo ============================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:8000/api/health; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  echo Backend start ho raha hai...
  start "Angelstore CSC Backend" /D "%~dp0" cmd /k node server.js
) else (
  echo Backend pehle se chal raha hai.
)

set READY=0
for /L %%I in (1,1,30) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://127.0.0.1:8000/api/health; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 (
    set READY=1
    goto READY
  )
  timeout /t 1 /nobreak >nul
)

:READY
if "%READY%"=="0" (
  echo.
  echo [ERROR] Backend 30 seconds me start nahi hua.
  echo Backend CMD window me error dekhein.
  pause
  exit /b 1
)

echo [OK] Backend ready: http://127.0.0.1:8000
start "Angelstore CSC Admin" http://127.0.0.1:8000/admin.html
start "Angelstore CSC Customer" http://127.0.0.1:8000/customer.html

echo.
echo Portal khul gaya. Backend CMD window band na karein.
endlocal
