#!/bin/bash

# Claude Code Monitor - Deployment Verification Script
# This script verifies that the production deployment was successful

set -e  # Exit on error

echo "🔍 Claude Code Monitor - Deployment Verification"
echo "==============================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}❌ Error: Wrangler CLI is not installed${NC}"
    echo "Please install it with: npm install -g wrangler"
    exit 1
fi

echo -e "\n${BLUE}1. Checking deployment status...${NC}"
DEPLOYMENT_OUTPUT=$(npx wrangler deployments list 2>&1 || true)
if [[ "$DEPLOYMENT_OUTPUT" =~ "claudecode-monitor" ]]; then
    echo -e "${GREEN}✓ Worker deployment found${NC}"
    echo "$DEPLOYMENT_OUTPUT" | head -5
else
    echo -e "${RED}❌ No deployment found for claudecode-monitor${NC}"
    exit 1
fi

echo -e "\n${BLUE}2. Checking secrets configuration...${NC}"
SECRET_OUTPUT=$(npx wrangler secret list --config wrangler.production.jsonc 2>&1 || true)
if [[ "$SECRET_OUTPUT" =~ "TELEGRAM_BOT_TOKEN" ]]; then
    echo -e "${GREEN}✓ TELEGRAM_BOT_TOKEN is configured${NC}"
else
    echo -e "${YELLOW}⚠️  TELEGRAM_BOT_TOKEN not found${NC}"
    echo "Set it with: npx wrangler secret put TELEGRAM_BOT_TOKEN --config wrangler.production.jsonc"
fi

echo -e "\n${BLUE}3. Checking KV namespace...${NC}"
KV_LIST=$(npx wrangler kv:namespace list 2>&1 || true)
if [[ "$KV_LIST" =~ "28f1b182444941558bec7c29fb739f84" ]]; then
    echo -e "${GREEN}✓ Production KV namespace exists${NC}"
    
    # Check for current_version key
    echo -e "\n${BLUE}4. Checking KV storage state...${NC}"
    KV_KEYS=$(npx wrangler kv:key list --binding=VERSION_STORAGE --config wrangler.production.jsonc 2>&1 || true)
    if [[ "$KV_KEYS" =~ "current_version" ]]; then
        echo -e "${GREEN}✓ Initial state is set in KV storage${NC}"
        
        # Get the current version
        CURRENT_VERSION=$(npx wrangler kv:key get "current_version" --binding=VERSION_STORAGE --config wrangler.production.jsonc 2>&1 || echo "Unable to fetch")
        echo -e "Current version in KV: ${YELLOW}$CURRENT_VERSION${NC}"
    else
        echo -e "${YELLOW}⚠️  No initial state found in KV storage${NC}"
        echo "The worker will initialize on first run"
    fi
else
    echo -e "${RED}❌ Production KV namespace not found${NC}"
    echo "Expected namespace ID: 28f1b182444941558bec7c29fb739f84"
fi

echo -e "\n${BLUE}5. Worker Information...${NC}"
echo -e "${YELLOW}Worker URL:${NC} https://claudecode-monitor.YOUR_SUBDOMAIN.workers.dev"
echo -e "${YELLOW}Dashboard:${NC} https://dash.cloudflare.com/?to=/:account/workers/services/view/claudecode-monitor"
echo -e "${YELLOW}Cron Schedule:${NC} 0 * * * * (every hour)"

echo -e "\n${BLUE}6. Next Steps...${NC}"
echo "1. Monitor logs: npm run tail:production"
echo "2. Wait for next scheduled execution (top of the hour)"
echo "3. Check Telegram for notifications when new versions are released"

echo -e "\n${GREEN}✅ Verification complete!${NC}"
echo "If all checks passed, your deployment is ready."