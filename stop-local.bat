@echo off
setlocal
cd /d "%~dp0"
node scripts\stop-server.js
echo.
node scripts\local-server.js status
echo.
pause
