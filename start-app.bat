@echo off
setlocal

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_DIR=%ROOT%frontend"
set "APP_URL=http://localhost:5173"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js tidak ditemukan. Install Node.js dulu, lalu jalankan file ini lagi.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm tidak ditemukan. Install Node.js dulu, lalu jalankan file ini lagi.
  pause
  exit /b 1
)

if not exist "%BACKEND_DIR%\package.json" (
  echo Folder backend tidak ditemukan: "%BACKEND_DIR%"
  pause
  exit /b 1
)

if not exist "%FRONTEND_DIR%\package.json" (
  echo Folder frontend tidak ditemukan: "%FRONTEND_DIR%"
  pause
  exit /b 1
)

echo Menjalankan backend di http://localhost:3001 ...
start "Vectorizer Backend" /D "%BACKEND_DIR%" cmd /k "if not exist node_modules (call npm install) && call npm run dev"

echo Menjalankan frontend di %APP_URL% ...
start "Vectorizer Frontend" /D "%FRONTEND_DIR%" cmd /k "if not exist node_modules (call npm install) && call npm run dev -- --host 0.0.0.0 --port 5173"

echo Membuka aplikasi di browser ...
timeout /t 5 /nobreak >nul
start "" "%APP_URL%"

echo.
echo Aplikasi dibuka di %APP_URL%
echo Pastikan LiteLLM Proxy sudah aktif sesuai LITELLM_BASE_URL di file .env.
echo Tutup window Backend dan Frontend untuk menghentikan aplikasi.

endlocal
