@echo off
cd /d "%~dp0"
call npm.cmd run dev:desktop
if errorlevel 1 pause
