/**
 * CompletedTaskRef — a lightweight reference to a completed task.
 *
 * Both `Task` (from board/log .md files) and `LedgerRecord` (from ledger.jsonl)
 * can be projected into this shape. Downstream consumers (e.g. the supervisor's
 * dependency resolution and upstream summary builder) work against this interface
 * instead of reconstructing fake `Task` objects from ledger records.
 *
 * @packageDocumentation
 */

/**
 * Minimal reference to a completed task, sufficient for:
 *  - Dependency graph traversal (id, dependsOn)
 *  - Upstream summary building (title, description, deliverables, outputPath)
 *  - Artifact passing (deliverablePaths, outputPath)
 */
export interface CompletedTaskRef {
  id: string;
  title: string;
  description?: string;
  assignee?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
  relatedFiles?: string[];
  dependsOn?: string[];

  /** Resolved deliverable file paths (e.g. ["src/foo.ts", "tests/foo.test.ts"]) */
  deliverablePaths?: string[];
  /** Deliverable details with descriptions (only available from Task, not LedgerRecord) */
  deliverableDetails?: Array<{ path: string; description?: string }>;

  /** Path to the structured output summary (`.brainfile/outputs/{id}.md`) */
  outputPath?: string;
}
