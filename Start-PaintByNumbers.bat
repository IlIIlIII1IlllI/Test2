@echo off
setlocal EnableExtensions

REM ==========================================================
REM Start-PaintByNumbers.bat
REM - Starts the local web version (lite-server via npm start)
REM - Optionally switches to Node v12.7.0 via nvm-windows
REM - Installs dependencies on first run
REM ==========================================================

echo.
echo === Paint-by-Numbers Generator: Local Start ===
echo.

REM Go to the folder where this .bat file is located (project root)
pushd "%~dp0" || (echo [ERROR] Could not change directory.& pause & exit /b 1)

REM Start browser (optional) and start the dev server
set "URL=http://localhost:10001"
echo.
echo [INFO] Starting server (npm start) ...
echo [INFO] Opening browser: %URL%
echo.

start "PaintByNumbers" "%URL%" >nul 2>&1

REM Give the server a moment (optional)
timeout /t 2 /nobreak >nul 2>&1

npm start

echo.
echo [INFO] Server stopped.
popd
endlocal
pause
