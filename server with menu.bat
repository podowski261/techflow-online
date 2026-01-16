@echo off
title ORION POS - Menu Principal
color 0B

:menu
cls
echo.
echo  ██████╗ ██████╗ ██╗ ██████╗ ███╗   ██╗    ██████╗  ██████╗ ███████╗
echo ██╔═══██╗██╔══██╗██║██╔═══██╗████╗  ██║    ██╔══██╗██╔═══██╗██╔════╝
echo ██║   ██║██████╔╝██║██║   ██║██╔██╗ ██║    ██████╔╝██║   ██║███████╗
echo ██║   ██║██╔══██╗██║██║   ██║██║╚██╗██║    ██╔═══╝ ██║   ██║╚════██║
echo ╚██████╔╝██║  ██║██║╚██████╔╝██║ ╚████║    ██║     ╚██████╔╝███████║
echo  ╚═════╝ ╚═╝  ╚═╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝    ╚═╝      ╚═════╝ ╚══════╝
echo.
echo ══════════════════════════════════════════════════════════════════════
echo                         MENU PRINCIPAL
echo ══════════════════════════════════════════════════════════════════════
echo.
echo   [1] Demarrer le serveur
echo   [2] Installer les dependances (npm install)
echo   [3] Ouvrir dans le navigateur
echo   [4] Reinitialiser la base de donnees
echo   [5] Quitter
echo.
echo ══════════════════════════════════════════════════════════════════════
echo.

set /p choix="Votre choix (1-5): "

if "%choix%"=="1" goto start_server
if "%choix%"=="2" goto install
if "%choix%"=="3" goto open_browser
if "%choix%"=="4" goto reset_db
if "%choix%"=="5" goto quit

echo.
echo [ERREUR] Choix invalide!
timeout /t 2 >nul
goto menu

:start_server
cls
echo.
echo [INFO] Demarrage du serveur ORION POS...
echo [INFO] Port: 5000
echo [INFO] URL: http://localhost:5000
echo.
echo Appuyez sur Ctrl+C pour arreter le serveur.
echo ══════════════════════════════════════════════════════════════════════
echo.
start /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:5000/login.html"
node server.js
echo.
echo [INFO] Serveur arrete.
pause
goto menu

:install
cls
echo.
echo [INFO] Installation des dependances...
echo.
npm install
echo.
echo [OK] Installation terminee!
pause
goto menu

:open_browser
start http://localhost:5000/login.html
goto menu

:reset_db
cls
echo.
echo ══════════════════════════════════════════════════════════════════════
echo                    REINITIALISATION BASE DE DONNEES
echo ══════════════════════════════════════════════════════════════════════
echo.
echo ATTENTION: Cette action va supprimer toutes les donnees!
echo.
set /p confirm="Etes-vous sur? (oui/non): "
if /i "%confirm%"=="oui" (
    if exist "database.sqlite" (
        del database.sqlite
        echo.
        echo [OK] Base de donnees supprimee.
        echo [INFO] Redemarrez le serveur pour creer une nouvelle base.
    ) else (
        echo.
        echo [INFO] Aucune base de donnees trouvee.
    )
) else (
    echo.
    echo [INFO] Operation annulee.
)
pause
goto menu

:quit
echo.
echo Misaotra! A bientot!
timeout /t 2 >nul
exit /b 0