# Environment Variables and Secrets Setup

## Overview
This document describes how to configure environment variables and secrets for the Claude Code Version Monitor.

## Environment Variables

### Required Variables

#### `TELEGRAM_CHAT_ID`
- **Description**: The Telegram group or channel ID where notifications will be sent
- **Type**: String
- **Example**: `-1001234567890` (for groups) or `@channelname` (for public channels)
- **Configuration**: Set in `wrangler.jsonc` under `vars`

#### `TELEGRAM_BOT_TOKEN`
- **Description**: Authentication token for your Telegram bot
- **Type**: Secret (sensitive)
- **How to obtain**: 
  1. Message @BotFather on Telegram
  2. Create a new bot with `/newbot`
  3. Copy the provided token
- **Configuration**: Set as a Cloudflare secret (see below)

### Optional Variables

#### `TELEGRAM_THREAD_ID`
- **Description**: Thread/topic ID for sending to specific topics in Telegram supergroups
- **Type**: String
- **Example**: `123` (the message_thread_id of the topic)
- **Default**: Empty (sends to main chat)
- **Configuration**: Set in `wrangler.jsonc` under `vars`

#### `GITHUB_CHANGELOG_URL`
- **Description**: URL to the Claude Code changelog
- **Type**: String
- **Default**: `https://raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/CHANGELOG.md`
- **Configuration**: Already set in `wrangler.jsonc`

## Setting Up Secrets

### For Production

1. **Set the Telegram bot token secret:**
   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   ```
   Then paste your bot token when prompted.

2. **Verify the secret was set:**
   ```bash
   npx wrangler secret list
   ```

### For Local Development

1. **Copy the example file:**
   ```bash
   cp .dev.vars.example .dev.vars
   ```

2. **Edit `.dev.vars` and add your values:**
   ```
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   ```

3. **The `.dev.vars` file is gitignored and won't be committed**

## Finding Your Telegram Chat ID

### For Groups:
1. Add your bot to the group
2. Send a message in the group
3. Visit: `https://api.telegram.org/bot<YourBOTToken>/getUpdates`
4. Look for `"chat":{"id":-1001234567890}` in the response

### For Channels:
1. Add your bot as an administrator to the channel
2. For public channels: Use `@channelname`
3. For private channels: Forward a message from the channel to @userinfobot

## Finding Your Telegram Thread ID (Optional)

For sending notifications to specific topics in Telegram supergroups:

### Prerequisites:
1. Ensure topics are enabled in your supergroup
2. Your bot must be a member of the supergroup

### Steps to Get Thread ID:
1. Send a message to the specific topic/thread
2. Use the Telegram Bot API to get updates:
   ```
   https://api.telegram.org/bot<YourBOTToken>/getUpdates
   ```
3. Look for `"message_thread_id"` in the response
4. Add to your configuration:
   ```
   TELEGRAM_THREAD_ID=123
   ```

**Note**: If `TELEGRAM_THREAD_ID` is not set or is empty, notifications will be sent to the main chat.

## Testing Your Configuration

### Local Testing:
```bash
# Start the dev server
npm run dev

# In another terminal, trigger the scheduled handler
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

### Production Testing:
After deployment, you can manually trigger the cron job from the Cloudflare dashboard.

## Security Best Practices

1. **Never commit secrets to version control**
2. **Use different bot tokens for development and production**
3. **Rotate tokens periodically**
4. **Limit bot permissions to only what's necessary**
5. **Use private channels/groups when possible**

## Troubleshooting

### "Unauthorized" errors:
- Verify your bot token is correct
- Ensure the bot is added to the group/channel
- Check that the bot has permission to send messages

### "Chat not found" errors:
- Verify the TELEGRAM_CHAT_ID is correct
- Ensure the bot is a member of the group/channel
- For channels, ensure the bot is an administrator

### Environment variables not loading:
- Run `npm run cf-typegen` after changes
- Restart the development server
- Check that `.dev.vars` is in the project root