@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo             Ryoto CLI Global Installer              
echo ===================================================
echo.

:: 1. Check if Node.js is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js runtime was not found on your system PATH.
    echo Node.js is required to run the Ryoto CLI utility.
    echo.
    set /p choice="Would you like to install Node.js automatically via winget? (y/n): "
    if /i "!choice!"=="y" (
        echo.
        echo Installing Node.js...
        winget install OpenJS.NodeJS
        echo.
        echo [+] Installation complete. Please restart your terminal/PC and run this installer again.
        pause
        exit /b 0
    ) else (
        echo.
        echo [!] Installation aborted. Node.js is required to install Ryoto.
        pause
        exit /b 1
    )
)

:: 2. Link Ryoto globally
echo [+] Node.js detected. Registering Ryoto globally...
echo.
call npm.cmd link
if %errorlevel% neq 0 (
    echo.
    echo [!] npm link failed. Try running this command prompt as Administrator, or run:
    echo     npm install -g .
    pause
    exit /b 1
)

echo.
echo ===================================================
echo [SUCCESS] Ryoto has been globally installed!
echo ===================================================
echo.
echo Open a new terminal window and type:
echo.
echo    ryoto
echo.
pause
exit /b 0
