@echo off
title Automess Starter
cd /d "%~dp0"
if exist ".\node_modules\electron\dist\Automess.exe" (
  start "" /high ".\node_modules\electron\dist\Automess.exe" .
) else if exist ".\node_modules\electron\dist\electron.exe" (
  start "" /high ".\node_modules\electron\dist\electron.exe" .
) else (
  npx electron .
)