import { describe, it, expect } from '@jest/globals';
import {
  formatTaskForGitHub,
  formatTaskForLinear,
  type GitHubIssuePayload,
  type LinearIssuePayload,
} from '../formatters';
import type { Task } from '../types/base';

describe('formatTaskForGitHub', () => {
  const baseTask: Task = {
    id: 'task-1',
    title: 'Implement user authentication',
    description: 'Add JWT-based authentication with refresh tokens',
    priority: 'high',
    tags: ['backend', 'security'],
    assignee: 'alice',
    dueDate: '2025-02-01',
    relatedFiles: ['src/auth/middleware.ts', 'src/routes/login.ts'],
    subtasks: [
      { id: 'task-1-1', title: 'Create auth middleware', completed: true },
      { id: 'task-1-2', title: 'Add login endpoint', completed: true },
      { id: 'task-1-3', title: 'Add refresh token rotation', completed: false },
    ],
  };

  it('should format basic task with default options', () => {
    const payload = formatTaskForGitHub(baseTask);

    expect(payload.title).toBe('[task-1] Implement user authentication');
    expect(payload.state).toBe('closed');
    expect(payload.labels).toContain('backend');
    expect(payload.labels).toContain('security');
    expect(payload.labels).toContain('priority:high');
  });

  it('should include description in body', () => {
    const payload = formatTaskForGitHub(baseTask);

    expect(payload.body).toContain('Add JWT-based authentication with refresh tokens');
  });

  it('should format subtasks as checklist', () => {
    const payload = formatTaskForGitHub(baseTask);

    expect(payload.body).toContain('## Subtasks');
    expect(payload.body).toContain('- [x] Create auth middleware');
    expect(payload.body).toContain('- [x] Add login endpoint');
    expect(payload.body).toContain('- [ ] Add refresh token rotation');
  });

  it('should include metadata section', () => {
    const payload = formatTaskForGitHub(baseTask, {
      boardTitle: 'My Project',
      fromColumn: 'Done',
    });

    expect(payload.body).toContain('## Details');
    expect(payload.body).toContain('**Board:** My Project');
    expect(payload.body).toContain('**Column:** Done');
    expect(payload.body).toContain('**Priority:** high');
    expect(payload.body).toContain('**Assignee:** alice');
    expect(payload.body).toContain('**Due Date:** 2025-02-01');
  });

  it('should include related files section', () => {
    const payload = formatTaskForGitHub(baseTask);

    expect(payload.body).toContain('## Related Files');
    expect(payload.body).toContain('`src/auth/middleware.ts`');
    expect(payload.body).toContain('`src/routes/login.ts`');
  });

  it('should include resolution info when provided', () => {
    const payload = formatTaskForGitHub(baseTask, {
      resolvedBy: 'abc123',
      resolvedByPR: '#42',
    });

    expect(payload.body).toContain('## Resolution');
    expect(payload.body).toContain('**Pull Request:** #42');
    expect(payload.body).toContain('**Commit:** abc123');
  });

  it('should include footer', () => {
    const payload = formatTaskForGitHub(baseTask);

    expect(payload.body).toContain('*Archived from brainfile.md*');
  });

  it('should add extra labels', () => {
    const payload = formatTaskForGitHub(baseTask, {
      extraLabels: ['archived', 'brainfile'],
    });

    expect(payload.labels).toContain('archived');
    expect(payload.labels).toContain('brainfile');
  });

  it('should add template type as label', () => {
    const taskWithTemplate: Task = {
      ...baseTask,
      template: 'bug',
    };
    const payload = formatTaskForGitHub(taskWithTemplate);

    expect(payload.labels).toContain('bug');
  });

  it('should omit task ID from title when includeTaskId is false', () => {
    const payload = formatTaskForGitHub(baseTask, {
      includeTaskId: false,
    });

    expect(payload.title).toBe('Implement user authentication');
  });

  it('should handle minimal task', () => {
    const minimalTask: Task = {
      id: 'task-2',
      title: 'Simple task',
    };
    const payload = formatTaskForGitHub(minimalTask);

    expect(payload.title).toBe('[task-2] Simple task');
    expect(payload.body).toContain('*Archived from brainfile.md*');
    expect(payload.state).toBe('closed');
    expect(payload.labels).toBeUndefined();
  });

  it('should exclude sections when options are false', () => {
    const payload = formatTaskForGitHub(baseTask, {
      includeMeta: false,
      includeSubtasks: false,
      includeRelatedFiles: false,
    });

    expect(payload.body).not.toContain('## Details');
    expect(payload.body).not.toContain('## Subtasks');
    expect(payload.body).not.toContain('## Related Files');
  });
});

