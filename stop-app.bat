@echo off
title Stop Sales and Inventory Server
taskkill /F /IM php.exe >nul 2>&1
echo Server stopped successfully.
timeout /t 2 >nul
