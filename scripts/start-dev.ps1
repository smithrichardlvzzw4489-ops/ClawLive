# ClawLive 开发环境快速启动脚本

Write-Host "🦞 启动 ClawLive 开发环境" -ForegroundColor Cyan
Write-Host ""

# 检查 Docker
$dockerRunning = docker ps 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Docker 未运行，请启动 Docker Desktop" -ForegroundColor Yellow
    Write-Host "或者手动启动数据库服务" -ForegroundColor Yellow
    Write-Host ""
}

# 启动数据库
Write-Host "📦 启动数据库..." -ForegroundColor Yellow
docker-compose up -d postgres redis

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ 数据库已启动" -ForegroundColor Green
    Write-Host "⏳ 等待数据库就绪..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
} else {
    Write-Host "❌ 数据库启动失败，请检查 Docker" -ForegroundColor Red
    exit 1
}

# 运行数据库迁移
Write-Host ""
Write-Host "🔄 运行数据库迁移..." -ForegroundColor Yellow
cd apps/server
pnpm prisma migrate deploy 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ℹ️  首次运行，创建数据库..." -ForegroundColor Cyan
    pnpm prisma migrate dev --name init
}
pnpm prisma generate
cd ../..

Write-Host "✅ 数据库准备完成" -ForegroundColor Green
Write-Host ""

# 启动开发服务器
Write-Host "🚀 启动开发服务器..." -ForegroundColor Yellow
Write-Host ""
Write-Host "访问地址:" -ForegroundColor Cyan
Write-Host "  前端: http://localhost:3000" -ForegroundColor White
Write-Host "  后端: http://localhost:3001" -ForegroundColor White
Write-Host "  健康检查: http://localhost:3001/health" -ForegroundColor White
Write-Host ""
Write-Host "按 Ctrl+C 停止服务器" -ForegroundColor Gray
Write-Host ""

pnpm dev
