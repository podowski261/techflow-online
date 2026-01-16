@echo off
title ORION POS - Serveur
color 0A

echo.
echo  ██████╗ ██████╗ ██╗ ██████╗ ███╗   ██╗    ██████╗  ██████╗ ███████╗
echo ██╔═══██╗██╔══██╗██║██╔═══██╗████╗  ██║    ██╔══██╗██╔═══██╗██╔════╝
echo ██║   ██║██████╔╝██║██║   ██║██╔██╗ ██║    ██████╔╝██║   ██║███████╗
echo ██║   ██║██╔══██╗██║██║   ██║██║╚██╗██║    ██╔═══╝ ██║   ██║╚════██║
echo ╚██████╔╝██║  ██║██║╚██████╔╝██║ ╚████║    ██║     ╚██████╔╝███████║
echo  ╚═════╝ ╚═╝  ╚═╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝    ╚═╝      ╚═════╝ ╚══════╝
echo.
echo ══════════════════════════════════════════════════════════════════════
echo                    Systeme de Point de Vente
echo                        Port: 5000
echo ══════════════════════════════════════════════════════════════════════
echo.

:: Vérifier si Node.js est installé
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERREUR] Node.js n'est pas installe!
    echo.
    echo Telechargez Node.js sur: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Afficher version Node.js
echo [INFO] Node.js version:
node --version
echo.

:: Vérifier si les dépendances sont installées
if not exist "node_modules" (
    echo [INFO] Installation des dependances...
    echo.
    npm install
    echo.
    if %ERRORLEVEL% NEQ 0 (
        echo [ERREUR] Echec de l'installation des dependances!
        pause
        exit /b 1
    )
)

:: Attendre 2 secondes puis ouvrir le navigateur
echo [INFO] Demarrage du serveur...
echo.

:: Lancer le navigateur après 3 secondes (en arrière-plan)
start /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:5000/login.html"

:: Démarrer le serveur
echo ══════════════════════════════════════════════════════════════════════
echo.
node server.js

:: Si le serveur s'arrête
echo.
echo [INFO] Serveur arrete.
pause