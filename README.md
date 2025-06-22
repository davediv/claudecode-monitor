# Claude Code Release Monitor

A Cloudflare Worker that monitors Claude Code release notes and sends Telegram notifications when new updates are published.

## Setup Instructions

### 1. Prerequisites
- Cloudflare account
- Telegram Bot Token and Chat ID
- Node.js installed locally

### 2. Get Telegram Credentials
1. Create a Telegram bot:
   - Message @BotFather on Telegram
   - Send `/newbot` and follow the prompts
   - Save the bot token

2. Get your Chat ID:
   - Start a chat with your bot
   - Send a message to the bot
   - Visit `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
   - Find your chat ID in the response

### 3. Installation
```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create KV namespace
wrangler kv:namespace create "CLAUDE_CODE_KV"
```

### 4. Configuration
1. Update `wrangler.toml` with your KV namespace ID from the previous step
2. Set environment variables:
```bash
# Add your Telegram credentials
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
```

### 5. Deploy
```bash
# Deploy to Cloudflare Workers
wrangler deploy
```

### 6. Verify
- The worker runs every 15 minutes automatically
- Test manually: `curl https://your-worker.workers.dev/check`

## How It Works
1. Fetches the Claude Code release notes page every 15 minutes
2. Parses the markdown to find the latest release date
3. Compares with the last checked date stored in KV
4. Sends a Telegram notification if a new release is found
5. Updates the last checked date in KV storage

## Features
- Automatic checks every 15 minutes
- Telegram notifications with release content
- Error handling with optional error notifications
- Manual trigger endpoint at `/check`