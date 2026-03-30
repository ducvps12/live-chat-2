#!/bin/bash
set -e

echo "🚀 Starting deployment..."

cd /www/live_chat_nemark

# Pull latest changes
echo "📥 Pulling latest code..."
git pull origin main

# Build and restart containers
echo "🐳 Building and starting containers..."
docker compose down
docker compose up --build -d

# Clean up dangling images
echo "🧹 Cleaning up old images..."
docker image prune -f

# Show status
echo ""
echo "✅ Deployment complete! Container status:"
docker compose ps
