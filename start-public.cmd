@echo off
REM ============================================================
REM  TripPlanner - start the app publicly over HTTPS (for phone)
REM  1) builds the client  2) runs the server on :4000
REM  3) opens a Cloudflare HTTPS tunnel so your phone can connect
REM ============================================================
setlocal
set ROOT=%~dp0

echo [1/3] Building client...
call npm --prefix "%ROOT%client" install
call npm --prefix "%ROOT%client" run build

echo [2/3] Starting backend on http://localhost:4000 ...
start "TripPlanner API" cmd /k node "%ROOT%server\src\index.js"

REM give the server a moment to boot
timeout /t 3 /nobreak >nul

echo [3/3] Opening HTTPS tunnel (watch for the https://...trycloudflare.com URL below)...
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:4000

endlocal
