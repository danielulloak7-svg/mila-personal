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

echo [1/3] staging index.html
git add index.html
if errorlevel 1 goto fail

echo [2/3] commit
git commit -m "publish: personal app build %DATE% %TIME%"
if errorlevel 1 echo    (nothing new to commit - continuing to push anyway)

echo [3/3] push
git push origin HEAD
if errorlevel 1 goto fail

echo.
echo ==========================================================
echo   PUBLISHED.
echo   https://danielulloak7-svg.github.io/mila-personal/
echo   GitHub Pages usually refreshes within a minute or two.
echo   On the phone: hard-refresh / reopen the tab to get it.
echo ==========================================================
echo.
pause
exit /b 0

:fail
echo.
echo ==========================================================
echo   SOMETHING FAILED - read the message above.
echo   Nothing was lost: index.html is still on disk.
echo ==========================================================
echo.
pause
exit /b 1
