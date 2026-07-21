@echo off
setlocal EnableExtensions
set "BUNDLE_ROOT=%~dp0.."
echo This removes only the dedicated Builder IIS site and unused app pool; files and MongoDB are preserved.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Rollback-BuilderIis.ps1" -Mode Apply -Confirm SITEBUILDER_IIS_ROLLBACK -DeploymentRoot "%BUNDLE_ROOT%" %*
exit /b %ERRORLEVEL%
