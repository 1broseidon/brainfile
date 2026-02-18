/**
 * Core type definitions for the Brainfile task management protocol
 * @packageDocumentation
 */

// Base types shared across all brainfile types
export * from './base';

// Type system enums
export * from './enums';

// Contracts (optional task extension)
export * from './contract';

// Type-specific definitions
export * from './board';
export * from './journal';

// Union type for all brainfile types
import { Board } from './board';
import { Journal } from './journal';

export type Brainfile = Board | Journal;
