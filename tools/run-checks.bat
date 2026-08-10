@echo off
REM MILA - comprobacion de alergenos. Doble clic y listo.
cd /d "%~dp0"
node check-allergens.mjs
echo.
pause
