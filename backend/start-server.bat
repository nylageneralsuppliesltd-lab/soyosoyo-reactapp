@echo off
cd /d %~dp0
setlocal
for /f "delims=" %%a in ('type .env ^| findstr /R "^DATABASE_URL="') do set %%a
for /f "delims=" %%a in ('type .env ^| findstr /R "^DIRECT_URL="') do set %%a
for /f "delims=" %%a in ('type .env ^| findstr /R "^AUDIT_DATABASE_URL="') do set %%a
node dist/main.js
