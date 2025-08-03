# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Cloudflare Worker application that monitors the Claude Code changelog for new version releases and automatically sends notifications to a Telegram group. The worker runs on a scheduled cron trigger every minute (configured to run hourly in production).

## Development Commands

```bash
# Start development server with scheduled handler testing
npm run dev
# or
npm start

# Deploy to Cloudflare Workers
npm run deploy

# Generate TypeScript types for Cloudflare bindings
npm run cf-typegen
```

## Testing the Scheduled Handler

When running in development mode, test the scheduled handler with:
```bash
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

## Architecture

This is a TypeScript-based Cloudflare Worker with the following structure:

- **Main Entry**: `src/index.ts` - Contains both fetch and scheduled handlers
- **Scheduled Handler**: Triggers based on cron schedule defined in `wrangler.jsonc` (currently set to `* * * * *`)
- **Configuration**: `wrangler.jsonc` - Cloudflare Worker configuration with cron triggers and bindings

## Key Implementation Requirements

Based on the PRD (Product Requirements Document):

1. **Changelog Monitoring**: Fetch from `https://raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/CHANGELOG.md`
2. **Version Detection**: Parse semantic versioning (e.g., v1.2.3) from changelog markdown
3. **State Management**: Use Cloudflare KV storage to track last known version
4. **Telegram Integration**: Send notifications via Telegram Bot API
5. **Error Handling**: Implement retry logic and graceful error handling

## Required Environment Variables

These need to be configured in `wrangler.jsonc` or via Cloudflare dashboard:
- `TELEGRAM_BOT_TOKEN` - Bot authentication token
- `TELEGRAM_CHAT_ID` - Target group/channel ID
- `TELEGRAM_THREAD_ID` - (Optional) Thread/topic ID for sending to specific topics in supergroups
- KV namespace binding for state storage

## TypeScript Configuration

The project uses strict TypeScript with:
- Target: ES2021
- Module: ES2022
- Strict mode enabled
- Custom worker types in `worker-configuration.d.ts`

## Deployment Notes

1. Create a KV namespace in Cloudflare dashboard
2. Configure environment variables and KV binding in `wrangler.jsonc`
3. Deploy using `npm run deploy`
4. For production, update the cron schedule from `* * * * *` to `0 * * * *` (hourly)