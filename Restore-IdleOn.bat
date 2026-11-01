@echo off
setlocal
if exist "%~dp0install.ps1" (
  set "INSTALLER=%~dp0install.ps1"
) else (
  set "INSTALLER=%LOCALAPPDATA%\IdleOnTravel\install.ps1"
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%INSTALLER%" -Restore -GamePath "%~1"
pause
