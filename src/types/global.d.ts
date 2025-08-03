/**
 * Global type definitions
 * Makes the Env interface available throughout the project
 */

/// <reference types="../../worker-configuration" />

// Re-export the Env interface globally
declare global {
  // The Env interface is already defined in worker-configuration.d.ts
  // This ensures it's available globally without imports
}

export {};