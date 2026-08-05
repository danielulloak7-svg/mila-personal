@echo off
setlocal
cd /d "%~dp0"
echo ==========================================================
echo   Zapheria - personal app - publish to GitHub Pages
echo   folder: %CD%
echo ==========================================================
echo.

if exist ".git\index.lock" (
  echo Found a stale .git\index.lock - removing it.
  del /f /q ".git\index.lock"
)

if not exist "assets\img" (
  echo.
  echo *** ABORT: assets\img is missing.
  echo *** index.html references 75 image files that live in assets\img.
  echo *** Publishing without them puts a broken app online.
  echo.
  goto fail
)

echo [1/3] staging index.html AND assets\ (the app is no longer one file)
git add -A
if errorlevel 1 goto fail

echo [2/3] commit
git commit -m "publish: personal app build %DATE% %TIME%"

echo [3/3] push
git push origin main
if errorlevel 1 goto fail

echo.
echo Done. Open the app with ?v=N to skip Safari's cache.
git log --oneline -2
goto end

:fail
echo.
echo PUBLISH FAILED - nothing was pushed.
:end
pause
