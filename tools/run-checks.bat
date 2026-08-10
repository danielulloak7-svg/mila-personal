@echo off
REM MILA - comprobaciones antes de publicar. Doble clic y listo.
cd /d "%~dp0"
echo === Alergenos ===
node check-allergens.mjs
if errorlevel 1 goto fail
echo.
echo === Formularios del editor ===
node check-forms.mjs
if errorlevel 1 goto fail
echo.
echo TODO EN ORDEN - se puede publicar.
goto end
:fail
echo.
echo *** HAY FALLOS - NO publiques hasta resolverlos.
:end
echo.
pause
