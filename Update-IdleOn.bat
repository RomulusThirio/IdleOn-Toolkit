@echo off
setlocal
REM Repository owner: replace this URL once before sharing this file.
set "REPO_URL=https://github.com/YOUR_USERNAME/idleon-travel.git"
set "REPO_DIR=%LOCALAPPDATA%\IdleOnTravel"

if "%REPO_URL%"=="https://github.com/YOUR_USERNAME/idleon-travel.git" (
  echo Setup needed: edit REPO_URL in this file to your GitHub repository URL.
  pause
  exit /b 1
)
where git.exe >nul 2>nul
if errorlevel 1 (
  echo Git for Windows is required: https://git-scm.com/download/win
  echo Install it, then run this file again.
  pause
  exit /b 1
)
if exist "%REPO_DIR%\.git" (
  for /f "delims=" %%U in ('git -C "%REPO_DIR%" remote get-url origin') do set "CURRENT_URL=%%U"
  call :check_origin
  if errorlevel 1 goto failed
  git -C "%REPO_DIR%" pull --ff-only
  if errorlevel 1 goto failed
) else (
  if exist "%REPO_DIR%" (
    echo The update folder exists but is not a Git repository: "%REPO_DIR%"
    echo Rename that folder before retrying. No files were changed.
    goto failed
  )
  git clone -- "%REPO_URL%" "%REPO_DIR%"
  if errorlevel 1 goto failed
)
if not exist "%REPO_DIR%\install.ps1" goto failed
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO_DIR%\install.ps1" -GamePath "%~1"
if errorlevel 1 goto failed
echo.
echo All done. Start IdleOn normally. Press F8 for the travel menu.
pause
exit /b 0

:check_origin
if "%CURRENT_URL%"=="%REPO_URL%" exit /b 0
echo The cached repository belongs to a different URL. Rename "%REPO_DIR%" first.
exit /b 1

:failed
echo.
echo Update did not complete. Read the message above; close IdleOn before retrying.
pause
exit /b 1
