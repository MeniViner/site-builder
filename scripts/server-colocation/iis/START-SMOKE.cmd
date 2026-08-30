@echo off
setlocal EnableExtensions
echo IIS/iisnode startup is owned by IIS. This command performs the localhost liveness smoke check only.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Test-BuilderIisHealth.ps1" %*
exit /b %ERRORLEVEL%
