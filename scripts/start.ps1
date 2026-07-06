# 启动 InterviewOS（Windows PowerShell）

$Root = Split-Path -Parent $PSScriptRoot

Write-Host "=== InterviewOS 启动脚本 ===" -ForegroundColor Cyan

# 后端虚拟环境
$venvPath = Join-Path $Root "backend\.venv"
if (-not (Test-Path $venvPath)) {
    Write-Host "创建 Python 虚拟环境..." -ForegroundColor Yellow
    python -m venv $venvPath
    & "$venvPath\Scripts\pip.exe" install -r (Join-Path $Root "backend\requirements.txt")
}

# 前端依赖
$nodeModules = Join-Path $Root "frontend\node_modules"
if (-not (Test-Path $nodeModules)) {
    Write-Host "安装前端依赖..." -ForegroundColor Yellow
    Push-Location (Join-Path $Root "frontend")
    npm install
    Pop-Location
}

# 启动后端
Write-Host "启动后端 (port 8000)..." -ForegroundColor Green
Start-Process -FilePath "$venvPath\Scripts\python.exe" `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000" `
    -WorkingDirectory (Join-Path $Root "backend") `
    -WindowStyle Normal

Start-Sleep -Seconds 2

# 启动前端
Write-Host "启动前端 (port 3000)..." -ForegroundColor Green
Start-Process -FilePath "npm" -ArgumentList "run", "dev" `
    -WorkingDirectory (Join-Path $Root "frontend") `
    -WindowStyle Normal

Write-Host "`nInterviewOS 已启动！" -ForegroundColor Cyan
Write-Host "前端: http://localhost:3000"
Write-Host "后端: http://localhost:8000"
Write-Host "API 文档: http://localhost:8000/docs"
