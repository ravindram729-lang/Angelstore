@echo off
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -match 'server.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo Angelstore CSC backend stopped.
pause
