@echo off
REM Double-click this to publish whatever Claude has written into this folder.
cd /d "C:\Saram Work\saram-blog"
echo.
echo === Publishing saram.thebotss.com ===
echo.
git add -A
git diff --cached --quiet && (echo Nothing new to publish. & pause & exit /b 0)
git commit -m "Publish %DATE% %TIME%"
git push
echo.
if %ERRORLEVEL% EQU 0 (
  echo Pushed. GitHub Actions is building and deploying now.
  echo Watch: https://github.com/saram098/saram-blog/actions
) else (
  echo Push failed. Check the message above.
)
echo.
pause
