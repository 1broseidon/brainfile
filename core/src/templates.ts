/**
 * Task template system for creating structured tasks from predefined templates
 * @packageDocumentation
 */

import { TaskTemplate, TEMPLATE_TYPES, Task } from './types';

// Built-in task templates
export const BUILT_IN_TEMPLATES: TaskTemplate[] = [
  {
    id: 'bug-report',
    name: 'Bug Report',
    description: 'Template for reporting bugs and issues',
    isBuiltIn: true,
    template: {
      title: '{title}',
      description: '## Bug Description\n{description}\n\n## Steps to Reproduce\n1. \n2. \n3. \n\n## Expected Behavior\n\n## Actual Behavior\n\n## Environment\n- OS: \n- Version: ',
      template: 'bug' as const,
      priority: 'high',
      tags: ['bug', 'needs-triage'],
      subtasks: [
        {
          id: 'bug-1',
          title: 'Reproduce the issue',
          completed: false
        },
        {
          id: 'bug-2',
          title: 'Identify root cause',
          completed: false
        },
        {
          id: 'bug-3',
          title: 'Implement fix',
          completed: false
        },
        {
          id: 'bug-4',
          title: 'Write tests',
          completed: false
        },
        {
          id: 'bug-5',
          title: 'Verify fix in production',
          completed: false
        }
      ]
    },
    variables: [
      {
        name: 'title',
        description: 'Brief bug title',
        required: true
      },
      {
        name: 'description',
        description: 'Detailed bug description',
        required: true
      }
    ]
  },
  {
    id: 'feature-request',
    name: 'Feature Request',
    description: 'Template for proposing new features',
    isBuiltIn: true,
    template: {
      title: '{title}',
      description: '## Feature Description\n{description}\n\n## Use Cases\n- \n- \n\n## Proposed Implementation\n\n## Acceptance Criteria\n- [ ] \n- [ ] ',
      template: 'feature' as const,
      priority: 'medium',
      tags: ['feature', 'enhancement'],
      subtasks: [
        {
          id: 'feature-1',
          title: 'Design specification',
          completed: false
        },
        {
          id: 'feature-2',
          title: 'Implement core functionality',
          completed: false
        },
        {
          id: 'feature-3',
          title: 'Add unit tests',
          completed: false
        },
        {
          id: 'feature-4',
          title: 'Add integration tests',
          completed: false
        },
        {
          id: 'feature-5',
          title: 'Update documentation',
          completed: false
        },
        {
          id: 'feature-6',
          title: 'Code review',
          completed: false
        }
      ]
    },
    variables: [
      {
        name: 'title',
        description: 'Feature title',
        required: true
      },
      {
        name: 'description',
        description: 'Feature description and rationale',
        required: true
      }
    ]
  },
  {
    id: 'refactor',
    name: 'Code Refactor',
    description: 'Template for code refactoring tasks',
    isBuiltIn: true,
    template: {
      title: 'Refactor: {area}',
      description: '## Refactoring Scope\n{description}\n\n## Motivation\n- \n\n## Changes\n- [ ] \n- [ ] \n\n## Testing Plan\n',
      template: 'refactor' as const,
      priority: 'low',
      tags: ['refactor', 'technical-debt'],
      subtasks: [
        {
          id: 'refactor-1',
          title: 'Analyze current implementation',
          completed: false
        },
        {
          id: 'refactor-2',
          title: 'Design new structure',
          completed: false
        },
        {
          id: 'refactor-3',
          title: 'Implement refactoring',
          completed: false
        },
        {
          id: 'refactor-4',
          title: 'Update/add tests',
          completed: false
        },
        {
          id: 'refactor-5',
          title: 'Update documentation',
          completed: false
        },
        {
          id: 'refactor-6',
          title: 'Performance testing',
          completed: false
        }
      ]
    },
    variables: [
      {
        name: 'area',
        description: 'Area or component to refactor',
        required: true
      },
      {
        name: 'description',
        description: 'Details about what needs refactoring',
        required: true
      }
    ]
  }
];

/**
 * Generate a unique task ID
 * @returns A unique task ID string
 */
export function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a subtask ID based on parent task ID
 * @param parentId - The parent task ID
 * @param index - The index of the subtask
 * @returns A subtask ID string
 */
export function generateSubtaskId(parentId: string, index: number): string {
  return `${parentId}-${index + 1}`;
}

/**
 * Process a template and substitute variable values
 * @param template - The template to process
 * @param values - Variable values to substitute
 * @returns A partial Task object with substituted values
 */
export function processTemplate(template: TaskTemplate, values: Record<string, string>): Partial<Task> {
  const processedTask = JSON.parse(JSON.stringify(template.template));

  // Process title
  if (processedTask.title) {
    processedTask.title = substituteVariables(processedTask.title, values);
  }

  // Process description
  if (processedTask.description) {
    processedTask.description = substituteVariables(processedTask.description, values);
  }

  // Generate new IDs for subtasks to avoid duplicates
  if (processedTask.subtasks) {
    const newTaskId = generateTaskId();
    processedTask.subtasks = processedTask.subtasks.map((subtask: any, index: number) => ({
      ...subtask,
      id: generateSubtaskId(newTaskId, index)
    }));
  }

  return processedTask;
}

/**
 * Substitute variables in a template string
 * @param text - The text containing variable placeholders
 * @param values - Variable values to substitute
 * @returns Text with substituted values
 */
function substituteVariables(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match, variable) => {
    return values[variable] || match;
  });
}

/**
 * Get a template by ID
 * @param id - The template ID
 * @returns The template or undefined if not found
 */
export function getTemplateById(id: string): TaskTemplate | undefined {
  return BUILT_IN_TEMPLATES.find(t => t.id === id);
}

/**
 * Get all template IDs
 * @returns Array of template IDs
 */
export function getAllTemplateIds(): string[] {
  return BUILT_IN_TEMPLATES.map(t => t.id);
}
