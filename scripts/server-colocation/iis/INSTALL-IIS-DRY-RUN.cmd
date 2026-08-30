@echo off
setlocal EnableExtensions
set "BUNDLE_ROOT=%~dp0.."
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-BuilderIis.ps1" -Mode DryRun -DeploymentRoot "%BUNDLE_ROOT%" %*
exit /b %ERRORLEVEL%
