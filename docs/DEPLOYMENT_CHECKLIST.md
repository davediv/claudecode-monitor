# Production Deployment Checklist

This checklist guides you through deploying the Claude Code Monitor to production.

## Pre-Deployment Requirements

### 1. ✅ Environment Setup
- [x] Cloudflare account with Workers access
- [x] Wrangler CLI installed (`npm install -g wrangler`)
- [x] Authenticated with Cloudflare (`npx wrangler login`)

### 2. ✅ Configuration Complete
- [x] Production configuration file exists (`wrangler.production.jsonc`)
- [x] Cron schedule set to hourly (`0 * * * *`)
- [x] Production KV namespace ID configured (`28f1b182444941558bec7c29fb739f84`)

### 3. ✅ Testing Complete
- [x] All unit tests passing
- [x] Integration tests passing
- [x] Manual testing in development environment complete
- [x] Telegram notifications verified working

## Deployment Steps

### Step 1: Verify KV Namespace

Check if the production KV namespace exists:

```bash
npx wrangler kv:namespace list
```

If namespace `28f1b182444941558bec7c29fb739f84` doesn't exist, create it:

```bash
npx wrangler kv:namespace create "VERSION_STORAGE"
```

### Step 2: Configure Secrets

Set the Telegram bot token:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN --config wrangler.production.jsonc
```

Paste your bot token when prompted (format: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`)

### Step 3: Deploy to Production

Option 1 - Using the deployment script (recommended):

```bash
npm run deploy:prod
```

Option 2 - Direct deployment:

```bash
npm run deploy:production
```

Option 3 - Manual deployment:

```bash
npx wrangler deploy --config wrangler.production.jsonc
```

### Step 4: Verify Deployment

1. **Check deployment status:**
   ```bash
   npx wrangler deployments list
   ```

2. **View real-time logs:**
   ```bash
   npm run tail:production
   ```

3. **Check KV storage initialization:**
   ```bash
   npx wrangler kv:key list --binding=VERSION_STORAGE --config wrangler.production.jsonc
   ```

## Post-Deployment Verification

### 1. Worker Status
- [ ] Worker appears in Cloudflare dashboard
- [ ] Status shows "Active"
- [ ] No deployment errors

### 2. Cron Trigger
- [ ] Cron trigger visible in dashboard
- [ ] Schedule shows `0 * * * *` (hourly)
- [ ] Next execution time displayed

### 3. Initial State
- [ ] KV storage contains `current_version` key
- [ ] Initial version matches current Claude Code version
- [ ] No notification sent on first run (expected behavior)

### 4. First Execution
Monitor the first scheduled execution (top of the hour):
- [ ] Worker executes at scheduled time
- [ ] Logs show successful changelog fetch
- [ ] No errors in execution

### 5. Telegram Integration
When a new version is released:
- [ ] Notification sent to correct chat
- [ ] Message format correct
- [ ] Thread ID working (if configured)

## Troubleshooting

### Common Issues

1. **KV Namespace Not Found**
   - Verify namespace ID in `wrangler.production.jsonc`
   - Ensure namespace exists in your Cloudflare account

2. **Secret Not Set**
   - Run: `npx wrangler secret list --config wrangler.production.jsonc`
   - Re-add secret if missing

3. **Deployment Fails**
   - Check Cloudflare account limits
   - Verify authentication: `npx wrangler whoami`
   - Check for syntax errors: `npx wrangler types --config wrangler.production.jsonc`

4. **Cron Not Executing**
   - Verify cron syntax in configuration
   - Check worker logs for errors
   - Ensure worker is not disabled

## Monitoring Commands

```bash
# View live logs
npm run tail:production

# Check secrets
npm run secret:list

# View KV storage
npx wrangler kv:key list --binding=VERSION_STORAGE --config wrangler.production.jsonc

# Get current version from KV
npx wrangler kv:key get "current_version" --binding=VERSION_STORAGE --config wrangler.production.jsonc
```

## Rollback Procedure

If issues occur after deployment:

```bash
# Quick rollback to previous version
npx wrangler rollback --config wrangler.production.jsonc

# Or specify a deployment ID
npx wrangler deployments list
npx wrangler rollback [DEPLOYMENT_ID] --config wrangler.production.jsonc
```

## Success Criteria

✅ Deployment is successful when:
1. Worker is active in Cloudflare dashboard
2. Cron trigger is configured and visible
3. Initial KV state is set
4. No errors in first execution
5. Ready to send notifications on version changes