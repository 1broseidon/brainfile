/**
 * Core type definitions for the Brainfile task management protocol
 * @packageDocumentation
 */

export interface Rule {
  id: number;
  rule: string;
}

export interface Rules {
  always?: Rule[];
  never?: Rule[];
  prefer?: Rule[];
  context?: Rule[];
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  relatedFiles?: string[];
  assignee?: string;
  tags?: string[];
  priority?: 'low' | 'medium' | 'high' | 'critical';
  dueDate?: string;
  subtasks?: Subtask[];
  template?: 'bug' | 'feature' | 'refactor';
}

export interface Column {
  id: string;
  title: string;
  order?: number;
  tasks: Task[];
}

export interface AgentInstructions {
  instructions: string[];
}

export interface StatsConfig {
  columns?: string[];  // Column IDs to display in stats (max 4)
}

export interface Board {
  title: string;
  protocolVersion?: string;
  schema?: string;
  agent?: AgentInstructions;
  rules?: Rules;
  statsConfig?: StatsConfig;
  columns: Column[];
  archive?: Task[];
}

// Task Template Types
export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  template: Partial<Task>;
  variables?: TemplateVariable[];
  isBuiltIn?: boolean;
}

export interface TemplateVariable {
  name: string;
  description: string;
  defaultValue?: string;
  required?: boolean;
}

export interface TemplateConfig {
  builtInTemplates: TaskTemplate[];
  userTemplates: TaskTemplate[];
}

// Built-in template type enum
export const TEMPLATE_TYPES = {
  BUG: 'bug',
  FEATURE: 'feature',
  REFACTOR: 'refactor'
} as const;

export type TemplateType = typeof TEMPLATE_TYPES[keyof typeof TEMPLATE_TYPES];
