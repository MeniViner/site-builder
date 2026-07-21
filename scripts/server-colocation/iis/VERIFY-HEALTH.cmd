@echo off
setlocal EnableExtensions
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Test-BuilderIisHealth.ps1" %*
exit /b %ERRORLEVEL%
