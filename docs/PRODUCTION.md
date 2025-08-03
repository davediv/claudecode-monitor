# Production Deployment Guide

This guide covers the production deployment process for the Claude Code Monitor worker.

## Prerequisites

1. **Cloudflare Account**: Ensure you have a Cloudflare account with Workers enabled
2. **Wrangler CLI**: Install the Cloudflare Wrangler CLI
   ```bash
   npm install -g wrangler
   ```
3. **Authentication**: Login to Cloudflare
   ```bash
   npx wrangler login
   ```

## Production Configuration

The production configuration is defined in `wrangler.production.jsonc` with the following key differences from development:

- **Cron Schedule**: `0 * * * *` (runs hourly instead of every minute)
- **KV Namespace**: Uses production namespace ID `28f1b182444941558bec7c29fb739f84`
- **Smart Placement**: Enabled for optimal performance
- **Performance Analytics**: Enabled for monitoring

## Deployment Steps

### 1. Create Production KV Namespace

If not already created, create the production KV namespace:

```bash
npx wrangler kv:namespace create "VERSION_STORAGE"
```

Verify the namespace ID matches: `28f1b182444941558bec7c29fb739f84`

### 2. Configure Secrets

Set the Telegram bot token as a secret:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN --config wrangler.production.jsonc
```

Verify secrets are configured:

```bash
npx wrangler secret list --config wrangler.production.jsonc
```

### 3. Deploy to Production

Use the deployment script:

```bash
./scripts/deploy-production.sh
```

Or deploy manually:

```bash
npx wrangler deploy --config wrangler.production.jsonc
```

### 4. Initialize State (First Deployment)

On first deployment, the worker will automatically:
1. Fetch the current version from the changelog
2. Store it in KV storage without sending a notification
3. Start monitoring for new versions from that point forward

## Post-Deployment Verification

### 1. Check Worker Status

View the worker in Cloudflare dashboard:
- Go to Workers & Pages
- Select `claudecode-monitor`
- Check the deployment status

### 2. Monitor Logs

Stream real-time logs:

```bash
npx wrangler tail --config wrangler.production.jsonc
```

### 3. Verify Cron Execution

The worker should execute at the top of every hour. Check logs around :00 minutes.

### 4. Test Telegram Integration

Wait for the next scheduled execution or manually trigger:

1. Go to Cloudflare dashboard
2. Navigate to your worker
3. Use the "Quick Edit" feature to manually trigger the scheduled handler

## Monitoring

### Performance Metrics

Monitor these key metrics in Cloudflare Analytics:

- **Execution Time**: Should be <50ms (excluding API calls)
- **Success Rate**: Should be >99%
- **CPU Time**: Monitor for anomalies
- **Subrequests**: GitHub and Telegram API calls

### Error Monitoring

Check for these common errors:

1. **KV Storage Errors**: Check namespace configuration
2. **Telegram API Errors**: Verify bot token and chat permissions
3. **GitHub API Errors**: Check changelog URL accessibility

## Rollback Procedure

If issues occur:

1. **Quick Rollback**:
   ```bash
   npx wrangler rollback --config wrangler.production.jsonc
   ```

2. **Manual Rollback**:
   - Go to Cloudflare dashboard
   - Navigate to your worker
   - Select "Deployments" tab
   - Choose a previous deployment and promote it

## Maintenance

### Updating Environment Variables

1. Edit `wrangler.production.jsonc`
2. Redeploy: `npx wrangler deploy --config wrangler.production.jsonc`

### Updating Secrets

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN --config wrangler.production.jsonc
```

### Viewing KV Storage

```bash
# List all keys
npx wrangler kv:key list --binding=VERSION_STORAGE --config wrangler.production.jsonc

# Get current state
npx wrangler kv:key get "current_version" --binding=VERSION_STORAGE --config wrangler.production.jsonc
```

## Troubleshooting

### Worker Not Executing

1. Check cron syntax in `wrangler.production.jsonc`
2. Verify worker is deployed: `npx wrangler deployments list`
3. Check Cloudflare dashboard for any account issues

### Notifications Not Sending

1. Verify Telegram bot token is correct
2. Check bot has permission to send to the chat
3. Verify chat ID and thread ID are correct
4. Check logs for specific error messages

### Version Not Updating

1. Check KV storage state
2. Verify changelog URL is accessible
3. Check parsing logic with recent changelog format

## Security Considerations

1. **Secrets**: Never commit secrets to version control
2. **Bot Token**: Rotate if compromised
3. **Chat ID**: Keep private to prevent spam
4. **KV Access**: Limit to worker only

## Cost Optimization

1. **Execution Frequency**: Hourly execution (24 requests/day)
2. **KV Operations**: 2 operations per execution (read + write on update)
3. **Subrequests**: 1-2 per execution (GitHub + Telegram on update)

Estimated monthly usage:
- Worker requests: ~720/month
- KV operations: ~1,440/month
- Subrequests: ~720-1,440/month

All within Cloudflare Workers free tier limits.