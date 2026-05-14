@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

if "%MAA_WEB_VENV%"=="" (
  set "VENV_DIR=%ROOT_DIR%.venv"
) else (
  set "VENV_DIR=%MAA_WEB_VENV%"
)

set "VENV_PY=%VENV_DIR%\Scripts\python.exe"
set "STAMP_FILE=%VENV_DIR%\.maa-web-control-deps"

if not exist "%VENV_PY%" (
  call :find_python
  if errorlevel 1 exit /b %errorlevel%
  call !PYTHON_CMD! -m venv "%VENV_DIR%"
  if errorlevel 1 exit /b %errorlevel%
)

call :needs_install
if "%NEED_INSTALL%"=="1" (
  "%VENV_PY%" -m pip install --upgrade pip
  if errorlevel 1 exit /b %errorlevel%
  "%VENV_PY%" -m pip install -e .
  if errorlevel 1 exit /b %errorlevel%
  echo installed>"%STAMP_FILE%"
)

if "%MAA_WEB_HOST%"=="" set "MAA_WEB_HOST=0.0.0.0"
if "%MAA_WEB_PORT%"=="" set "MAA_WEB_PORT=8000"

"%VENV_PY%" -m uvicorn app.main:app --host "%MAA_WEB_HOST%" --port "%MAA_WEB_PORT%"
exit /b %errorlevel%

:find_python
if not "%PYTHON%"=="" (
  set "PYTHON_CMD="%PYTHON%""
  exit /b 0
)
where py >nul 2>nul
if not errorlevel 1 (
  set "PYTHON_CMD=py -3"
  exit /b 0
)
where python >nul 2>nul
if not errorlevel 1 (
  set "PYTHON_CMD=python"
  exit /b 0
)
echo Python 3.11+ is required but was not found.
exit /b 1

:needs_install
set "NEED_INSTALL=0"
if not exist "%STAMP_FILE%" (
  set "NEED_INSTALL=1"
  exit /b 0
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "if ((Get-Item -LiteralPath 'pyproject.toml').LastWriteTimeUtc -gt (Get-Item -LiteralPath $env:STAMP_FILE).LastWriteTimeUtc) { exit 0 } exit 1" >nul 2>nul
if not errorlevel 1 set "NEED_INSTALL=1"
exit /b 0
