@echo off
setlocal
title Application Course
cd /d "%~dp0"

echo.
echo Demarrage de l'application Course...
echo.

set "NODE_EXE=%~dp0tools\node-v22.22.3-win-x64\node.exe"

if not exist "%NODE_EXE%" (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js n'est pas installe ou n'est pas accessible sur ce PC.
    echo.
    echo La version portable de Node.js est introuvable dans le dossier tools.
    echo.
    pause
    exit /b 1
  )
  set "NODE_EXE=node"
)

"%NODE_EXE%" -v >nul 2>nul
if errorlevel 1 (
  echo Node.js est detecte, mais Windows refuse de l'executer.
  echo.
  echo Solution conseillee :
  echo 1. Verifie que Windows Defender n'a pas bloque node.exe
  echo 2. Autorise le fichier tools\node-v22.22.3-win-x64\node.exe
  echo 3. Relance ce fichier
  echo.
  pause
  exit /b 1
)

start "" "http://localhost:3000"
echo Le site va s'ouvrir dans ton navigateur.
echo Garde cette fenetre ouverte pendant l'utilisation.
echo.
"%NODE_EXE%" server.js

echo.
echo L'application s'est arretee.
pause
