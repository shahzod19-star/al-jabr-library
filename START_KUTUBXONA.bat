@echo off
chcp 65001 > nul
title al-jabr.library — Shirin Energy Technical College
color 0A

echo ========================================================
echo       al-jabr.library  ^|  SHIRIN ENERGETIKA TEXNIKUMI
echo       Qayta Tiklanuvchi Energiya Darsliklar Portali
echo ========================================================
echo.
echo Server ishga tushirilmoqda...
echo.
echo Asosiy Kutubxona:   http://localhost:8000
echo Kutubxonachi (Admin): http://localhost:8000/admin
echo.
echo Brauzer avtomatik ochilmoqda...
echo.

start "" "http://localhost:8000"

python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

pause
