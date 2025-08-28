#!/bin/bash

# Daily Dev Digest Database Setup Script
# =====================================

set -e  # Exit on any error

echo "🚀 Daily Dev Digest Database Setup"
echo "=================================="

# Check if bun is installed
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is not installed. Please install Bun first."
    echo "   Visit: https://bun.sh/docs/installation"
    exit 1
fi

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo "❌ package.json not found. Please run this script from the project root."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
bun install

# Check if .env file exists, create from example if not
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "⚠️  Please update the .env file with your actual configuration values."
    echo "   Required: GITHUB_TOKEN, JWT_SECRET"
fi

# Generate Prisma client
echo "🔄 Generating Prisma client..."
npx prisma generate --schema=./src/db/schema.prisma

# Initialize database
echo "🗄️  Initializing database..."
npx prisma db push --schema=./src/db/schema.prisma

# Seed database
echo "🌱 Seeding database with initial data..."
bun run src/db/seed.ts

echo ""
echo "✅ Database setup completed successfully!"
echo ""
echo "📊 Setup Summary:"
echo "• Database initialized with schema"
echo "• Prisma client generated"
echo "• Database seeded with initial data"
echo ""
echo "🔐 Default Login Credentials:"
echo "Admin: admin@devdigest.local / admin123"
echo "Demo:  demo@example.com / demo1234"
echo ""
echo "🚀 Next Steps:"
echo "1. Update your .env file with real configuration values"
echo "2. Run 'bun run dev' to start the development server"
echo "3. Change default passwords in production!"
echo ""
echo "📚 Available Commands:"
echo "• bun run dev          - Start development server"
echo "• bun run db:studio    - Open Prisma Studio"
echo "• bun run db:validate  - Validate database schema"
echo "• bun run db:backup    - Create database backup"