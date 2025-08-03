#!/bin/bash

# Claude Code Monitor - Production Deployment Script (No Tests)
# This script handles the production deployment process without running tests

set -e  # Exit on error

echo "🚀 Claude Code Monitor - Production Deployment (No Tests)"
echo "========================================================"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}❌ Error: Wrangler CLI is not installed${NC}"
    echo "Please install it with: npm install -g wrangler"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "wrangler.production.jsonc" ]; then
    echo -e "${RED}❌ Error: wrangler.production.jsonc not found${NC}"
    echo "Please run this script from the project root directory"
    exit 1
fi

echo -e "${YELLOW}📋 Pre-deployment checklist:${NC}"
echo "1. Have you created the production KV namespace? (ID: 28f1b182444941558bec7c29fb739f84)"
echo "2. Do you have your Telegram bot token ready?"
echo "3. Have you tested the worker in development?"
echo -e "${YELLOW}⚠️  Note: Tests will be skipped due to npm permission issues${NC}"
echo ""
read -p "Continue with deployment? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled"
    exit 0
fi

# Check if secret is already set
echo -e "\n${YELLOW}🔐 Checking secrets...${NC}"
SECRET_LIST=$(npx wrangler secret list --config wrangler.production.jsonc 2>&1 || true)

if [[ ! "$SECRET_LIST" =~ "TELEGRAM_BOT_TOKEN" ]]; then
    echo -e "${YELLOW}Setting up TELEGRAM_BOT_TOKEN secret...${NC}"
    echo "Please paste your Telegram bot token when prompted:"
    npx wrangler secret put TELEGRAM_BOT_TOKEN --config wrangler.production.jsonc
else
    echo -e "${GREEN}✓ TELEGRAM_BOT_TOKEN is already configured${NC}"
fi

# Deploy to production
echo -e "\n${YELLOW}🚀 Deploying to Cloudflare Workers...${NC}"
npx wrangler deploy --config wrangler.production.jsonc

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}✅ Deployment successful!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Verify deployment: npm run verify:deployment"
    echo "2. Monitor the worker logs: npm run tail:production"
    echo "3. Check Cloudflare dashboard for analytics"
    echo "4. Wait for the next hour to see if notifications work"
    echo ""
    echo -e "${YELLOW}⚠️  Remember to fix npm permissions and run tests:${NC}"
    echo "   sudo chown -R $(id -u):$(id -g) ~/.npm"
    echo "   npm install && npm test"
else
    echo -e "\n${RED}❌ Deployment failed${NC}"
    exit 1
fi