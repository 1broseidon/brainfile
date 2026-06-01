/**
 * Journal-specific type definitions
 * @packageDocumentation
 */

import { BrainfileBase } from './base';

/**
 * Journal entry definition
 */
export interface JournalEntry {
  id: string;  // ISO date format (YYYY-MM-DD) or custom ID
  title: string;
  content?: string;
  summary?: string;
  mood?: string;
  tags?: string[];
  createdAt: string;  // ISO 8601 timestamp
  updatedAt?: string;  // ISO 8601 timestamp
}

/**
 * Journal type - Time-ordered entries (dev logs, standup notes, etc.)
 * Extends BrainfileBase with journal-specific fields
 */
export interface Journal extends BrainfileBase {
  type?: 'journal';
  entries: JournalEntry[];
}
