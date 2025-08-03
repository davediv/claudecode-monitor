# Data Models Documentation

## Overview
This document describes the TypeScript interfaces and data structures used in the Claude Code Version Monitor application.

## Core Data Models

### Version
Represents a single version entry from the changelog.

```typescript
interface Version {
  version: string;      // Semantic version (e.g., "1.2.3")
  date: string;         // Release date in YYYY-MM-DD format
  changes: string[];    // List of changes in this version
}
```

### ChangelogData
Contains parsed changelog information.

```typescript
interface ChangelogData {
  versions: Version[];           // All parsed versions
  latestVersion: Version | null; // Most recent version
}
```

### StorageState
State persisted in Cloudflare KV storage. Matches PRD specification.

```typescript
interface StorageState {
  lastVersion: string;              // Last known version
  lastCheckTime: string;            // ISO timestamp of last check
  lastNotificationTime?: string;    // ISO timestamp of last notification
}
```

Example:
```json
{
  "lastVersion": "1.2.3",
  "lastCheckTime": "2024-01-15T10:00:00Z",
  "lastNotificationTime": "2024-01-15T10:00:05Z"
}
```

### TelegramMessage
Data structure for Telegram notifications.

```typescript
interface TelegramMessage {
  version: string;       // Version number (without 'v' prefix)
  date: string;          // Release date YYYY-MM-DD
  changes: string[];     // Changes to include in message
  changelogUrl: string;  // Link to full changelog
}
```

## Supporting Types

### TelegramConfig
Configuration for Telegram bot integration.

```typescript
interface TelegramConfig {
  botToken: string;  // Bot authentication token
  chatId: string;    // Target chat/channel ID
}
```

### VersionCheckResult
Result of checking for new versions.

```typescript
interface VersionCheckResult {
  hasNewVersion: boolean;         // Whether new version found
  latestVersion: Version | null;  // Latest version details
  previousVersion: string | null; // Previous known version
  error?: string;                 // Any error message
}
```

### PerformanceMetrics
Application performance tracking.

```typescript
interface PerformanceMetrics {
  fetchDuration?: number;        // Changelog fetch time (ms)
  parseDuration?: number;        // Parsing time (ms)
  storageDuration?: number;      // KV operations time (ms)
  notificationDuration?: number; // Notification send time (ms)
  totalDuration: number;         // Total execution time (ms)
}
```

## Error Handling

### ErrorCode
Enumeration of possible error types.

```typescript
enum ErrorCode {
  FETCH_ERROR = 'FETCH_ERROR',
  PARSE_ERROR = 'PARSE_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  NOTIFICATION_ERROR = 'NOTIFICATION_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}
```

### ErrorResponse
Standardized error response format.

```typescript
interface ErrorResponse {
  code: ErrorCode;       // Error categorization
  message: string;       // Human-readable message
  details?: unknown;     // Additional context
  timestamp: string;     // ISO timestamp
}
```

## Usage Examples

### Checking for New Version
```typescript
const result: VersionCheckResult = {
  hasNewVersion: true,
  latestVersion: {
    version: "1.2.4",
    date: "2024-01-20",
    changes: ["Added feature X", "Fixed bug Y"]
  },
  previousVersion: "1.2.3"
};
```

### Storing State
```typescript
const state: StorageState = {
  lastVersion: "1.2.4",
  lastCheckTime: new Date().toISOString(),
  lastNotificationTime: new Date().toISOString()
};
await env.VERSION_STORAGE.put(STORAGE_KEY, JSON.stringify(state));
```

### Sending Notification
```typescript
const message: TelegramMessage = {
  version: "1.2.4",
  date: "2024-01-20",
  changes: ["Added feature X", "Fixed bug Y"],
  changelogUrl: "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md"
};
await sendTelegramNotification(config, message);
```

## Type Safety Benefits

1. **Compile-time validation**: TypeScript ensures data structures match expectations
2. **IntelliSense support**: IDEs provide autocomplete for all properties
3. **Refactoring safety**: Changes to interfaces are caught at compile time
4. **Documentation**: Types serve as inline documentation
5. **Error prevention**: Many runtime errors are caught during development

## Import Usage

All data models are available from a single import:

```typescript
import type { 
  Version, 
  ChangelogData, 
  StorageState,
  TelegramMessage,
  // ... other types
} from '@/types/models';
```

Or import all types:
```typescript
import type * as Models from '@/types/models';
```