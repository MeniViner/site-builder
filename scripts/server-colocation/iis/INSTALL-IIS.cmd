@echo off
setlocal EnableExtensions
set "BUNDLE_ROOT=%~dp0.."
echo This creates only the dedicated loopback-only Builder IIS site and app pool.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-BuilderIis.ps1" -Mode Apply -Confirm SITEBUILDER_IIS_INSTALL -DeploymentRoot "%BUNDLE_ROOT%" %*
exit /b %ERRORLEVEL%
