@echo off
setlocal enabledelayedexpansion
title Writingway 2.0
color 0A

echo.
echo ================================
echo   Starting Writingway 2.0...
echo ================================
echo.

REM ========================================
REM  SECTION 1: Apply Staged Update
REM ========================================
if not exist ".update\ready.json" goto update_done

echo [*] Staged update detected! Applying update...
echo.

REM Check if zip exists
if not exist ".update\latest.zip" (
    echo [!] Update zip not found. Cleaning up...
    del /q ".update\ready.json" 2>nul
    goto update_done
)

REM Create extract directory
if exist ".update\extract" rmdir /s /q ".update\extract"
mkdir ".update\extract"

REM Unzip using PowerShell Expand-Archive
echo [*] Extracting update...
powershell -NoProfile -Command "Expand-Archive -Path '.update\latest.zip' -DestinationPath '.update\extract' -Force"
if %errorlevel% neq 0 (
    echo [!] Failed to extract update. Cleaning up...
    del /q ".update\ready.json" 2>nul
    del /q ".update\latest.zip" 2>nul
    rmdir /s /q ".update\extract" 2>nul
    goto update_done
)

REM Detect the root folder inside the extracted zip
REM GitHub archives create a folder like "Writingway2-main"
set "EXTRACTED_ROOT="
for /d %%d in (".update\extract\*") do (
    set "EXTRACTED_ROOT=%%d"
    goto found_root
)

:found_root
if "!EXTRACTED_ROOT!"=="" (
    echo [!] Could not find extracted folder. Cleaning up...
    del /q ".update\ready.json" 2>nul
    del /q ".update\latest.zip" 2>nul
    rmdir /s /q ".update\extract" 2>nul
    goto update_done
)

echo [*] Found update root: !EXTRACTED_ROOT!
echo [*] Copying files with exclusions...

REM Copy files using robocopy with exclusions
REM Exclude: .update, .git, projects, backups, models, llama, node_modules, .vscode, .idea, .continue, .claude
REM Also exclude start.bat for safety (user can manually update if needed)
robocopy "!EXTRACTED_ROOT!" "." /E /XD ".update" ".git" "projects" "backups" "models" "llama" "node_modules" ".vscode" ".idea" ".continue" ".claude" /XF "start.bat" /NFL /NDL /NJH /NJS /NC /NS /NP

REM Robocopy returns various codes (0-7 are success, 8+ are errors)
if %errorlevel% geq 8 (
    echo [!] Warning: Some files may not have copied correctly.
) else (
    echo [OK] Update applied successfully!
)

REM Cleanup update files
echo [*] Cleaning up update files...
del /q ".update\ready.json" 2>nul
del /q ".update\latest.zip" 2>nul
rmdir /s /q ".update\extract" 2>nul

echo.
echo ================================
echo   Update Complete!
echo ================================
echo.

:update_done

REM ========================================
REM  SECTION 2: Check Python
REM ========================================
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Python not found!
    echo.
    echo Please install Python from: https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during install
    echo.
    pause
    exit /b 1
)
echo [OK] Python found

:start_web
echo.
echo ================================
echo   Starting Updater Service...
echo ================================
echo.

REM Start the updater server in background (minimized)
start /min "Writingway Updater" cmd /c "python tools\updater-server.py"
echo [OK] Updater service started on port 8001
echo.

echo ================================
echo   Starting Web Server...
echo ================================
echo.

REM Start Python HTTP server and open browser
echo [*] Starting web server on port 8787...
echo [*] Opening Writingway in 3 seconds...
echo.
echo ================================
echo   Writingway is starting!
echo ================================
echo.
echo PLEASE NOTE:
echo  * The browser window will appear in ~3 seconds
echo  * Configure AI from the in-app settings
echo  * Keep this window open while using Writingway
echo.
echo Web UI: http://localhost:8787/main.html
echo Updater: http://localhost:8001
echo.

REM Wait 3 seconds before opening browser (gives servers time to stabilize)
timeout /t 3 /nobreak >nul

echo [*] Opening browser now...
echo.
echo Close this window to stop all servers.
echo Press Ctrl+C to stop manually.
echo ================================
echo.

REM Open browser
start "" http://localhost:8787/main.html

REM Start Python web server (blocks here)
python -m http.server 8787

REM Cleanup when Python server stops
echo.
echo [*] Shutting down servers...
taskkill /FI "WindowTitle eq Writingway Updater*" /T /F >nul 2>&1
echo [*] All servers stopped.
pause
