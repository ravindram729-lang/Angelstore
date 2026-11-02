@echo off
setlocal
cd /d "%~dp0"
set "STAMP=%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%"
set "STAMP=%STAMP: =0%"
if not exist backups mkdir backups
copy /y data.json "backups\data_%STAMP%.json" >nul
if not exist "backups\payments_%STAMP%" mkdir "backups\payments_%STAMP%"
copy /y uploads\payments\* "backups\payments_%STAMP%\" >nul 2>nul
 echo Backup complete: backups\data_%STAMP%.json
pause
endlocal
