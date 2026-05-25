@echo off
setlocal

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_DIR=%ROOT%frontend"
set "APP_URL=http://localhost:5173"
set "BACKEND_URL=http://localhost:3001/api/jobs"

if /i not "%~1"=="--background" (
  wscript.exe "%ROOT%start-app-hidden.vbs"
  exit /b 0
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js tidak ditemukan. Install Node.js dulu, lalu jalankan file ini lagi.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm tidak ditemukan. Install Node.js dulu, lalu jalankan file ini lagi.
  exit /b 1
)

if not exist "%BACKEND_DIR%\package.json" (
  echo Folder backend tidak ditemukan: "%BACKEND_DIR%"
  exit /b 1
)

if not exist "%FRONTEND_DIR%\package.json" (
  echo Folder frontend tidak ditemukan: "%FRONTEND_DIR%"
  exit /b 1
)

call :check_url "%BACKEND_URL%"
if errorlevel 1 (
  echo Menjalankan backend di http://localhost:3001 ...
  if not exist "%BACKEND_DIR%\node_modules" (
    echo Menginstall dependency backend ...
    pushd "%BACKEND_DIR%"
    call npm install
    if errorlevel 1 exit /b 1
    popd
  )
  call :start_hidden "%BACKEND_DIR%" "%ROOT%backend-dev.out.log" "%ROOT%backend-dev.err.log" "call npm run dev"
) else (
  echo Backend sudah berjalan di http://localhost:3001.
)

call :check_url "%APP_URL%"
if errorlevel 1 (
  echo Menjalankan frontend di %APP_URL% ...
  if not exist "%FRONTEND_DIR%\node_modules" (
    echo Menginstall dependency frontend ...
    pushd "%FRONTEND_DIR%"
    call npm install
    if errorlevel 1 exit /b 1
    popd
  )
  call :start_hidden "%FRONTEND_DIR%" "%ROOT%frontend-dev.out.log" "%ROOT%frontend-dev.err.log" "call npm run dev -- --host 0.0.0.0 --port 5173 --strictPort"
) else (
  echo Frontend sudah berjalan di %APP_URL%.
)

echo Menunggu backend siap ...
call :wait_url "%BACKEND_URL%" 45 "Backend"
if errorlevel 1 (
  echo Backend belum siap. Periksa %ROOT%backend-dev.err.log dan %ROOT%backend-dev.out.log untuk melihat error.
  exit /b 1
)

echo Menunggu frontend siap ...
call :wait_url "%APP_URL%" 45 "Frontend"
if errorlevel 1 (
  echo Frontend belum siap. Periksa %ROOT%frontend-dev.err.log dan %ROOT%frontend-dev.out.log untuk melihat error.
  exit /b 1
)

echo Membuka aplikasi di browser ...
start "" "%APP_URL%"

echo.
echo Aplikasi dibuka di %APP_URL%
echo Pastikan LiteLLM Proxy sudah aktif sesuai LITELLM_BASE_URL di file .env.
echo Backend dan frontend berjalan tersembunyi di background.
echo Log backend: %ROOT%backend-dev.out.log
echo Log frontend: %ROOT%frontend-dev.out.log

endlocal
exit /b 0

:start_hidden
set "SERVICE_DIR=%~1"
set "SERVICE_OUT=%~2"
set "SERVICE_ERR=%~3"
set "SERVICE_CMD=%~4"
wscript.exe "%ROOT%start-service-hidden.vbs"
exit /b %errorlevel%

:wait_url
set "CHECK_URL=%~1"
set "WAIT_SECONDS=%~2"
set "SERVICE_NAME=%~3"
for /l %%A in (1,1,%WAIT_SECONDS%) do (
  curl.exe --silent --fail --max-time 2 "%CHECK_URL%" >nul 2>nul
  if not errorlevel 1 exit /b 0
  ping -n 2 127.0.0.1 >nul
)
echo %SERVICE_NAME% tidak merespons di %CHECK_URL% setelah %WAIT_SECONDS% detik.
exit /b 1

:check_url
set "CHECK_URL=%~1"
curl.exe --silent --fail --max-time 2 "%CHECK_URL%" >nul 2>nul
exit /b %errorlevel%
