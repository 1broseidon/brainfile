/**
 * Agent state persisted in `.brainfile/state.json`.
 *
 * This file is intended for machine-managed metadata (pickup versions, caches, etc.)
 * and should be git-ignored by default.
 */

export const BRAINFILE_STATE_VERSION = '1.0.0' as const;

export interface ContractState {
  pickedUpVersion: number;
  pickedUpAt: string;
  agent?: string;
}

export interface AgentState {
  lastSeen?: string;
  activeContracts?: string[];
}

export interface BrainfileState {
  version: typeof BRAINFILE_STATE_VERSION | string;
  contracts?: Record<string, ContractState>;
  agents?: Record<string, AgentState>;
  /**
   * Reserved for future caches (e.g., metrics).
   * Keep this flexible to avoid breaking changes.
   */
  cache?: Record<string, unknown>;
}

