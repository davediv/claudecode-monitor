# Development Tooling Documentation

## Overview
This document describes the development tooling setup for the Claude Code Version Monitor project, including linting, formatting, and code quality tools.

## Tools Configured

### ESLint
- **Version**: 9.x with flat config format
- **Parser**: @typescript-eslint/parser
- **Config File**: `eslint.config.js`
- **Purpose**: Code quality and consistency enforcement

### Prettier
- **Config File**: `.prettierrc`
- **Integration**: ESLint plugin for Prettier
- **Settings**:
  - Print width: 140 characters
  - Single quotes
  - Tabs for indentation
  - Semicolons enabled

### EditorConfig
- **Config File**: `.editorconfig`
- **Purpose**: Consistent coding styles across different editors
- **Settings**:
  - Tab indentation
  - UTF-8 encoding
  - LF line endings
  - Trim trailing whitespace

## Available Scripts

### Linting
```bash
# Check for linting errors
npm run lint

# Fix auto-fixable linting errors
npm run lint:fix
```

### Formatting
```bash
# Format all TypeScript files
npm run format

# Check formatting without making changes
npm run format:check
```

### Type Checking
```bash
# Run TypeScript type checking
npm run type-check
```

## ESLint Rules

### TypeScript-Specific Rules
- `@typescript-eslint/explicit-function-return-type`: Enforced (with exceptions)
- `@typescript-eslint/no-unused-vars`: Enforced (ignores _ prefixed)
- `@typescript-eslint/no-explicit-any`: Error
- `@typescript-eslint/no-floating-promises`: Error
- `@typescript-eslint/await-thenable`: Error

### General Rules
- Prettier formatting enforced via ESLint
- Console statements allowed (necessary for Workers)
- Strict type checking enabled

## Development Workflow

### Before Committing
1. Run type checking: `npm run type-check`
2. Run linting: `npm run lint`
3. Fix any issues: `npm run lint:fix`
4. Format code: `npm run format`

### VS Code Integration
Install these extensions for the best experience:
- ESLint (`dbaeumer.vscode-eslint`)
- Prettier (`esbenp.prettier-vscode`)
- EditorConfig (`EditorConfig.EditorConfig`)

### Pre-commit Hooks (Optional)
While not configured by default, you can add pre-commit hooks using husky:
```bash
npm install --save-dev husky lint-staged
npx husky-init
```

Then configure in `package.json`:
```json
{
  "lint-staged": {
    "*.ts": ["eslint --fix", "prettier --write"]
  }
}
```

## Troubleshooting

### ESLint Not Working
- Ensure all dependencies are installed: `npm install`
- Check that `eslint.config.js` exists
- Restart your IDE's ESLint server

### Prettier Conflicts
- Prettier rules are integrated via `eslint-config-prettier`
- If conflicts occur, ESLint rules take precedence
- Run `npm run lint:fix` to apply both ESLint and Prettier fixes

### Global Types Not Recognized
- Global types (Env, KVNamespace, etc.) are defined in `eslint.config.js`
- Ensure `worker-configuration.d.ts` exists
- Run `npm run cf-typegen` if needed