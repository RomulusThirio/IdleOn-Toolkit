@echo off
setlocal DisableDelayedExpansion
REM Download only this file. It fetches the installer and menu from GitHub.
set "REPO_URL=https://github.com/RomulusThirio/IdleOn-Toolkit.git"
set "REPO_DIR=%LOCALAPPDATA%\IdleOnToolkit"

where git.exe >nul 2>nul
if errorlevel 1 (
  echo Git for Windows is required: https://git-scm.com/download/win
  echo Install it, then run this file again.
  pause
  exit /b 1
)
if exist "%REPO_DIR%\.git" (
  call :check_origin
  if errorlevel 1 goto failed
  call :check_branch
  if errorlevel 1 goto failed
  git -C "%REPO_DIR%" pull --ff-only origin main
  if errorlevel 1 goto failed
) else (
  if exist "%REPO_DIR%" (
    echo The update folder exists but is not a Git repository: "%REPO_DIR%"
    echo Rename that folder before retrying. No files were changed.
    goto failed
  )
  git clone --branch main --single-branch -- "%REPO_URL%" "%REPO_DIR%"
  if errorlevel 1 goto failed
)
if not exist "%REPO_DIR%\install.ps1" goto failed
if not exist "%REPO_DIR%\menu.js" goto failed
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO_DIR%\install.ps1" -GamePath "%~1"
if errorlevel 1 goto failed
echo.
echo All done. Start IdleOn normally. Press F8 for IdleOn Toolkit.
pause
exit /b 0

:check_origin
git -C "%REPO_DIR%" config --get remote.origin.url "^https://github[.]com/RomulusThirio/IdleOn-Toolkit[.]git$" >nul
if not errorlevel 1 exit /b 0
echo The cached repository belongs to a different URL. Rename "%REPO_DIR%" first.
exit /b 1

:check_branch
set "BRANCH_FILE=%REPO_DIR%\.git\idleon-toolkit-branch.tmp"
git -C "%REPO_DIR%" symbolic-ref --quiet --short HEAD > "%BRANCH_FILE%"
if errorlevel 1 goto branch_failed
set "CURRENT_BRANCH="
set /p "CURRENT_BRANCH="<"%BRANCH_FILE%"
del /q "%BRANCH_FILE%" >nul 2>nul
if "%CURRENT_BRANCH%"=="main" exit /b 0
echo The cached repository is not on main. Switch it to main before updating.
exit /b 1
:branch_failed
del /q "%BRANCH_FILE%" >nul 2>nul
echo The cached repository is not on main. Switch it to main before updating.
exit /b 1

:failed
echo.
echo Update did not complete. Read the message above; close IdleOn before retrying.
echo For repository access errors, check your GitHub sign-in and permissions.
echo No existing Git edits are discarded automatically.
pause
exit /b 1
