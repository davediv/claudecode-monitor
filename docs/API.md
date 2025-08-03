# Claude Code Version Monitor - API Documentation

## Table of Contents

1. [Overview](#overview)
2. [Main Handler Module](#main-handler-module)
3. [Configuration Module](#configuration-module)
4. [State Management Module](#state-management-module)
5. [Changelog Operations Module](#changelog-operations-module)
6. [Storage Operations Module](#storage-operations-module)
7. [Telegram Integration Module](#telegram-integration-module)
8. [Notification Formatter Module](#notification-formatter-module)
9. [Logging Module](#logging-module)
10. [Performance Monitoring Module](#performance-monitoring-module)
11. [Error Recovery Module](#error-recovery-module)
12. [Utility Functions](#utility-functions)
13. [Type Definitions](#type-definitions)
14. [Error Codes](#error-codes)
15. [Usage Examples](#usage-examples)

## Overview

The Claude Code Version Monitor is a Cloudflare Worker application that monitors the Claude Code changelog for new version releases and automatically sends notifications to a Telegram group. This API documentation provides a comprehensive reference for all modules, functions, and types used in the system.

The application follows a modular architecture with clear separation of concerns:
- **Main Handler**: Orchestrates the scheduled workflow
- **Configuration**: Manages environment-based configuration
- **State Management**: Handles version state persistence
- **Changelog Operations**: Fetches and parses changelog data
- **Storage Operations**: Manages KV storage interactions
- **Telegram Integration**: Handles notification delivery
- **Notification Formatting**: Creates formatted messages
- **Logging**: Provides structured logging capabilities
- **Performance Monitoring**: Tracks execution metrics
- **Error Recovery**: Implements resilience strategies
- **Utilities**: Common helper functions

## Main Handler Module

**File**: `src/index.ts`

The main entry point for the Cloudflare Worker, implementing both HTTP and scheduled handlers.

### Exported Handler

#### `default: ExportedHandler<Env>`

The main worker export implementing Cloudflare Worker handlers.

**Properties**:
- `fetch(req: Request, env: Env, ctx: ExecutionContext): Response` - HTTP request handler
- `scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void>` - Scheduled cron handler

### HTTP Handler

#### `fetch(req: Request, env: Env, ctx: ExecutionContext): Response`

Handles HTTP requests for testing and health checks.

**Parameters**:
- `req: Request` - Incoming HTTP request
- `env: Env` - Environment variables and bindings
- `ctx: ExecutionContext` - Execution context

**Returns**: `Response` - HTTP response

**Routes**:
- `GET /health` - Returns health status with error recovery and performance metrics
- `GET /*` - Returns instructions for testing the scheduled handler

**Example**:
```typescript
// Health check response
{
  "status": "OK",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "errorRecovery": {
    "circuitBreakers": {
      "github": { "state": "closed", "failures": 0 },
      "telegram": { "state": "closed", "failures": 0 },
      "storage": { "state": "closed", "failures": 0 }
    }
  },
  "performance": {
    "meetsTarget": true,
    "totalDuration": 45,
    "apiCallDuration": 30,
    "internalProcessingDuration": 15
  }
}
```

### Scheduled Handler

#### `scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void>`

Main workflow handler that runs on cron triggers.

**Parameters**:
- `event: ScheduledEvent` - Scheduled event details
- `env: Env` - Environment variables and bindings
- `ctx: ExecutionContext` - Execution context

**Workflow**:
1. Configure logging and performance monitoring
2. Load and validate configuration
3. Perform version check (fetch changelog, parse, compare)
4. Send notification if new version detected
5. Update state with notification time
6. Log performance summary

**Throws**: Re-throws any errors for Cloudflare dashboard tracking

**Example Usage**:
```bash
# Test scheduled handler in development
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

## Configuration Module

**File**: `src/config.ts`

Provides type-safe configuration management from environment variables.

### Functions

#### `createConfig(env: Env): AppConfig`

Creates a type-safe configuration object from the environment.

**Parameters**:
- `env: Env` - Cloudflare Worker environment

**Returns**: `AppConfig` - Configuration object

**Example**:
```typescript
const config = createConfig(env);
console.log(config.githubChangelogUrl); // https://raw.githubusercontent.com/...
```

#### `validateConfig(config: AppConfig): void`

Validates that all required configuration is present.

**Parameters**:
- `config: AppConfig` - Application configuration

**Throws**: `Error` if configuration is invalid

**Example**:
```typescript
try {
  validateConfig(config);
  console.log('Configuration is valid');
} catch (error) {
  console.error('Configuration validation failed:', error.message);
}
```

## State Management Module

**File**: `src/state-manager.ts`

Orchestrates state initialization and management operations.

### Interfaces

#### `StateInitConfig`

Configuration for state initialization.

**Properties**:
- `changelogUrl: string` - URL to fetch changelog from
- `kv: KVNamespace` - KV storage namespace
- `signal?: AbortSignal` - Optional abort signal

#### `StateInitResult`

Result of state initialization.

**Properties**:
- `isFirstRun: boolean` - Whether this is the first run
- `currentState: StorageState` - Current state data
- `versionFromChangelog: string` - Latest version from changelog
- `shouldNotify: boolean` - Whether to send notification

### Functions

#### `handleStateInitialization(config: StateInitConfig): Promise<StateInitResult>`

Handles the complete state initialization flow.

**Parameters**:
- `config: StateInitConfig` - Configuration for initialization

**Returns**: `Promise<StateInitResult>` - Initialization result

**Throws**: `WorkerError` if initialization fails

**Example**:
```typescript
const result = await handleStateInitialization({
  changelogUrl: 'https://raw.githubusercontent.com/...',
  kv: env.VERSION_STORAGE
});

if (result.isFirstRun) {
  console.log('First run - state initialized');
} else {
  console.log(`Current version: ${result.currentState.lastVersion}`);
}
```

#### `isNewVersionAvailable(currentVersion: string, latestVersion: string): boolean`

Checks if a new version is available and should trigger a notification.

**Parameters**:
- `currentVersion: string` - Current version from state
- `latestVersion: string` - Latest version from changelog

**Returns**: `boolean` - True if new version is available

**Example**:
```typescript
const hasNewVersion = isNewVersionAvailable('1.2.3', '1.2.4');
console.log(hasNewVersion); // true
```

#### `updateStateAfterNotification(kv: KVNamespace, newVersion: string): Promise<StorageState>`

Updates the state after a successful notification.

**Parameters**:
- `kv: KVNamespace` - KV namespace
- `newVersion: string` - The new version that was notified

**Returns**: `Promise<StorageState>` - Updated state

**Throws**: `WorkerError` if update fails

#### `performVersionCheck(config: StateInitConfig): Promise<VersionCheckResult>`

Performs a complete version check workflow.

**Parameters**:
- `config: StateInitConfig` - Configuration for the check

**Returns**: `Promise<VersionCheckResult>` - Check result with notification decision

**Throws**: `WorkerError` if check fails

## Changelog Operations Module

**File**: `src/changelog.ts`

Handles retrieving and parsing the Claude Code changelog from GitHub.

### Constants

- `MAX_CHANGELOG_SIZE: number` - Maximum allowed changelog size (1MB)
- `FETCH_TIMEOUT: number` - Default fetch timeout (10 seconds)

### Functions

#### `fetchChangelog(url: string, signal?: AbortSignal): Promise<string>`

Fetches the changelog from GitHub with proper error handling.

**Parameters**:
- `url: string` - URL to fetch changelog from
- `signal?: AbortSignal` - Optional abort signal for cancellation

**Returns**: `Promise<string>` - Raw markdown content

**Throws**: `WorkerError` with `FETCH_ERROR` code if fetch fails

**Example**:
```typescript
try {
  const markdown = await fetchChangelog(
    'https://raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/CHANGELOG.md'
  );
  console.log(`Fetched ${markdown.length} bytes`);
} catch (error) {
  if (error instanceof WorkerError && error.code === ErrorCode.FETCH_ERROR) {
    console.error('Failed to fetch changelog:', error.message);
  }
}
```

#### `parseChangelog(markdown: string): ChangelogData`

Parses the changelog markdown to extract version information.

**Parameters**:
- `markdown: string` - Raw markdown content

**Returns**: `ChangelogData` - Parsed changelog with versions array

**Throws**: `WorkerError` with `PARSE_ERROR` code if parsing fails

**Supported Formats**:
- `## [1.2.3] - 2024-01-15` (with date)
- `## v1.2.3 - 2024-01-15` (with v prefix and date)
- `## 1.2.3` (version only)
- `## [v1.2.3]` (bracketed with v prefix)

**Example**:
```typescript
const changelog = parseChangelog(markdownContent);
console.log(`Found ${changelog.versions.length} versions`);
console.log(`Latest: ${changelog.latestVersion?.version}`);
```

#### `extractLatestVersion(markdown: string): string | null`

Extracts the latest version from changelog content.

**Parameters**:
- `markdown: string` - Raw markdown content

**Returns**: `string | null` - Latest version string or null if not found

#### `isValidSemver(version: string): boolean`

Validates if a string is a valid semantic version.

**Parameters**:
- `version: string` - Version string to validate

**Returns**: `boolean` - True if valid semver format

**Example**:
```typescript
console.log(isValidSemver('1.2.3')); // true
console.log(isValidSemver('1.2.3-beta.1')); // true
console.log(isValidSemver('v1.2.3')); // false
```

#### `compareVersions(v1: string, v2: string): number`

Compares two semantic versions according to semver specification.

**Parameters**:
- `v1: string` - First version
- `v2: string` - Second version

**Returns**: `number` - 1 if v1 > v2, -1 if v1 < v2, 0 if equal

**Throws**: `WorkerError` with `PARSE_ERROR` code if versions are invalid

**Example**:
```typescript
console.log(compareVersions('1.2.4', '1.2.3')); // 1 (newer)
console.log(compareVersions('1.2.3', '1.2.4')); // -1 (older)
console.log(compareVersions('1.2.3', '1.2.3')); // 0 (equal)
```

#### `isNewerVersion(v1: string, v2: string): boolean`

Checks if version v1 is newer than version v2.

**Parameters**:
- `v1: string` - First version to check
- `v2: string` - Second version to compare against

**Returns**: `boolean` - True if v1 is newer than v2

## Storage Operations Module

**File**: `src/storage.ts`

Handles state persistence using Cloudflare KV with retry logic.

### Constants

- `STORAGE_KEY: string` - Key used for storing state ('claude-code-monitor-state')
- `STATE_TTL: number` - TTL for state data (30 days)

### Functions

#### `getState(kv: KVNamespace, retries = 2): Promise<StorageState | null>`

Retrieves the current state from KV storage with retry logic.

**Parameters**:
- `kv: KVNamespace` - Cloudflare KV namespace
- `retries: number` - Number of retry attempts (default: 2)

**Returns**: `Promise<StorageState | null>` - Stored state or null if not found

**Throws**: `WorkerError` with `STORAGE_ERROR` code if operation fails

**Example**:
```typescript
const state = await getState(env.VERSION_STORAGE);
if (state) {
  console.log(`Last version: ${state.lastVersion}`);
  console.log(`Last check: ${state.lastCheckTime}`);
} else {
  console.log('No previous state found');
}
```

#### `setState(kv: KVNamespace, state: StorageState, retries = 2): Promise<void>`

Updates the state in KV storage with retry logic.

**Parameters**:
- `kv: KVNamespace` - Cloudflare KV namespace
- `state: StorageState` - New state to store
- `retries: number` - Number of retry attempts (default: 2)

**Throws**: `WorkerError` with `STORAGE_ERROR` code if operation fails

**Example**:
```typescript
const newState: StorageState = {
  lastVersion: '1.2.4',
  lastCheckTime: new Date().toISOString(),
  lastNotificationTime: new Date().toISOString()
};

await setState(env.VERSION_STORAGE, newState);
```

#### `initializeState(kv: KVNamespace, currentVersion: string): Promise<StorageState>`

Initializes the state with the current version.

**Parameters**:
- `kv: KVNamespace` - Cloudflare KV namespace
- `currentVersion: string` - Current version from changelog

**Returns**: `Promise<StorageState>` - Initialized state

**Throws**: `WorkerError` with `STORAGE_ERROR` code if initialization fails

#### `isFirstRun(kv: KVNamespace): Promise<boolean>`

Checks if this is the first run (no state exists).

**Parameters**:
- `kv: KVNamespace` - Cloudflare KV namespace

**Returns**: `Promise<boolean>` - True if first run, false otherwise

#### `updateNotificationTime(kv: KVNamespace, notificationTime: string): Promise<void>`

Updates only the notification time in the state.

**Parameters**:
- `kv: KVNamespace` - Cloudflare KV namespace
- `notificationTime: string` - Time when notification was sent

**Throws**: `WorkerError` with `STORAGE_ERROR` code if update fails

#### `clearState(kv: KVNamespace): Promise<void>`

Clears the stored state (useful for testing or reset).

**Parameters**:
- `kv: KVNamespace` - Cloudflare KV namespace

**Throws**: `WorkerError` with `STORAGE_ERROR` code if deletion fails

## Telegram Integration Module

**File**: `src/telegram.ts`

Handles sending notifications to Telegram groups via the Bot API.

### Interfaces

#### `TelegramApiResponse`

Response structure from Telegram Bot API.

**Properties**:
- `ok: boolean` - Whether the request succeeded
- `result?: unknown` - Response data
- `error_code?: number` - Error code if failed
- `description?: string` - Error description
- `parameters?: { retry_after?: number }` - Rate limit parameters

### Functions

#### `sendTelegramNotification(config: TelegramConfig, message: TelegramMessage, retries = 3): Promise<void>`

Sends a message to Telegram using the Bot API with retry logic and rate limiting.

**Parameters**:
- `config: TelegramConfig` - Bot configuration
- `message: TelegramMessage` - Message content
- `retries: number` - Number of retry attempts (default: 3)

**Throws**: `WorkerError` with appropriate error code if sending fails

**Features**:
- Automatic rate limiting (max 20 requests per minute)
- Exponential backoff on failures
- Handles Telegram rate limits with retry-after
- Markdown formatting support
- Thread/topic support for supergroups

**Example**:
```typescript
const config: TelegramConfig = {
  botToken: env.TELEGRAM_BOT_TOKEN,
  chatId: env.TELEGRAM_CHAT_ID,
  threadId: env.TELEGRAM_THREAD_ID // optional
};

const message: TelegramMessage = {
  version: '1.2.4',
  date: '2024-01-15',
  changes: ['• Added new feature', '• Fixed bug'],
  changelogUrl: 'https://github.com/...'
};

await sendTelegramNotification(config, message);
```

#### `isValidChatId(chatId: string): boolean`

Validates if a string is a valid Telegram chat ID.

**Parameters**:
- `chatId: string` - Chat ID to validate

**Returns**: `boolean` - True if valid

**Valid Formats**:
- Positive numbers for users: `"123456789"`
- Negative numbers for groups: `"-987654321"`
- Channel usernames: `"@channelname"`

#### `getTelegramApiUrl(botToken: string, method: string): string`

Gets the Telegram API URL for a specific bot method.

**Parameters**:
- `botToken: string` - Bot token
- `method: string` - API method name

**Returns**: `string` - Full API URL

**Example**:
```typescript
const url = getTelegramApiUrl(botToken, 'sendMessage');
// Returns: https://api.telegram.org/bot<token>/sendMessage
```

#### `formatMessage(message: TelegramMessage): string` *(Deprecated)*

Formats the message for Telegram with markdown.

**Note**: This function is deprecated. Use `formatTelegramNotification` from the notification-formatter module instead.

## Notification Formatter Module

**File**: `src/notification-formatter.ts`

Handles formatting of messages for various notification channels.

### Interfaces

#### `FormatOptions`

Configuration options for message formatting.

**Properties**:
- `maxChanges?: number` - Maximum number of changes to display (default: 10)
- `includeEmoji?: boolean` - Include emoji in messages (default: true)
- `dateLocale?: string` - Date format locale (default: 'en-US')
- `dateFormatOptions?: Intl.DateTimeFormatOptions` - Custom date formatting
- `escapeMarkdown?: boolean` - Escape markdown special characters (default: true)

### Functions

#### `escapeMarkdown(text: string): string`

Escapes markdown special characters for Telegram.

**Parameters**:
- `text: string` - Text to escape

**Returns**: `string` - Escaped text

**Example**:
```typescript
const escaped = escapeMarkdown('Text with * special characters!');
// Returns: Text with \\* special characters\\!
```

#### `formatDate(dateString: string | undefined, options?: Partial<FormatOptions>): string`

Formats a date string into a human-readable format.

**Parameters**:
- `dateString: string | undefined` - ISO date string or 'Unknown'
- `options?: Partial<FormatOptions>` - Formatting options

**Returns**: `string` - Formatted date string

**Example**:
```typescript
const formatted = formatDate('2024-01-15');
// Returns: January 15, 2024
```

#### `formatChanges(changes: string[], options?: Partial<FormatOptions>): string`

Formats a list of changes with proper bullets and markdown.

**Parameters**:
- `changes: string[]` - Array of change strings
- `options?: Partial<FormatOptions>` - Formatting options

**Returns**: `string` - Formatted changes string

**Example**:
```typescript
const changes = ['Added new feature', 'Fixed critical bug'];
const formatted = formatChanges(changes);
// Returns:
// • Added new feature
// • Fixed critical bug
```

#### `createTelegramMessage(version: Version, changelogUrl: string): TelegramMessage`

Creates a TelegramMessage from a Version object.

**Parameters**:
- `version: Version` - Version data
- `changelogUrl: string` - URL to the full changelog

**Returns**: `TelegramMessage` - Message object ready for sending

**Throws**: `WorkerError` with `VALIDATION_ERROR` code if version data is invalid

#### `formatTelegramNotification(message: TelegramMessage, options?: FormatOptions): string`

Formats a notification message for Telegram.

**Parameters**:
- `message: TelegramMessage` - Message data
- `options?: FormatOptions` - Formatting options

**Returns**: `string` - Formatted message string

**Example**:
```typescript
const formatted = formatTelegramNotification(message);
// Returns formatted message like:
// 🚀 *New Claude Code Release!*
// 
// Version: *v1.2.4*
// Released: January 15, 2024
// 
// *What's New:*
// • Added new feature
// • Fixed critical bug
// 
// Full changelog: [View on GitHub](https://github.com/...)
```

#### `formatNotification(message: TelegramMessage, platform: 'telegram' | 'slack' | 'discord' | 'plain', options?: FormatOptions): string`

Formats a notification for different platforms.

**Parameters**:
- `message: TelegramMessage` - Message data
- `platform: string` - Target platform
- `options?: FormatOptions` - Platform-specific formatting options

**Returns**: `string` - Formatted message string

**Supported Platforms**:
- `telegram` - Telegram markdown format
- `plain` - Plain text without markdown
- `slack` - Future enhancement
- `discord` - Future enhancement

## Logging Module

**File**: `src/logging.ts`

Provides structured logging with context and error tracking.

### Enums

#### `LogLevel`

Log levels for structured logging.

**Values**:
- `DEBUG` - Debug information
- `INFO` - General information
- `WARN` - Warning messages
- `ERROR` - Error messages
- `CRITICAL` - Critical errors requiring immediate attention

### Interfaces

#### `LogEntry`

Structure for log entries.

**Properties**:
- `timestamp: string` - ISO timestamp
- `level: LogLevel` - Log level
- `message: string` - Log message
- `context?: Record<string, unknown>` - Additional context
- `error?: object` - Error details if applicable

#### `LoggerConfig`

Configuration for the logger.

**Properties**:
- `minLevel?: LogLevel` - Minimum log level to output (default: INFO)
- `includeStackTrace?: boolean` - Include stack traces (default: true)
- `jsonOutput?: boolean` - Output as JSON (default: true)
- `executionContext?: ExecutionContext` - Execution context for async operations

#### `ErrorRecoveryStrategy`

Strategy for error recovery operations.

**Properties**:
- `shouldRetry: (error: unknown, attempt: number) => boolean` - Retry decision function
- `getRetryDelay: (attempt: number) => number` - Delay calculation function
- `maxAttempts: number` - Maximum retry attempts

### Functions

#### `configureLogger(config: Partial<LoggerConfig>): void`

Configure the global logger.

**Parameters**:
- `config: Partial<LoggerConfig>` - Logger configuration

**Example**:
```typescript
configureLogger({
  minLevel: LogLevel.DEBUG,
  jsonOutput: false
});
```

#### `logger: object`

Logger instance with convenience methods.

**Methods**:
- `debug(message: string, context?: Record<string, unknown>): void`
- `info(message: string, context?: Record<string, unknown>): void`
- `warn(message: string, context?: Record<string, unknown>): void`
- `error(message: string, context?: Record<string, unknown>): void`
- `critical(message: string, context?: Record<string, unknown>): void`

**Example**:
```typescript
logger.info('Version check completed', {
  currentVersion: '1.2.3',
  latestVersion: '1.2.4',
  hasNewVersion: true
});
```

#### `logError(error: unknown, context?: Record<string, unknown>): void`

Log error with structured format.

**Parameters**:
- `error: unknown` - Error to log
- `context?: Record<string, unknown>` - Additional context

#### `trackOperation<T>(operationName: string, fn: () => Promise<T>, context?: Record<string, unknown>): Promise<T>`

Track operation with structured logging.

**Parameters**:
- `operationName: string` - Name of the operation
- `fn: () => Promise<T>` - Async function to execute
- `context?: Record<string, unknown>` - Additional context

**Returns**: `Promise<T>` - Result of the function

**Example**:
```typescript
const result = await trackOperation('fetch_changelog', async () => {
  return await fetchChangelog(url);
}, { url });
```

#### `createContextLogger(baseContext: Record<string, unknown>): object`

Create a context-aware logger.

**Parameters**:
- `baseContext: Record<string, unknown>` - Base context for all logs

**Returns**: Logger instance with context

**Example**:
```typescript
const log = createContextLogger({
  executionId: 'exec-123',
  operation: 'version-check'
});

log.info('Starting operation'); // Includes base context
```

#### `withRetry<T>(fn: () => Promise<T>, strategy?: ErrorRecoveryStrategy, context?: Record<string, unknown>): Promise<T>`

Execute function with retry logic.

**Parameters**:
- `fn: () => Promise<T>` - Function to execute
- `strategy?: ErrorRecoveryStrategy` - Recovery strategy
- `context?: Record<string, unknown>` - Additional context

**Returns**: `Promise<T>` - Result of the function

#### `sanitizeForLogging(data: Record<string, unknown>, sensitiveKeys?: string[]): Record<string, unknown>`

Ensure sensitive data is not logged.

**Parameters**:
- `data: Record<string, unknown>` - Data to sanitize
- `sensitiveKeys?: string[]` - Keys to redact (default includes 'token', 'password', etc.)

**Returns**: `Record<string, unknown>` - Sanitized data

## Performance Monitoring Module

**File**: `src/performance.ts`

Tracks execution times, resource usage, and performance metrics.

### Interfaces

#### `PerformanceMetric`

Individual performance metric.

**Properties**:
- `operation: string` - Operation name
- `duration: number` - Duration in milliseconds
- `timestamp: string` - ISO timestamp
- `success: boolean` - Whether operation succeeded
- `metadata?: Record<string, unknown>` - Additional metadata

#### `PerformanceThresholds`

Performance threshold configuration.

**Properties**:
- `maxExecutionTime: number` - Maximum execution time in ms (excluding API calls)
- `warningThreshold: number` - Warning threshold as percentage of max
- `criticalThreshold: number` - Critical threshold as percentage of max

#### `PerformanceSummary`

Performance summary for an execution.

**Properties**:
- `totalDuration: number` - Total execution time
- `operationBreakdown: Record<string, number>` - Time per operation
- `apiCallDuration: number` - Time spent on API calls
- `internalProcessingDuration: number` - Internal processing time
- `meetsPerformanceTarget: boolean` - Whether performance targets were met
- `warnings: string[]` - Performance warnings

### Classes

#### `PerformanceCollector`

Performance collector for tracking metrics.

**Constructor**:
```typescript
new PerformanceCollector(thresholds?: PerformanceThresholds)
```

**Methods**:
- `startOperation(operationName: string): string` - Start tracking an operation
- `endOperation(operationName: string, success?: boolean, metadata?: Record<string, unknown>): void` - End tracking
- `track<T>(operationName: string, fn: () => Promise<T>, metadata?: Record<string, unknown>): Promise<T>` - Track async operation
- `getSummary(): PerformanceSummary` - Get performance summary
- `getMetrics(): PerformanceMetric[]` - Get all collected metrics
- `reset(): void` - Reset the collector

**Example**:
```typescript
const collector = new PerformanceCollector();

// Manual tracking
const opId = collector.startOperation('database_query');
// ... perform operation
collector.endOperation('database_query', true);

// Automatic tracking
const result = await collector.track('api_call', async () => {
  return await fetch(url);
});

const summary = collector.getSummary();
console.log(`Total time: ${summary.totalDuration}ms`);
```

### Functions

#### `trackPerformance<T>(operationName: string, fn: () => Promise<T>, metadata?: Record<string, unknown>): Promise<T>`

Enhanced performance tracking function.

**Parameters**:
- `operationName: string` - Name of the operation
- `fn: () => Promise<T>` - Async function to execute
- `metadata?: Record<string, unknown>` - Additional metadata

**Returns**: `Promise<T>` - Result of the function

#### `createPerformanceMiddleware(env: Env): object`

Performance monitoring middleware.

**Parameters**:
- `env: Env` - Environment object

**Returns**: Middleware object with `start()` and `end()` methods

**Example**:
```typescript
const perfMonitor = createPerformanceMiddleware(env);
perfMonitor.start();

// ... execute operations

const summary = perfMonitor.end();
console.log(`Performance target met: ${summary.meetsPerformanceTarget}`);
```

#### `getPerformanceHealth(): Record<string, unknown>`

Get performance health status.

**Returns**: Health status object

## Error Recovery Module

**File**: `src/error-recovery.ts`

Implements specific error handling strategies for different error scenarios.

### Interfaces

#### `RecoveryContext`

Error recovery context.

**Properties**:
- `operation: string` - Operation being performed
- `attemptNumber: number` - Current attempt number
- `error: unknown` - The error that occurred
- `additionalContext?: Record<string, unknown>` - Additional context

#### `RecoveryResult<T>`

Recovery action result.

**Properties**:
- `success: boolean` - Whether recovery succeeded
- `recovered: boolean` - Whether error was recovered from
- `result?: T` - Result if recovery succeeded
- `error?: unknown` - Error if recovery failed

### Classes

#### `CircuitBreaker`

Circuit breaker for preventing cascading failures.

**Constructor**:
```typescript
new CircuitBreaker(threshold?: number, timeout?: number, operation?: string)
```

**Parameters**:
- `threshold: number` - Failure threshold (default: 5)
- `timeout: number` - Reset timeout in ms (default: 60000)
- `operation: string` - Operation name

**Methods**:
- `execute<T>(fn: () => Promise<T>): Promise<T>` - Execute with circuit breaker protection
- `reset(): void` - Reset the circuit breaker

**States**:
- `closed` - Normal operation
- `open` - Too many failures, blocking requests
- `half-open` - Testing if service has recovered

**Example**:
```typescript
const breaker = new CircuitBreaker(3, 30000, 'telegram-api');

try {
  const result = await breaker.execute(async () => {
    return await sendTelegramMessage(message);
  });
} catch (error) {
  console.log('Circuit breaker prevented call or operation failed');
}
```

### Constants

#### `errorRecoveryStrategies`

Error-specific recovery strategies based on PRD requirements.

**Strategies**:
- `githubUnreachable` - GitHub API failures (ERR-001)
- `changelogParsing` - Changelog parsing failures (ERR-002)
- `telegramApi` - Telegram API errors (ERR-003)
- `kvStorage` - KV storage errors (ERR-004)

### Functions

#### `handleErrorWithRecovery<T>(error: unknown, context: RecoveryContext): RecoveryResult<T>`

Handle error with appropriate recovery strategy.

**Parameters**:
- `error: unknown` - The error to handle
- `context: RecoveryContext` - Recovery context

**Returns**: `RecoveryResult<T>` - Recovery result

#### `makeResilient<T>(operation: string, fn: T, recoveryStrategy?: object): T`

Create a resilient wrapper for operations.

**Parameters**:
- `operation: string` - Operation name
- `fn: T` - Function to wrap
- `recoveryStrategy?: object` - Optional custom recovery strategy

**Returns**: `T` - Wrapped function with error recovery

**Example**:
```typescript
const resilientFetch = makeResilient('changelog-fetch', fetchChangelog);

try {
  const content = await resilientFetch(url);
} catch (error) {
  // Error has been through recovery strategies
  console.error('All recovery attempts failed:', error.message);
}
```

#### `getErrorRecoveryHealth(): Record<string, unknown>`

Health check for error recovery systems.

**Returns**: Health status including circuit breaker states

### Global Circuit Breakers

Pre-configured circuit breakers for critical operations:

- `circuitBreakers.github` - GitHub API operations
- `circuitBreakers.telegram` - Telegram API operations  
- `circuitBreakers.storage` - KV storage operations

## Utility Functions

**File**: `src/utils.ts`

Common helper functions used across the application.

### Functions

#### `measureTime<T>(fn: () => Promise<T>, label: string): Promise<T>`

Measures the execution time of an async function.

**Parameters**:
- `fn: () => Promise<T>` - Function to measure
- `label: string` - Label for logging

**Returns**: `Promise<T>` - Result of the function

**Example**:
```typescript
const result = await measureTime(async () => {
  return await fetchData();
}, 'Data fetch operation');
// Logs: Data fetch operation completed in 150ms
```

#### `logError(error: unknown, context?: Record<string, unknown>): void`

Creates a structured error log entry.

**Parameters**:
- `error: unknown` - The error to log
- `context?: Record<string, unknown>` - Additional context information

#### `validateEnvironment(env: Env): { valid: boolean; missing: string[] }`

Validates environment configuration.

**Parameters**:
- `env: Env` - Environment object

**Returns**: Validation result with any missing variables

**Example**:
```typescript
const validation = validateEnvironment(env);
if (!validation.valid) {
  console.error('Missing required environment variables:', validation.missing);
}
```

#### `getErrorMessage(error: unknown): string`

Safely extracts error message from unknown error type.

**Parameters**:
- `error: unknown` - The error to extract message from

**Returns**: `string` - Error message string

## Type Definitions

### Core Types

#### `Env` (Global Interface)

Cloudflare Worker environment interface containing all environment variables and bindings.

#### `StorageState`

State stored in Cloudflare KV matching the PRD schema specification.

**Properties**:
- `lastVersion: string` - Last known version number
- `lastCheckTime: string` - ISO timestamp of last check
- `lastNotificationTime?: string` - ISO timestamp of last notification sent

#### `Version`

Represents a version entry from the changelog.

**Properties**:
- `version: string` - Semantic version string (e.g., "1.2.3")
- `date: string` - Release date in YYYY-MM-DD format
- `changes: string[]` - List of changes/features in this version

#### `ChangelogData`

Parsed changelog data structure.

**Properties**:
- `versions: Version[]` - All versions found in the changelog
- `latestVersion: Version | null` - The most recent version (first in the list)

#### `TelegramConfig`

Configuration for Telegram bot.

**Properties**:
- `botToken: string` - Bot authentication token
- `chatId: string` - Target chat/channel ID
- `threadId?: string` - Optional thread/topic ID for supergroups

#### `TelegramMessage`

Message data structure for Telegram notifications.

**Properties**:
- `version: string` - Version number (without 'v' prefix)
- `date: string` - Release date in YYYY-MM-DD format
- `changes: string[]` - List of changes to include in the message
- `changelogUrl: string` - URL to the full changelog

#### `VersionCheckResult`

Result of a version check operation.

**Properties**:
- `hasNewVersion: boolean` - Whether a new version was found
- `latestVersion: Version | null` - The latest version from the changelog
- `previousVersion: string | null` - The previous version from storage
- `error?: string` - Any error that occurred during checking

#### `PerformanceMetrics`

Application metrics for monitoring.

**Properties**:
- `fetchDuration?: number` - Time taken to fetch changelog in ms
- `parseDuration?: number` - Time taken to parse changelog in ms
- `storageDuration?: number` - Time taken for KV operations in ms
- `notificationDuration?: number` - Time taken to send notification in ms
- `totalDuration: number` - Total execution time in ms

#### `AppConfig`

Type-safe configuration object.

**Properties**:
- `githubChangelogUrl: string` - URL to fetch changelog from
- `telegramChatId: string` - Telegram chat ID
- `telegramBotToken: string` - Telegram bot token
- `versionStorage: KVNamespace` - KV namespace for state storage

#### `WorkerError`

Enhanced error class with error codes and details.

**Properties**:
- `message: string` - Error message
- `code: string` - Error code for categorization
- `details?: unknown` - Additional error details

### Event Types

#### `ScheduledEvent`

Cloudflare Worker scheduled event.

**Properties**:
- `cron: string` - Cron expression
- `scheduledTime: number` - Scheduled execution time

#### `ExecutionContext`

Cloudflare Worker execution context.

**Methods**:
- `waitUntil(promise: Promise<unknown>): void` - Extend execution lifetime
- `passThroughOnException(): void` - Pass through on exception

## Error Codes

### `ErrorCode` Enum

Standardized error codes used throughout the application.

#### `FETCH_ERROR`
**Triggers**: 
- Network failures when fetching changelog
- HTTP errors (4xx, 5xx responses)
- Timeout errors
- Content size exceeding limits

**Handling**: Retry with exponential backoff for server errors and network issues

**Example**:
```typescript
try {
  const content = await fetchChangelog(url);
} catch (error) {
  if (error instanceof WorkerError && error.code === ErrorCode.FETCH_ERROR) {
    const details = error.details as { status?: number };
    if (details?.status >= 500) {
      // Server error - will be retried
    }
  }
}
```

#### `PARSE_ERROR`
**Triggers**:
- Invalid markdown format in changelog
- No version entries found
- Malformed semantic version strings
- Changelog structure changes

**Handling**: No automatic retry - requires manual intervention

**Recovery**: Log as critical error and continue with existing state

#### `STORAGE_ERROR`
**Triggers**:
- KV namespace not configured
- KV read/write failures
- Invalid state data structure
- KV timeouts

**Handling**: Retry with short delays (1s, 2s)

**Recovery**: May continue with in-memory state if reads fail

#### `NOTIFICATION_ERROR`
**Triggers**:
- Invalid message format
- Missing notification data
- General notification system failures

**Handling**: Retry with exponential backoff

#### `CONFIG_ERROR`
**Triggers**:
- Missing required environment variables
- Invalid configuration values
- Missing KV namespace bindings

**Handling**: No retry - critical error requiring immediate attention

#### `VALIDATION_ERROR`
**Triggers**:
- Invalid input parameters
- Data validation failures
- Type mismatches

**Handling**: No retry - indicates programming error

#### `API_ERROR`
**Triggers**:
- Telegram API failures (non-rate-limit)
- Unexpected API responses
- Authentication failures

**Handling**: Retry for 5xx errors, no retry for 4xx errors (except 429)

#### `RATE_LIMIT_ERROR`
**Triggers**:
- Telegram API rate limiting (429 responses)
- Internal rate limiting triggers

**Handling**: Wait for specified retry-after period, then retry

#### `UNKNOWN_ERROR`
**Triggers**:
- Unexpected errors not categorized above
- Third-party library errors
- Runtime errors

**Handling**: Limited retry with caution

### Error Response Format

All errors follow a standardized format:

```typescript
interface ErrorResponse {
  code: ErrorCode;
  message: string;
  details?: unknown;
  timestamp: string;
}
```

## Usage Examples

### Basic Version Check Workflow

```typescript
import { performVersionCheck } from './state-manager';
import { createConfig, validateConfig } from './config';

async function checkForUpdates(env: Env) {
  // Create and validate configuration
  const config = createConfig(env);
  validateConfig(config);

  // Perform version check
  const result = await performVersionCheck({
    changelogUrl: config.githubChangelogUrl,
    kv: env.VERSION_STORAGE
  });

  if (result.shouldNotify) {
    console.log(`New version detected: ${result.latestVersion}`);
    // Send notification logic here
  }
}
```

### Manual Changelog Parsing

```typescript
import { fetchChangelog, parseChangelog } from './changelog';

async function parseChangelogManually() {
  const url = 'https://raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/CHANGELOG.md';
  
  try {
    const markdown = await fetchChangelog(url);
    const changelog = parseChangelog(markdown);
    
    console.log(`Found ${changelog.versions.length} versions`);
    if (changelog.latestVersion) {
      console.log(`Latest: v${changelog.latestVersion.version} (${changelog.latestVersion.date})`);
      console.log('Changes:');
      changelog.latestVersion.changes.forEach(change => {
        console.log(`  ${change}`);
      });
    }
  } catch (error) {
    console.error('Failed to parse changelog:', error);
  }
}
```

### Custom Notification Formatting

```typescript
import { createTelegramMessage, formatTelegramNotification } from './notification-formatter';

function createCustomNotification(version: Version) {
  const message = createTelegramMessage(version, 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md');
  
  // Custom formatting options
  const formatted = formatTelegramNotification(message, {
    maxChanges: 5,
    includeEmoji: false,
    escapeMarkdown: true,
    dateFormatOptions: {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }
  });
  
  return formatted;
}
```

### Performance Monitoring

```typescript
import { trackPerformance, createPerformanceMiddleware } from './performance';

async function monitoredOperation(env: Env) {
  const perfMonitor = createPerformanceMiddleware(env);
  perfMonitor.start();

  try {
    // Track individual operations
    const changelog = await trackPerformance('fetch_changelog', () => 
      fetchChangelog(url)
    );

    const parsed = await trackPerformance('parse_changelog', () => 
      Promise.resolve(parseChangelog(changelog))
    );

    // End monitoring and get summary
    const summary = perfMonitor.end();
    console.log(`Performance target met: ${summary.meetsPerformanceTarget}`);
    
  } catch (error) {
    perfMonitor.end(); // Ensure monitoring ends even on error
    throw error;
  }
}
```

### Error Recovery with Circuit Breakers

```typescript
import { makeResilient, circuitBreakers } from './error-recovery';
import { sendTelegramNotification } from './telegram';

// Create resilient version of Telegram notification
const resilientNotify = makeResilient('telegram-notification', sendTelegramNotification);

async function sendNotificationSafely(config: TelegramConfig, message: TelegramMessage) {
  try {
    // Use circuit breaker for additional protection
    await circuitBreakers.telegram.execute(async () => {
      await resilientNotify(config, message);
    });
    console.log('Notification sent successfully');
  } catch (error) {
    console.error('All notification attempts failed:', error.message);
    // Could implement fallback notification method here
  }
}
```

### Comprehensive Logging

```typescript
import { configureLogger, LogLevel, createContextLogger, trackOperation } from './logging';

// Configure logging for production
configureLogger({
  minLevel: LogLevel.INFO,
  jsonOutput: true,
  includeStackTrace: false
});

async function loggedOperation(executionId: string) {
  // Create context logger
  const log = createContextLogger({ executionId, operation: 'version-check' });
  
  log.info('Starting version check operation');
  
  try {
    const result = await trackOperation('complete_check', async () => {
      // Perform operations here
      return { success: true, version: '1.2.3' };
    }, { executionId });
    
    log.info('Version check completed successfully', { result });
    return result;
  } catch (error) {
    log.error('Version check failed', { error: error.message });
    throw error;
  }
}
```

### Testing Scheduled Handler

```bash
# Start development server
npm run dev

# Test scheduled handler
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"

# Check health endpoint
curl "http://localhost:8787/health"
```

### Environment Setup Example

```bash
# Set required environment variables
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID

# Optional environment variables
wrangler secret put TELEGRAM_THREAD_ID
wrangler secret put LOG_LEVEL
wrangler secret put PERFORMANCE_ANALYTICS_ENABLED

# Deploy to Cloudflare Workers
npm run deploy
```

This comprehensive API documentation provides developers with everything needed to understand, use, and extend the Claude Code Version Monitor system. Each module is clearly documented with its functions, parameters, return values, error conditions, and practical usage examples.