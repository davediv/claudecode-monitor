#!/bin/bash

echo "🔐 Claude Code Monitor - Secrets Setup"
echo "===================================="
echo ""

# Check if wrangler is available
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Please run 'npm install' first."
    exit 1
fi

# Check if .dev.vars exists
if [ ! -f ".dev.vars" ]; then
    echo "📝 Creating .dev.vars from template..."
    cp .dev.vars.example .dev.vars
    echo "✅ Created .dev.vars file"
    echo ""
fi

echo "📋 Next steps:"
echo ""
echo "1. For local development:"
echo "   Edit .dev.vars and add your Telegram bot token"
echo ""
echo "2. For production deployment:"
echo "   Run: npx wrangler secret put TELEGRAM_BOT_TOKEN"
echo "   Then paste your bot token when prompted"
echo ""
echo "3. Update TELEGRAM_CHAT_ID in wrangler.jsonc with your chat ID"
echo ""
echo "4. (Optional) Update TELEGRAM_THREAD_ID for topic/thread support in supergroups"
echo ""
echo "Need help finding your Telegram chat ID or thread ID?"
echo "See docs/ENVIRONMENT_SETUP.md for detailed instructions"