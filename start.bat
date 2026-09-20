@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  抽選くじアプリ ローカルサーバーを起動します
echo ============================================
rem The browser is opened by server.ps1 once the server is ready (a fixed wait here could be too short on slow PCs).
start "kuji-server" powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0server.ps1"