describe('formatTaskForLinear', () => {
  const baseTask: Task = {
    id: 'task-1',
    title: 'Implement user authentication',
    description: 'Add JWT-based authentication with refresh tokens',
    priority: 'high',
    tags: ['backend', 'security'],
    assignee: 'alice',
    subtasks: [
      { id: 'task-1-1', title: 'Create auth middleware', completed: true },
      { id: 'task-1-2', title: 'Add login endpoint', completed: false },
    ],
  };

  it('should format basic task with default options', () => {
    const payload = formatTaskForLinear(baseTask);

    // Linear doesn't include task ID by default
    expect(payload.title).toBe('Implement user authentication');
    expect(payload.stateName).toBe('Done');
    expect(payload.labelNames).toContain('backend');
    expect(payload.labelNames).toContain('security');
  });

  it('should map priority correctly', () => {
    const critical: Task = { ...baseTask, priority: 'critical' };
    const high: Task = { ...baseTask, priority: 'high' };
    const medium: Task = { ...baseTask, priority: 'medium' };
    const low: Task = { ...baseTask, priority: 'low' };
    const none: Task = { ...baseTask, priority: undefined };

    expect(formatTaskForLinear(critical).priority).toBe(1);
    expect(formatTaskForLinear(high).priority).toBe(2);
    expect(formatTaskForLinear(medium).priority).toBe(3);
    expect(formatTaskForLinear(low).priority).toBe(4);
    expect(formatTaskForLinear(none).priority).toBeUndefined();
  });

  it('should include description', () => {
    const payload = formatTaskForLinear(baseTask);

    expect(payload.description).toContain('Add JWT-based authentication with refresh tokens');
  });

  it('should format subtasks as checklist', () => {
    const payload = formatTaskForLinear(baseTask);

    expect(payload.description).toContain('## Subtasks');
    expect(payload.description).toContain('- [x] Create auth middleware');
    expect(payload.description).toContain('- [ ] Add login endpoint');
  });

  it('should include task ID when includeTaskId is true', () => {
    const payload = formatTaskForLinear(baseTask, {
      includeTaskId: true,
    });

    expect(payload.title).toBe('[task-1] Implement user authentication');
  });

  it('should use custom stateName', () => {
    const payload = formatTaskForLinear(baseTask, {
      stateName: 'Canceled',
    });

    expect(payload.stateName).toBe('Canceled');
  });

  it('should handle task with no tags', () => {
    const taskNoTags: Task = {
      id: 'task-2',
      title: 'Simple task',
    };
    const payload = formatTaskForLinear(taskNoTags);

    expect(payload.labelNames).toBeUndefined();
  });

  it('should include metadata section', () => {
    const payload = formatTaskForLinear(baseTask, {
      boardTitle: 'Sprint Board',
      fromColumn: 'Done',
    });

    expect(payload.description).toContain('## Details');
    expect(payload.description).toContain('**Board:** Sprint Board');
    expect(payload.description).toContain('**Column:** Done');
  });

  it('should include footer', () => {
    const payload = formatTaskForLinear(baseTask);

    expect(payload.description).toContain('*Archived from brainfile.md*');
  });
});
