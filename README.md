# Claude Code Version Monitor

A Cloudflare Worker application that monitors the Claude Code changelog for new version releases and automatically sends notifications to a Telegram group.

## Overview

This serverless application:
- Polls the Claude Code changelog from GitHub every hour
- Detects new version releases
- Sends formatted notifications to a Telegram group
- Maintains state to avoid duplicate notifications

## Setup

### Prerequisites

- Cloudflare account with Workers access
- Telegram Bot (created via BotFather)
- Node.js and npm installed locally

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd claude-code-monitor
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables (see Configuration section)

4. Deploy to Cloudflare Workers:
```bash
npm run deploy
```

## Configuration

### Environment Variables

Configure the following in your `wrangler.jsonc` or Cloudflare dashboard:

- `TELEGRAM_BOT_TOKEN`: Your Telegram bot token from BotFather
- `TELEGRAM_CHAT_ID`: The Telegram group/channel ID to send notifications to
- `GITHUB_CHANGELOG_URL`: (Optional) Custom changelog URL, defaults to Claude Code's official changelog

### KV Namespace

Create a KV namespace in Cloudflare dashboard and add the binding to `wrangler.jsonc`:

```json
{
  "kv_namespaces": [
    {
      "binding": "VERSION_STORAGE",
      "id": "your-kv-namespace-id"
    }
  ]
}
```

## Development

### Local Development

Run the development server:
```bash
npm run dev
```

Test the scheduled handler:
```bash
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

### Scripts

- `npm run dev` - Start development server with scheduled handler testing
- `npm run deploy` - Deploy to Cloudflare Workers
- `npm run cf-typegen` - Generate TypeScript types for Cloudflare bindings

## Architecture

The application follows a modular structure:

- `src/index.ts` - Main worker entry point with scheduled handler
- `src/changelog.ts` - Changelog fetching and parsing logic
- `src/telegram.ts` - Telegram Bot API integration
- `src/storage.ts` - KV storage operations for state management
- `src/utils.ts` - Common utility functions
- `src/types/` - TypeScript type definitions and data models

## Usage Examples

### Fetching Changelog

```typescript
import { fetchChangelog } from './changelog';

try {
  const markdown = await fetchChangelog(
    'https://raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/CHANGELOG.md'
  );
  console.log('Changelog fetched successfully');
} catch (error) {
  if (error instanceof WorkerError) {
    console.error(`Failed to fetch: ${error.message}`);
  }
}
```

### Parsing Changelog

```typescript
import { parseChangelog, extractLatestVersion } from './changelog';

// Parse the full changelog
const changelogData = parseChangelog(markdown);
console.log(`Found ${changelogData.versions.length} versions`);
console.log(`Latest: ${changelogData.latestVersion?.version}`);

// Or just extract the latest version
const latest = extractLatestVersion(markdown);
console.log(`Latest version: ${latest}`);
```

### Comparing Versions

```typescript
import { compareVersions, isValidSemver, isNewerVersion } from './changelog';

// Validate semantic version format
if (isValidSemver('1.0.65')) {
  console.log('Valid version');
}

// Compare two versions
const result = compareVersions('1.0.65', '1.0.64');
if (result > 0) {
  console.log('1.0.65 is newer than 1.0.64');
}

// Check if version is newer (convenience function)
if (isNewerVersion('1.0.0', '1.0.0-alpha')) {
  console.log('1.0.0 is newer than 1.0.0-alpha');
}

// Handles complex semver cases
compareVersions('1.0.0-alpha.1', '1.0.0-alpha');     // returns 1
compareVersions('1.0.0-rc.1', '1.0.0-beta.11');     // returns 1
compareVersions('1.0.0+build.1', '1.0.0+build.2');  // returns 0 (build metadata ignored)
```