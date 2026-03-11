#!/bin/bash

# ClawLive 快速设置脚本

set -e

echo "🦞 ClawLive 快速设置"
echo ""

# 检查依赖
command -v node >/dev/null 2>&1 || { echo "❌ Node.js 未安装"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "❌ pnpm 未安装，运行: npm install -g pnpm"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "⚠️  Docker 未安装，将无法使用 docker-compose"; }

echo "✅ 依赖检查完成"
echo ""

# 安装依赖
echo "📦 安装依赖..."
pnpm install

echo ""
echo "🗄️  启动数据库..."
docker-compose up -d postgres redis

echo "⏳ 等待数据库启动..."
sleep 10

echo ""
echo "🔄 运行数据库迁移..."
cd apps/server
pnpm prisma migrate dev --name init
pnpm prisma generate
cd ../..

echo ""
echo "✅ 设置完成！"
echo ""
echo "下一步："
echo "  1. 复制并配置 .env 文件:"
echo "     cp .env.example .env"
echo ""
echo "  2. 启动开发服务器:"
echo "     pnpm dev"
echo ""
echo "  3. 访问应用:"
echo "     前端: http://localhost:3000"
echo "     后端: http://localhost:3001"
echo ""
