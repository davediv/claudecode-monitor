# Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying the Claude Code Version Monitor across different environments. The application is a Cloudflare Worker that monitors changelog updates and sends Telegram notifications on a scheduled basis.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Environment Setup](#environment-setup)
4. [Deployment Procedures](#deployment-procedures)
5. [Post-Deployment Verification](#post-deployment-verification)
6. [Troubleshooting](#troubleshooting)
7. [Rollback Procedures](#rollback-procedures)
8. [CI/CD Integration](#cicd-integration)
9. [Monitoring and Observability](#monitoring-and-observability)
10. [Security Considerations](#security-considerations)

## Prerequisites

### System Requirements

- **Node.js**: v18.0.0 or higher
- **npm**: v8.0.0 or higher
- **Wrangler CLI**: v3.0.0 or higher
- **Cloudflare Account**: With Workers plan (free tier available)
- **Telegram Bot**: Created via @BotFather

### Account Setup

1. **Cloudflare Account**:
   ```bash
   # Install Wrangler CLI globally
   npm install -g wrangler
   
   # Authenticate with Cloudflare
   wrangler login
   ```

2. **Verify Authentication**:
   ```bash
   wrangler whoami
   ```

3. **Telegram Bot Setup**:
   - Message @BotFather on Telegram
   - Create a new bot with `/newbot`
   - Save the bot token securely

### Development Dependencies

```bash
# Clone the repository
git clone <repository-url>
cd claudecode-monitor

# Install dependencies
npm install

# Generate TypeScript types
npm run cf-typegen
```

## Pre-Deployment Checklist

### Code Quality Checks

```bash
# Run type checking
npm run type-check

# Run linting
npm run lint

# Run tests
npm run test

# Check code formatting
npm run format:check
```

### Build Verification

```bash
# Test local development server
npm run dev

# In another terminal, test scheduled handler
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

### Configuration Validation

- [ ] `wrangler.jsonc` configured for target environment
- [ ] Environment variables set correctly
- [ ] KV namespace created and bound
- [ ] Secrets configured
- [ ] Cron schedule appropriate for environment

## Environment Setup

### Development Environment

#### 1. Local Secrets Configuration

```bash
# Create local environment variables file
cp .dev.vars.example .dev.vars

# Edit .dev.vars and add your development bot token
echo "TELEGRAM_BOT_TOKEN=your_development_bot_token" > .dev.vars
```

#### 2. Development KV Namespace

```bash
# Create development KV namespace
wrangler kv:namespace create "VERSION_STORAGE" --preview

# Note the namespace ID and update wrangler.jsonc preview_id
```

#### 3. Update Configuration

Edit `wrangler.jsonc` for development:
```jsonc
{
  "vars": {
    "TELEGRAM_CHAT_ID": "your_development_chat_id",
    "LOG_LEVEL": "DEBUG",
    "PERFORMANCE_ANALYTICS_ENABLED": "true"
  },
  "triggers": {
    "crons": ["* * * * *"]  // Every minute for testing
  }
}
```

### Staging Environment

#### 1. Create Staging KV Namespace

```bash
# Create staging KV namespace
wrangler kv:namespace create "VERSION_STORAGE" --env staging

# Update wrangler.jsonc with staging namespace ID
```

#### 2. Configure Staging Environment

Add staging environment to `wrangler.jsonc`:
```jsonc
{
  "name": "claudecode-monitor",
  "main": "src/index.ts",
  "env": {
    "staging": {
      "name": "claudecode-monitor-staging",
      "vars": {
        "TELEGRAM_CHAT_ID": "staging_chat_id",
        "LOG_LEVEL": "INFO"
      },
      "kv_namespaces": [
        {
          "binding": "VERSION_STORAGE",
          "id": "staging_namespace_id"
        }
      ],
      "triggers": {
        "crons": ["0 */6 * * *"]  // Every 6 hours
      }
    }
  }
}
```

#### 3. Set Staging Secrets

```bash
wrangler secret put TELEGRAM_BOT_TOKEN --env staging
```

### Production Environment

#### 1. Create Production KV Namespace

```bash
# Create production KV namespace
wrangler kv:namespace create "VERSION_STORAGE" --env production

# Update wrangler.jsonc with production namespace ID
```

#### 2. Configure Production Environment

Add production environment to `wrangler.jsonc`:
```jsonc
{
  "env": {
    "production": {
      "name": "claudecode-monitor",
      "vars": {
        "TELEGRAM_CHAT_ID": "production_chat_id",
        "LOG_LEVEL": "WARN",
        "PERFORMANCE_ANALYTICS_ENABLED": "true"
      },
      "kv_namespaces": [
        {
          "binding": "VERSION_STORAGE",
          "id": "production_namespace_id"
        }
      ],
      "triggers": {
        "crons": ["0 * * * *"]  // Every hour
      },
      "placement": {
        "mode": "smart"
      }
    }
  }
}
```

#### 3. Set Production Secrets

```bash
wrangler secret put TELEGRAM_BOT_TOKEN --env production
```

## Deployment Procedures

### Development Deployment

```bash
# Deploy to development environment
wrangler deploy

# Verify deployment
wrangler tail --format pretty
```

### Staging Deployment

```bash
# Run pre-deployment checks
npm run test
npm run type-check
npm run lint

# Deploy to staging
wrangler deploy --env staging

# Monitor logs
wrangler tail --env staging --format pretty
```

### Production Deployment

#### 1. Pre-Production Validation

```bash
# Ensure all tests pass
npm run test:coverage

# Verify staging deployment works
curl -X POST "https://claudecode-monitor-staging.your-subdomain.workers.dev/__scheduled" \
  -H "Content-Type: application/json" \
  -d '{"cron":"0 * * * *"}'

# Check staging logs for errors
wrangler tail --env staging --format pretty
```

#### 2. Production Deployment

```bash
# Create production deployment tag
git tag -a v1.0.0 -m "Production deployment v1.0.0"
git push origin v1.0.0

# Deploy to production
wrangler deploy --env production

# Immediately check deployment status
wrangler deployments list --env production
```

#### 3. Zero-Downtime Deployment Strategy

```bash
# Option 1: Blue-Green Deployment
# Deploy to a new worker name first
wrangler deploy --env production --name claudecode-monitor-v2

# Test the new deployment
# Then update DNS/routing to point to new version

# Option 2: Canary Deployment
# Deploy with traffic splitting (if using custom domains)
wrangler deploy --env production --percentage 10
# Monitor metrics, then gradually increase traffic
```

## Post-Deployment Verification

### Automated Verification Script

Create `scripts/verify-deployment.sh`:
```bash
#!/bin/bash

ENVIRONMENT=${1:-production}
WORKER_URL="https://claudecode-monitor${ENVIRONMENT:+-$ENVIRONMENT}.your-subdomain.workers.dev"

echo "🔍 Verifying deployment for $ENVIRONMENT environment..."

# Check worker health
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$WORKER_URL")
if [ "$HTTP_STATUS" -eq 200 ]; then
    echo "✅ Worker is responding (HTTP $HTTP_STATUS)"
else
    echo "❌ Worker health check failed (HTTP $HTTP_STATUS)"
    exit 1
fi

# Test scheduled handler
SCHEDULED_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$WORKER_URL/__scheduled" \
    -H "Content-Type: application/json" \
    -d '{"cron":"0 * * * *"}')

if [ "$SCHEDULED_STATUS" -eq 200 ]; then
    echo "✅ Scheduled handler is working (HTTP $SCHEDULED_STATUS)"
else
    echo "❌ Scheduled handler test failed (HTTP $SCHEDULED_STATUS)"
    exit 1
fi

echo "✅ Deployment verification completed successfully"
```

### Manual Verification Steps

1. **Check Worker Status**:
   ```bash
   wrangler deployments list --env production
   ```

2. **Monitor Logs**:
   ```bash
   wrangler tail --env production --format pretty
   ```

3. **Test Scheduled Handler**:
   ```bash
   # Trigger manual execution
   curl -X POST "https://your-worker.workers.dev/__scheduled" \
     -H "Content-Type: application/json" \
     -d '{"cron":"0 * * * *"}'
   ```

4. **Verify KV Storage**:
   ```bash
   # Check KV namespace contents
   wrangler kv:key list --binding VERSION_STORAGE --env production
   ```

5. **Check Telegram Integration**:
   - Verify bot is in the correct chat/channel
   - Check recent messages for test notifications
   - Confirm thread targeting (if configured)

### Performance Verification

```bash
# Check worker metrics
wrangler metrics --env production

# Monitor response times
curl -w "@curl-format.txt" -s -o /dev/null "https://your-worker.workers.dev"
```

Create `curl-format.txt`:
```
     time_namelookup:  %{time_namelookup}\n
        time_connect:  %{time_connect}\n
     time_appconnect:  %{time_appconnect}\n
    time_pretransfer:  %{time_pretransfer}\n
       time_redirect:  %{time_redirect}\n
  time_starttransfer:  %{time_starttransfer}\n
                     ----------\n
          time_total:  %{time_total}\n
```

## Troubleshooting

### Common Deployment Issues

#### 1. Authentication Errors

**Error**: `Authentication error: Invalid API token`
```bash
# Solution: Re-authenticate with Cloudflare
wrangler logout
wrangler login
```

#### 2. KV Namespace Issues

**Error**: `KV namespace binding not found`
```bash
# Check namespace exists
wrangler kv:namespace list

# Verify wrangler.jsonc configuration
cat wrangler.jsonc | grep -A 5 kv_namespaces
```

#### 3. Secret Configuration Problems

**Error**: `Secret TELEGRAM_BOT_TOKEN not found`
```bash
# List current secrets
wrangler secret list --env production

# Re-set secret if missing
wrangler secret put TELEGRAM_BOT_TOKEN --env production
```

#### 4. Cron Trigger Issues

**Error**: Scheduled handler not executing
```bash
# Check cron trigger configuration
wrangler deployments list --env production

# Manually test scheduled handler
curl -X POST "https://your-worker.workers.dev/__scheduled" \
  -H "Content-Type: application/json" \
  -d '{"cron":"0 * * * *"}'
```

#### 5. Memory/CPU Limits

**Error**: `Worker exceeded memory limit`
```bash
# Check worker metrics
wrangler metrics --env production

# Optimize code or consider Worker size limits
# Review performance analytics in Cloudflare dashboard
```

### Network and Connectivity Issues

#### 1. External API Failures

**Issue**: GitHub changelog fetch failures
```bash
# Test API connectivity
curl -I "https://raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/CHANGELOG.md"

# Check for rate limiting or network issues
# Consider implementing retry logic with exponential backoff
```

#### 2. Telegram API Issues

**Issue**: Telegram notifications not sending
```bash
# Test bot token directly
curl "https://api.telegram.org/bot<TOKEN>/getMe"

# Verify chat permissions
curl "https://api.telegram.org/bot<TOKEN>/getChat?chat_id=<CHAT_ID>"
```

### Performance Troubleshooting

#### 1. High Response Times

```bash
# Enable performance analytics
# Update wrangler.jsonc:
"vars": {
  "PERFORMANCE_ANALYTICS_ENABLED": "true"
}

# Monitor worker analytics in Cloudflare dashboard
# Check for cold start issues
```

#### 2. Memory Usage Optimization

```bash
# Analyze bundle size
wrangler deploy --dry-run --outdir dist

# Review generated bundle
ls -la dist/
```

### Debugging Deployment Problems

#### 1. Enable Debug Logging

```bash
# Temporarily increase log level
wrangler secret put LOG_LEVEL --env production
# Enter: DEBUG

# Monitor detailed logs
wrangler tail --env production --format pretty
```

#### 2. Local Debugging

```bash
# Run locally with production configuration
cp wrangler.jsonc wrangler.local.jsonc
# Edit to use production secrets locally

# Test with production data
npm run dev
```

#### 3. Rollback Quick Debug

```bash
# Check previous deployments
wrangler deployments list --env production

# Compare configurations
git diff HEAD~1 wrangler.jsonc
```

## Rollback Procedures

### Immediate Rollback

#### 1. Using Cloudflare Dashboard

1. Navigate to Workers & Pages in Cloudflare dashboard
2. Select your worker
3. Go to "Deployments" tab
4. Click "Rollback" on the previous stable version

#### 2. Using Wrangler CLI

```bash
# List recent deployments
wrangler deployments list --env production

# Rollback to specific deployment
wrangler rollback --env production <deployment-id>
```

### Git-Based Rollback

```bash
# Find the last known good commit
git log --oneline -10

# Create rollback branch
git checkout -b rollback/emergency-fix

# Reset to last good commit
git revert <commit-hash> --no-edit

# Emergency deploy
wrangler deploy --env production
```

### Rollback Verification

```bash
# Verify rollback successful
scripts/verify-deployment.sh production

# Check logs for stability
wrangler tail --env production --format pretty

# Monitor for 15 minutes minimum
timeout 900 wrangler tail --env production --format pretty
```

### Post-Rollback Actions

1. **Create incident report**:
   ```markdown
   # Incident Report: Production Rollback
   
   **Date**: YYYY-MM-DD HH:MM UTC
   **Duration**: X minutes
   **Root Cause**: [Description]
   **Resolution**: Rolled back to deployment <ID>
   **Follow-up Actions**: [List actions needed]
   ```

2. **Fix root cause**:
   ```bash
   # Create fix branch
   git checkout -b fix/deployment-issue
   
   # Implement fix
   # Test thoroughly
   # Deploy to staging first
   ```

3. **Update monitoring**:
   - Add alerts for similar issues
   - Update deployment checklist
   - Review and improve testing

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '18'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: |
          npm run type-check
          npm run lint
          npm run test:coverage
          npm run format:check

  deploy-staging:
    needs: test
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Deploy to staging
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          environment: staging
          secrets: |
            TELEGRAM_BOT_TOKEN

  deploy-production:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Deploy to production
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          environment: production
          secrets: |
            TELEGRAM_BOT_TOKEN
      
      - name: Verify deployment
        run: |
          chmod +x scripts/verify-deployment.sh
          scripts/verify-deployment.sh production
```

### GitLab CI Example

Create `.gitlab-ci.yml`:
```yaml
stages:
  - test
  - deploy-staging
  - deploy-production

variables:
  NODE_VERSION: "18"

.node-setup: &node-setup
  image: node:${NODE_VERSION}
  cache:
    paths:
      - node_modules/
  before_script:
    - npm ci

test:
  <<: *node-setup
  stage: test
  script:
    - npm run type-check
    - npm run lint
    - npm run test:coverage
    - npm run format:check
  coverage: '/Lines\s*:\s*(\d+\.?\d*)%/'

deploy-staging:
  <<: *node-setup
  stage: deploy-staging
  script:
    - npx wrangler deploy --env staging
  environment:
    name: staging
    url: https://claudecode-monitor-staging.$CI_PROJECT_NAME.workers.dev
  only:
    - merge_requests

deploy-production:
  <<: *node-setup
  stage: deploy-production
  script:
    - npx wrangler deploy --env production
    - chmod +x scripts/verify-deployment.sh
    - scripts/verify-deployment.sh production
  environment:
    name: production
    url: https://claudecode-monitor.$CI_PROJECT_NAME.workers.dev
  only:
    - main
```

### Required CI/CD Secrets

Set these secrets in your CI/CD platform:

1. **CLOUDFLARE_API_TOKEN**: Cloudflare API token with Workers edit permissions
2. **TELEGRAM_BOT_TOKEN**: Telegram bot token for notifications

### Deployment Gates

Consider implementing these deployment gates:

```yaml
# Example deployment gate for critical environments
deploy-production:
  needs: 
    - test
    - security-scan
    - staging-verification
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
      when: manual  # Require manual approval
```

## Monitoring and Observability

### Cloudflare Analytics

1. **Enable Worker Analytics**:
   ```jsonc
   {
     "observability": {
       "enabled": true
     }
   }
   ```

2. **Custom Metrics**:
   ```typescript
   // In your worker code
   export default {
     async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
       const start = Date.now();
       
       try {
         // Your scheduled logic here
         
         // Track success
         console.log('Scheduled execution completed', {
           duration: Date.now() - start,
           timestamp: new Date().toISOString()
         });
       } catch (error) {
         // Track errors
         console.error('Scheduled execution failed', {
           error: error.message,
           duration: Date.now() - start,
           timestamp: new Date().toISOString()
         });
         throw error;
       }
     }
   };
   ```

### External Monitoring

#### 1. Uptime Monitoring

```bash
# Example using curl for external monitoring
#!/bin/bash
# monitor-worker.sh

WORKER_URL="https://claudecode-monitor.your-subdomain.workers.dev"
SLACK_WEBHOOK_URL="your-slack-webhook-url"

# Health check
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$WORKER_URL")

if [ "$HTTP_STATUS" -ne 200 ]; then
    # Send alert to Slack
    curl -X POST "$SLACK_WEBHOOK_URL" \
        -H 'Content-type: application/json' \
        --data "{\"text\":\"🚨 Worker health check failed: HTTP $HTTP_STATUS\"}"
fi
```

#### 2. Log Aggregation

Set up log forwarding to external services:

```typescript
// Add to your worker for structured logging
interface LogEntry {
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

function logStructured(entry: LogEntry) {
  console.log(JSON.stringify(entry));
  
  // Optional: Forward to external logging service
  // await fetch('https://your-log-service.com/logs', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(entry)
  // });
}
```

### Alerting Setup

#### 1. Cloudflare Notifications

Set up alerts in Cloudflare dashboard:
- Worker error rate > 5%
- Worker response time > 10s
- Failed scheduled executions

#### 2. Custom Alerting

```typescript
// Add to your worker for custom alerts
async function sendAlert(message: string, severity: 'LOW' | 'MEDIUM' | 'HIGH') {
  if (env.ALERT_WEBHOOK_URL) {
    await fetch(env.ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `[${severity}] Claude Code Monitor: ${message}`,
        timestamp: new Date().toISOString()
      })
    });
  }
}
```

## Security Considerations

### Secret Management

1. **Rotate Secrets Regularly**:
   ```bash
   # Schedule secret rotation (example: monthly)
   # 1. Generate new Telegram bot token
   # 2. Update secret
   wrangler secret put TELEGRAM_BOT_TOKEN --env production
   # 3. Verify functionality
   # 4. Revoke old token
   ```

2. **Environment Separation**:
   - Use different bot tokens for dev/staging/production
   - Separate Telegram chats for each environment
   - Different KV namespaces per environment

3. **Access Control**:
   ```bash
   # Use API tokens with minimal required permissions
   # Create token at: https://dash.cloudflare.com/profile/api-tokens
   # Permissions needed:
   # - Zone:Zone Settings:Edit (if using custom domains)
   # - Zone:Zone:Read (if using custom domains)
   # - Account:Cloudflare Workers:Edit
   ```

### Network Security

1. **HTTPS Only**: Ensure all external API calls use HTTPS
2. **Input Validation**: Validate all external data sources
3. **Rate Limiting**: Implement rate limiting for external APIs

```typescript
// Example rate limiting
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  
  isAllowed(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < windowMs);
    
    if (validRequests.length >= limit) {
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(key, validRequests);
    return true;
  }
}
```

### Data Privacy

1. **Minimal Data Collection**: Only store necessary data in KV
2. **Data Retention**: Implement data cleanup policies
3. **Encryption**: Use HTTPS for all communications

```typescript
// Example data cleanup
async function cleanupOldData(env: Env) {
  const keys = await env.VERSION_STORAGE.list();
  const oneMonthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  
  for (const key of keys.keys) {
    const metadata = await env.VERSION_STORAGE.getWithMetadata(key.name);
    if (metadata.metadata?.timestamp && 
        parseInt(metadata.metadata.timestamp) < oneMonthAgo) {
      await env.VERSION_STORAGE.delete(key.name);
    }
  }
}
```

### Compliance Considerations

1. **Audit Logging**: Log all significant actions
2. **Data Governance**: Document data flows and storage
3. **Regular Security Reviews**: Schedule periodic security assessments

## Cost Optimization

### Worker Optimization

1. **Minimize Bundle Size**:
   ```bash
   # Analyze bundle
   wrangler deploy --dry-run --outdir dist
   du -h dist/*
   
   # Use tree shaking
   # Import only needed functions
   import { parse } from 'yaml/parse'; // instead of import * as yaml
   ```

2. **Efficient KV Usage**:
   ```typescript
   // Batch KV operations when possible
   const promises = keys.map(key => env.VERSION_STORAGE.get(key));
   const values = await Promise.all(promises);
   
   // Use KV metadata for small data
   await env.VERSION_STORAGE.put('key', 'value', {
     metadata: { timestamp: Date.now().toString() }
   });
   ```

3. **Optimize External Requests**:
   ```typescript
   // Use conditional requests
   const response = await fetch(url, {
     headers: {
       'If-Modified-Since': lastModified,
       'If-None-Match': etag
     }
   });
   
   if (response.status === 304) {
     // Use cached data
     return cachedData;
   }
   ```

### Cost Monitoring

```bash
# Monitor usage and costs
wrangler metrics --env production

# Set up billing alerts in Cloudflare dashboard
# Monitor:
# - CPU time usage
# - Request count
# - KV operations
# - Data transfer
```

### Environment-Specific Optimizations

```jsonc
{
  "env": {
    "production": {
      "placement": {
        "mode": "smart"  // Optimize for performance
      },
      "triggers": {
        "crons": ["0 * * * *"]  // Less frequent than development
      }
    },
    "development": {
      "triggers": {
        "crons": ["*/5 * * * *"]  // More frequent for testing
      }
    }
  }
}
```

## Final Deployment Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] Code review completed
- [ ] Security review completed
- [ ] Performance testing completed
- [ ] Staging deployment verified
- [ ] Rollback plan prepared
- [ ] Team notified of deployment

### Deployment

- [ ] Deploy to production
- [ ] Verify worker health
- [ ] Test scheduled handler
- [ ] Check KV storage access
- [ ] Verify Telegram notifications
- [ ] Monitor logs for errors
- [ ] Check performance metrics

### Post-Deployment

- [ ] Deployment verification completed
- [ ] Monitoring alerts configured
- [ ] Team notified of successful deployment
- [ ] Documentation updated
- [ ] Incident response plan updated
- [ ] Backup and recovery procedures verified

### Emergency Contacts

- **Development Team**: [Contact Information]
- **DevOps Team**: [Contact Information]
- **Cloudflare Support**: [Account-specific contact]
- **Telegram Admin**: [Bot management contact]

---

This deployment guide should be updated regularly as the project evolves and new requirements emerge. Always test deployment procedures in non-production environments first.