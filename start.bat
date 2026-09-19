@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  抽選くじアプリ ローカルサーバーを起動します
echo ============================================
start "kuji-server" powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0server.ps1"
timeout /t 2 /nobreak >nul
start "" "http://localhost:8080/index.html"
