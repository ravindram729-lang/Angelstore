@echo off
setlocal EnableExtensions
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (echo Node.js LTS required. & pause & exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:8000/api/health;if($r.StatusCode -eq 200){exit 0}else{exit 1}}catch{exit 1}" >nul 2>nul
if errorlevel 1 start "Angelstore CSC Backend" /D "%~dp0" cmd /k node server.js
for /L %%I in (1,1,30) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://127.0.0.1:8000/api/health;if($r.StatusCode -eq 200){exit 0}else{exit 1}}catch{exit 1}" >nul 2>nul
  if not errorlevel 1 goto OPEN
  timeout /t 1 /nobreak >nul
)
echo Backend start nahi hua. Backend CMD window dekhein.
pause
exit /b 1
:OPEN
start "Angelstore CSC Customer" http://127.0.0.1:8000/customer.html
endlocal
