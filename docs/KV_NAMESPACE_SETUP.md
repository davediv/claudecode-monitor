# KV Namespace Setup Documentation

## Overview
This document contains the KV namespace configuration for the Claude Code Version Monitor.

## Namespace IDs

### Production Namespace
- **Name**: VERSION_STORAGE
- **ID**: `28f1b182444941558bec7c29fb739f84`
- **Created**: 2025-08-03

### Preview Namespace (Development)
- **Name**: VERSION_STORAGE_preview
- **ID**: `360b03b9a71446e792b92589f3a79bed`
- **Created**: 2025-08-03

## Configuration

The KV namespace binding is already configured in `wrangler.jsonc`:

```json
"kv_namespaces": [
  {
    "binding": "VERSION_STORAGE",
    "id": "28f1b182444941558bec7c29fb739f84",
    "preview_id": "360b03b9a71446e792b92589f3a79bed"
  }
]
```

## Usage in Code

The KV namespace is accessible in your Worker code via the `env.VERSION_STORAGE` binding:

```typescript
// Example: Reading from KV
const state = await env.VERSION_STORAGE.get('claude-code-monitor-state', 'json');

// Example: Writing to KV
await env.VERSION_STORAGE.put('claude-code-monitor-state', JSON.stringify(data));
```

## Local Development

When running `npm run dev`, the preview namespace will be used automatically. This allows you to test KV operations without affecting production data.

## Manual KV Operations

You can interact with the KV namespace using Wrangler CLI:

```bash
# List all keys
npx wrangler kv key list --namespace-id="28f1b182444941558bec7c29fb739f84"

# Get a value
npx wrangler kv key get <key> --namespace-id="28f1b182444941558bec7c29fb739f84"

# Put a value
npx wrangler kv key put <key> <value> --namespace-id="28f1b182444941558bec7c29fb739f84"

# Delete a key
npx wrangler kv key delete <key> --namespace-id="28f1b182444941558bec7c29fb739f84"
```

For preview namespace operations, use the preview namespace ID: `360b03b9a71446e792b92589f3a79bed`

## Troubleshooting

If you encounter issues with KV namespace:

1. Ensure you're logged in to Cloudflare: `npx wrangler login`
2. Verify the namespace exists: `npx wrangler kv namespace list`
3. Check that the namespace ID in `wrangler.jsonc` matches the created namespace
4. Run `npm run cf-typegen` after any changes to regenerate TypeScript types