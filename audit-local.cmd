@echo off
node "%~dp0tools\generate_local_audit.mjs"
if errorlevel 1 pause
