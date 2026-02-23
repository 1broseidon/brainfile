import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import * as fs from 'fs';
import * as path from 'path';
import {
  Brainfile,
  readTasksDir,
  readTaskFile,
  writeTaskFile,
  taskFileName,
  addTaskFile,
  moveTaskFile,
  completeTaskFile,
  appendLog,
  validateType,
  type Task,
} from '@brainfile/core';
import {
  BF_LIST_TOOL,
  BF_GET_TOOL,
  BF_ADD_TOOL,
  BF_PATCH_TOOL,
  BF_MOVE_TOOL,
  BF_COMPLETE_TOOL,
  BF_SUBTASK_TOOL,
  BF_LOG_TOOL,
  BF_CONTRACT_PICKUP_TOOL,
  BF_CONTRACT_DELIVER_TOOL,
  BF_CONTRACT_VALIDATE_TOOL,
  BF_ADR_PROMOTE_TOOL,
  BF_SEND_MESSAGE_TOOL,
} from './constants';
import type { LocatedTask } from './types';
import { emitMessage, isConversationalMessageKind } from './messaging';

export function registerBrainfileTools(pi: ExtensionAPI, deps: any): void {
  const {
    runtime,
    refreshBoardContext,
    readBoardConfig,
    locateTask,
    findChildTasks,
    taskSummary,
    resolveColumn,
    getColumns,
    normalizeColumnInput,
    assigneeMatches,
    makeToolResponse,
    maybeEmitDelegatedEvent,
    updateStatus,
    normalizePathInput,
    applyTaskPatch,
    ensureTaskHasContract,
    getEffectiveListenerAssignee,
    pickupContract,
    requestTaskPickupAuthorization,
    buildClaimDecisionOrchestration,
    emitEvent,
    persistState,
    buildContractContextPayload,
    deliverContractWithEvidence,
    extractRuleText,
    getNextRuleId,
    runContractValidation,
    formatValidationFeedback,
    setContractStatus,
    parseDeliverableSpecs,
    isTaskCompletable,
  } = deps;

  pi.registerTool({
    name: BF_LIST_TOOL,
    label: 'Brainfile List Tasks',
    description: 'List v2 brainfile tasks with optional filters.',
    parameters: Type.Object({
      column: Type.Optional(Type.String({ description: 'Column id or title filter' })),
      tag: Type.Optional(Type.String({ description: 'Tag filter' })),
      priority: Type.Optional(Type.String({ description: 'Priority filter' })),
      assignee: Type.Optional(Type.String({ description: 'Assignee filter' })),
      parent: Type.Optional(Type.String({ description: 'Filter by parent task/document ID' })),
      includeLogs: Type.Optional(Type.Boolean({ description: 'Include completed tasks from logs/' })),
      contractStatus: Type.Optional(Type.String({ description: 'Filter by contract status' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !runtime.boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const board = readBoardConfig();
      const includeLogs = params.includeLogs === true;
      const docs: LocatedTask[] = [];

      for (const doc of readTasksDir(runtime.boardContext.boardDir)) {
        docs.push({ task: doc.task, body: doc.body, filePath: doc.filePath || path.join(runtime.boardContext.boardDir, taskFileName(doc.task.id)), isLog: false });
      }

      if (includeLogs) {
        for (const doc of readTasksDir(runtime.boardContext.logsDir)) {
          docs.push({ task: doc.task, body: doc.body, filePath: doc.filePath || path.join(runtime.boardContext.logsDir, taskFileName(doc.task.id)), isLog: true });
        }
      }

      const filtered = docs.filter((located) => {
        if (params.column) {
          if (located.isLog) {
            const normalized = normalizeColumnInput(params.column);
            if (normalized !== 'completed' && normalized !== 'done' && normalized !== 'logs') return false;
          } else {
            const col = resolveColumn(params.column, board);
            if (!col || col.id !== located.task.column) return false;
          }
        }

        if (params.tag && !(located.task.tags || []).includes(params.tag)) return false;
        if (params.priority && located.task.priority !== params.priority) return false;
        if (params.assignee && !assigneeMatches(located.task.assignee, params.assignee)) return false;
        if (params.parent && located.task.parentId !== params.parent) return false;

        if (params.contractStatus) {
          const status = (located.task.contract as any)?.status;
          if (status !== params.contractStatus) return false;
        }

        return true;
      });

      const tasks = filtered.map((located) => taskSummary(located, board));

      return makeToolResponse({
        count: tasks.length,
        includeLogs,
        tasks,
      });
    },
  });

  pi.registerTool({
    name: BF_GET_TOOL,
    label: 'Brainfile Get Task',
    description: 'Get full details for a v2 brainfile task.',
    parameters: Type.Object({
      task: Type.String({ description: 'Task ID' }),
      includeBody: Type.Optional(Type.Boolean({ description: 'Include markdown body in result' })),
      includeLogs: Type.Optional(Type.Boolean({ description: 'Search logs/ when task not found in board/' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !runtime.boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const board = readBoardConfig();
      const includeLogs = params.includeLogs !== false;
      const located = locateTask(params.task, includeLogs);
      if (!located) {
        return makeToolResponse({ error: `Task not found: ${params.task}` }, true);
      }

      const children = findChildTasks(params.task, includeLogs).map((child) => taskSummary(child, board));
      const activeChildren = children.filter((child) => !child.isCompleted);
      const logChildren = children.filter((child) => child.isCompleted);

      const summary = taskSummary(located, board);
      return makeToolResponse({
        ...summary,
        childCount: children.length,
        activeChildCount: activeChildren.length,
        logChildCount: logChildren.length,
        children,
        ...(params.includeBody ? { body: located.body } : {}),
      });
    },
  });

  pi.registerTool({
    name: BF_ADD_TOOL,
    label: 'Brainfile Add Task',
    description: 'Add a new task file in .brainfile/board/.',
    parameters: Type.Object({
      title: Type.String({ description: 'Task title' }),
      column: Type.Optional(Type.String({ description: 'Column id or title (default: todo)' })),
      description: Type.Optional(Type.String({ description: 'Task description' })),
      priority: Type.Optional(Type.String({ description: 'Priority: low|medium|high|critical' })),
      tags: Type.Optional(Type.Array(Type.String({ description: 'Tag' }))),
      assignee: Type.Optional(Type.String({ description: 'Assignee' })),
      dueDate: Type.Optional(Type.String({ description: 'Due date YYYY-MM-DD' })),
      relatedFiles: Type.Optional(Type.Array(Type.String({ description: 'Related file path' }))),
      subtasks: Type.Optional(Type.Array(Type.String({ description: 'Subtask title' }))),
      type: Type.Optional(Type.String({ description: 'Document type (task, epic, adr, ...)' })),
      withContract: Type.Optional(Type.Boolean({ description: 'Attach a contract with status=ready' })),
      deliverables: Type.Optional(Type.Array(Type.String({ description: 'Deliverable spec type:path:description' }))),
      validationCommands: Type.Optional(Type.Array(Type.String({ description: 'Validation command' }))),
      constraints: Type.Optional(Type.Array(Type.String({ description: 'Contract constraint' }))),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !runtime.boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const board = readBoardConfig();

      if (params.type) {
        const typeValidation = validateType(board as any, params.type);
        if (!typeValidation.valid) {
          return makeToolResponse({ error: typeValidation.error }, true);
        }
      }

      const requestedColumn = params.column || 'todo';
      const resolvedColumn = resolveColumn(requestedColumn, board);
      if (!resolvedColumn) {
        return makeToolResponse({
          error: `Column not found: ${requestedColumn}`,
          availableColumns: getColumns(board).map((column) => ({ id: column.id, title: column.title })),
        }, true);
      }

      const deliverableParse = parseDeliverableSpecs(params.deliverables);
      if (deliverableParse.errors.length > 0) {
        return makeToolResponse({
          error: 'Invalid deliverables input.',
          details: deliverableParse.errors,
        }, true);
      }

      const creation = addTaskFile(
        runtime.boardContext.boardDir,
        {
          title: params.title,
          column: resolvedColumn.id,
          description: params.description,
          priority: params.priority as any,
          tags: params.tags,
          assignee: params.assignee,
          dueDate: params.dueDate,
          relatedFiles: params.relatedFiles,
          subtasks: params.subtasks,
          type: params.type,
        },
        params.description ? `## Description\n${params.description.trim()}\n` : '',
        runtime.boardContext.logsDir,
      );

      if (!creation.success || !creation.task || !creation.filePath) {
        return makeToolResponse({ error: creation.error || 'Failed to add task.' }, true);
      }

      const wantsContract =
        params.withContract === true ||
        deliverableParse.deliverables.length > 0 ||
        (params.validationCommands || []).length > 0 ||
        (params.constraints || []).length > 0;

      if (wantsContract) {
        const doc = readTaskFile(creation.filePath);
        if (!doc) {
          return makeToolResponse({
            error: 'Task created but failed to re-open file to attach contract.',
            taskId: creation.task.id,
          }, true);
        }

        const contract: any = {
          status: 'ready',
          version: 1,
          ...(deliverableParse.deliverables.length > 0 ? { deliverables: deliverableParse.deliverables } : {}),
          ...((params.validationCommands || []).length > 0
            ? { validation: { commands: params.validationCommands } }
            : {}),
          ...((params.constraints || []).length > 0 ? { constraints: params.constraints } : {}),
        };

        (doc.task as any).contract = contract;
        doc.task.updatedAt = new Date().toISOString();
        writeTaskFile(creation.filePath, doc.task, doc.body);
      }

      const located = locateTask(creation.task.id, false);
      if (located) {
        maybeEmitDelegatedEvent(located.task, ctx, 'tool:add');
        const summary = taskSummary(located, board);
        updateStatus(ctx);
        return makeToolResponse({
          success: true,
          task: summary,
        });
      }

      updateStatus(ctx);
      return makeToolResponse({
        success: true,
        taskId: creation.task.id,
      });
    },
  });

  pi.registerTool({
    name: BF_PATCH_TOOL,
    label: 'Brainfile Patch Task',
    description: 'Patch mutable fields on an active task file.',
    parameters: Type.Object({
      task: Type.String({ description: 'Task ID' }),
      title: Type.Optional(Type.String({ description: 'New title' })),
      description: Type.Optional(Type.String({ description: 'New description' })),
      clearDescription: Type.Optional(Type.Boolean({ description: 'Remove description' })),
      priority: Type.Optional(Type.String({ description: 'Priority value' })),
      clearPriority: Type.Optional(Type.Boolean({ description: 'Remove priority' })),
      tags: Type.Optional(Type.Array(Type.String({ description: 'Tag' }))),
      clearTags: Type.Optional(Type.Boolean({ description: 'Remove all tags' })),
      assignee: Type.Optional(Type.String({ description: 'Assignee' })),
      clearAssignee: Type.Optional(Type.Boolean({ description: 'Remove assignee' })),
      dueDate: Type.Optional(Type.String({ description: 'Due date YYYY-MM-DD' })),
      clearDueDate: Type.Optional(Type.Boolean({ description: 'Remove due date' })),
      relatedFiles: Type.Optional(Type.Array(Type.String({ description: 'Related file path' }))),
      clearRelatedFiles: Type.Optional(Type.Boolean({ description: 'Remove related files' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !runtime.boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const located = locateTask(params.task, false);
      if (!located) {
        return makeToolResponse({ error: `Task not found: ${params.task}` }, true);
      }

      const patched = applyTaskPatch(located, {
        title: params.title,
        description: params.description,
        clearDescription: params.clearDescription,
        priority: params.priority,
        clearPriority: params.clearPriority,
        tags: params.tags,
        clearTags: params.clearTags,
        assignee: params.assignee,
        clearAssignee: params.clearAssignee,
        dueDate: params.dueDate,
        clearDueDate: params.clearDueDate,
        relatedFiles: params.relatedFiles?.map(normalizePathInput),
        clearRelatedFiles: params.clearRelatedFiles,
      });

      writeTaskFile(located.filePath, patched.task, patched.body);

      const board = readBoardConfig();
      const updated = locateTask(params.task, false);
      if (updated) {
        maybeEmitDelegatedEvent(updated.task, ctx, 'tool:patch');
      }
      updateStatus(ctx);

      if (!updated) {
        return makeToolResponse({
          success: true,
          taskId: params.task,
        });
      }

      return makeToolResponse({
        success: true,
        task: taskSummary(updated, board),
      });
    },
  });

  pi.registerTool({
    name: BF_MOVE_TOOL,
    label: 'Brainfile Move Task',
    description: 'Move an active task to another column.',
    parameters: Type.Object({
      task: Type.String({ description: 'Task ID' }),
      column: Type.String({ description: 'Target column id or title' }),
      position: Type.Optional(Type.Number({ description: 'Optional position in target column' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !runtime.boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const board = readBoardConfig();
      const resolvedColumn = resolveColumn(params.column, board);
      if (!resolvedColumn) {
        return makeToolResponse({
          error: `Column not found: ${params.column}`,
          availableColumns: getColumns(board).map((column) => ({ id: column.id, title: column.title })),
        }, true);
      }

      const located = locateTask(params.task, false);
      if (!located) {
        return makeToolResponse({ error: `Task not found: ${params.task}` }, true);
      }

      const hasContract = Boolean(located.task.contract && typeof located.task.contract === 'object');
      const contractStatus = String((located.task.contract as any)?.status || '').toLowerCase();
      if (resolvedColumn.completionColumn && hasContract) {
        const actor = getEffectiveListenerAssignee(ctx);

        if (runtime.operatingMode !== 'pm') {
          emitEvent('message.decision', ctx, 'tool:move', {
            taskId: params.task,
            to: 'pm',
            threadId: `task:${params.task}`,
            data: {
              body: `Rejected completion move for ${params.task}: PM authority required.`,
              orchestration: {
                action: 'terminal_transition',
                decision: 'rejected',
                reasonCode: 'authority_violation',
                reasonDetails: 'Only PM sessions can complete contracted tasks.',
                authority: {
                  required: 'pm',
                  enforced: true,
                  actor,
                },
              },
            },
          });
          return makeToolResponse({
            error: 'Only PM sessions can move contracted tasks into completion columns.',
          }, true);
        }

        if (contractStatus !== 'done') {
          return makeToolResponse({
            error: `Contracted task ${params.task} must be done before completion (current: ${contractStatus || 'none'}).`,
          }, true);
        }
      }

      const moveResult = moveTaskFile(located.filePath, resolvedColumn.id, params.position);
      if (!moveResult.success) {
        return makeToolResponse({ error: moveResult.error || 'Failed to move task.' }, true);
      }

      let autoCompleted = false;
      if (resolvedColumn.completionColumn && runtime.boardContext && isTaskCompletable(located.task, board!)) {
        const movedPath = path.join(runtime.boardContext.boardDir, taskFileName(params.task));
        const completion = completeTaskFile(movedPath, runtime.boardContext.logsDir);
        autoCompleted = completion.success;
      }

      if (runtime.activeTaskId === params.task) {
        runtime.activeTaskPath = located.filePath;
      }

      if (autoCompleted) {
        emitEvent('task.completed', ctx, 'tool', {
          taskId: params.task,
          data: {
            reason: 'completion-column',
          },
        });
      }

      const updated = locateTask(params.task, autoCompleted);
      updateStatus(ctx);

      return makeToolResponse({
        success: true,
        from: located.task.column,
        to: resolvedColumn.id,
        autoCompleted,
        task: updated ? taskSummary(updated, board) : { id: params.task },
      });
    },
  });

  pi.registerTool({
    name: BF_COMPLETE_TOOL,
    label: 'Brainfile Complete Task',
    description: 'Complete an active task by moving it from board/ to logs/.',
    parameters: Type.Object({
      task: Type.String({ description: 'Task ID' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !runtime.boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const located = locateTask(params.task, false);
      if (!located) {
        return makeToolResponse({ error: `Task not found: ${params.task}` }, true);
      }

      const hasContract = Boolean(located.task.contract && typeof located.task.contract === 'object');
      const contractStatus = String((located.task.contract as any)?.status || '').toLowerCase();
      if (hasContract) {
        const actor = getEffectiveListenerAssignee(ctx);

        if (runtime.operatingMode !== 'pm') {
          emitEvent('message.decision', ctx, 'tool:complete', {
            taskId: params.task,
            to: 'pm',
            threadId: `task:${params.task}`,
            data: {
              body: `Rejected completion for ${params.task}: PM authority required.`,
              orchestration: {
                action: 'terminal_transition',
                decision: 'rejected',
                reasonCode: 'authority_violation',
                reasonDetails: 'Only PM sessions can complete contracted tasks.',
                authority: {
                  required: 'pm',
                  enforced: true,
                  actor,
                },
              },
            },
          });
          return makeToolResponse({
            error: 'Only PM sessions can complete contracted tasks.',
          }, true);
        }

        if (contractStatus !== 'done') {
          return makeToolResponse({
            error: `Contracted task ${params.task} must be done before completion (current: ${contractStatus || 'none'}).`,
          }, true);
        }
      }

      const completion = completeTaskFile(located.filePath, runtime.boardContext.logsDir);
      if (!completion.success) {
        return makeToolResponse({ error: completion.error || 'Failed to complete task.' }, true);
      }

      const completed = locateTask(params.task, true);
      if (runtime.activeTaskId === params.task && completed) {
        runtime.activeTaskPath = completed.filePath;
      }

      emitEvent('task.completed', ctx, 'tool', {
        taskId: params.task,
        data: {
          reason: 'complete-tool',
        },
      });

      const board = readBoardConfig();
      updateStatus(ctx);

      return makeToolResponse({
        success: true,
        task: completed ? taskSummary(completed, board) : { id: params.task, completed: true },
      });
    },
  });

  pi.registerTool({
    name: BF_SUBTASK_TOOL,
    label: 'Brainfile Toggle Subtask',
    description: 'Toggle (or set) a subtask completion state on an active task.',
    parameters: Type.Object({
      task: Type.String({ description: 'Task ID' }),
      subtaskId: Type.Optional(Type.String({ description: 'Subtask ID' })),
      index: Type.Optional(Type.Number({ description: '1-based subtask index' })),
      completed: Type.Optional(Type.Boolean({ description: 'Set explicit completion value' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !runtime.boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const located = locateTask(params.task, false);
      if (!located) {
        return makeToolResponse({ error: `Task not found: ${params.task}` }, true);
      }

      const subtasks = [...(located.task.subtasks || [])];
      if (subtasks.length === 0) {
        return makeToolResponse({ error: `Task ${params.task} has no subtasks.` }, true);
      }

      let subtaskIndex = -1;
      if (params.subtaskId) {
        subtaskIndex = subtasks.findIndex((subtask) => subtask.id === params.subtaskId);
      } else if (typeof params.index === 'number') {
        subtaskIndex = Math.floor(params.index) - 1;
      }

      if (subtaskIndex < 0 || subtaskIndex >= subtasks.length) {
        return makeToolResponse({
          error: 'Subtask not found. Provide subtaskId or valid 1-based index.',
          subtasks,
        }, true);
      }

      const subtask = { ...subtasks[subtaskIndex] };
      subtask.completed = typeof params.completed === 'boolean' ? params.completed : !subtask.completed;
      subtasks[subtaskIndex] = subtask;

      const updatedTask: Task = {
        ...located.task,
        subtasks,
        updatedAt: new Date().toISOString(),
      };

      writeTaskFile(located.filePath, updatedTask, located.body);

      const board = readBoardConfig();
      const updated = locateTask(params.task, false);
      updateStatus(ctx);

      return makeToolResponse({
        success: true,
        updatedSubtask: subtask,
        task: updated ? taskSummary(updated, board) : { id: params.task },
      });
    },
  });

  pi.registerTool({
    name: BF_LOG_TOOL,
    label: 'Brainfile Append Log',
    description: 'Append a timestamped log note to a task in board/ or logs/.',
    parameters: Type.Object({
      task: Type.String({ description: 'Task ID' }),
      entry: Type.String({ description: 'Log entry text' }),
      agent: Type.Optional(Type.String({ description: 'Optional agent attribution' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !runtime.boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const located = locateTask(params.task, true);
      if (!located) {
        return makeToolResponse({ error: `Task not found: ${params.task}` }, true);
      }

      const result = appendLog(located.filePath, params.entry, params.agent);
      if (!result.success) {
        return makeToolResponse({ error: result.error || 'Failed to append log.' }, true);
      }

      const board = readBoardConfig();
      const updated = locateTask(params.task, true);
      updateStatus(ctx);

      return makeToolResponse({
        success: true,
        task: updated ? taskSummary(updated, board) : { id: params.task },
      });
    },
  });

  pi.registerTool({
    name: BF_SEND_MESSAGE_TOOL,
    label: 'Brainfile Send Message',
    description: 'Send a conversational message envelope to another agent.',
    parameters: Type.Object({
      to: Type.String({ description: 'Recipient (e.g. pm, codex-2)' }),
      taskId: Type.String({ description: 'Related task ID' }),
      kind: Type.String({ description: 'message.question | message.answer | message.status | message.blocker | message.decision | message.ack' }),
      body: Type.String({ description: 'Message body' }),
      requiresAck: Type.Optional(Type.Boolean({ description: 'Whether recipient should auto-ack this message' })),
      threadId: Type.Optional(Type.String({ description: 'Optional thread ID (defaults to task:<taskId>)' })),
      inReplyTo: Type.Optional(Type.String({ description: 'Optional messageId this message replies to' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !runtime.boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const kind = String(params.kind || '').trim();
      if (!isConversationalMessageKind(kind)) {
        return makeToolResponse({
          error: `Invalid message kind: ${params.kind}`,
          allowedKinds: [
            'message.question',
            'message.answer',
            'message.status',
            'message.blocker',
            'message.decision',
            'message.ack',
          ],
        }, true);
      }

      const to = String(params.to || '').trim();
      const taskId = String(params.taskId || '').trim();
      const body = String(params.body || '').trim();

      if (!to || !taskId || !body) {
        return makeToolResponse({
          error: 'Fields to, taskId, and body are required.',
        }, true);
      }

      const assignee = getEffectiveListenerAssignee(ctx);
      const sent = emitMessage(
        runtime,
        ctx,
        emitEvent,
        kind,
        'tool:send-message',
        {
          to,
          taskId,
          body,
          requiresAck: params.requiresAck,
          ...(params.threadId ? { threadId: String(params.threadId).trim() } : {}),
          ...(params.inReplyTo ? { inReplyTo: String(params.inReplyTo).trim() } : {}),
          assignee,
        }
      );

      return makeToolResponse({
        success: true,
        message: sent,
      });
    },
  });

  pi.registerTool({
    name: BF_CONTRACT_PICKUP_TOOL,
    label: 'Brainfile Contract Pickup',
    description: 'Set task contract status to in_progress and return contract context.',
    parameters: Type.Object({
      task: Type.String({ description: 'Task ID' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !runtime.boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const located = locateTask(params.task, false);
      if (!located) {
        return makeToolResponse({ error: `Task not found: ${params.task}` }, true);
      }

      const contractResult = ensureTaskHasContract(located.task);
      if (!contractResult.ok) {
        return makeToolResponse({ error: contractResult.error }, true);
      }

      const assignee = getEffectiveListenerAssignee(ctx);
      const decision = requestTaskPickupAuthorization(runtime, ctx, located, assignee, 'tool');
      if (!decision.accepted || !decision.lease) {
        return makeToolResponse({
          error:
            decision.reasonDetails ||
            (decision.reasonCode
              ? `Claim rejected (${decision.reasonCode}).`
              : 'Claim rejected by scheduler.'),
          decision,
        }, true);
      }

      const pickup = pickupContract(located, assignee, 'tool', runtime, decision.lease);
      if (!pickup.ok) {
        return makeToolResponse({ error: pickup.error }, true);
      }

      runtime.activeTaskId = pickup.task.task.id;
      runtime.activeTaskPath = pickup.task.filePath;
      emitEvent('contract.picked_up', ctx, 'tool', {
        taskId: pickup.task.task.id,
        assignee,
        data: {
          status: 'in_progress',
          orchestration: buildClaimDecisionOrchestration(decision),
        },
      });
      persistState();
      updateStatus(ctx);

      return makeToolResponse({
        success: true,
        alreadyInProgress: pickup.alreadyInProgress === true,
        context: buildContractContextPayload(pickup.task),
      });
    },
  });

  pi.registerTool({
    name: BF_CONTRACT_DELIVER_TOOL,
    label: 'Brainfile Contract Deliver',
    description: 'Set task contract status to delivered.',
    parameters: Type.Object({
      task: Type.String({ description: 'Task ID' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !runtime.boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const located = locateTask(params.task, false);
      if (!located) {
        return makeToolResponse({ error: `Task not found: ${params.task}` }, true);
      }

      const contractResult = ensureTaskHasContract(located.task);
      if (!contractResult.ok) {
        return makeToolResponse({ error: contractResult.error }, true);
      }

      const assignee = getEffectiveListenerAssignee(ctx);
      const delivery = deliverContractWithEvidence(located, assignee, 'tool');
      if (!delivery.ok) {
        return makeToolResponse({
          error: delivery.error,
          deliverableChecks: delivery.deliverableChecks || [],
        }, true);
      }

      emitEvent('contract.delivered', ctx, 'tool', {
        taskId: params.task,
        assignee,
        data: {
          selfCheckFailures: delivery.commandResults.filter((result) => result.exitCode !== 0).length,
        },
      });
      updateStatus(ctx);

      return makeToolResponse({
        success: true,
        context: buildContractContextPayload(delivery.task),
        deliveryEvidence: {
          deliverableChecks: delivery.deliverableChecks,
          selfCheck: delivery.commandResults,
          metrics: delivery.evidence,
        },
      });
    },
  });

  pi.registerTool({
    name: BF_ADR_PROMOTE_TOOL,
    label: 'Brainfile ADR Promote',
    description: 'Promote an ADR to a board rule. Extracts the rule text from the ADR title, appends it to rules.<category> in the board frontmatter, and moves the ADR to logs/ with status: promoted.',
    parameters: Type.Object({
      task: Type.String({ description: 'ADR task ID (must have type: adr)' }),
      category: Type.String({ description: 'Rule category: prefer | always | never | context' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !runtime.boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const VALID_CATEGORIES = ['prefer', 'always', 'never', 'context'];
      const category = params.category.trim().toLowerCase();
      if (!VALID_CATEGORIES.includes(category)) {
        return makeToolResponse({ error: `Invalid category: ${params.category}. Valid: ${VALID_CATEGORIES.join(', ')}` }, true);
      }

      const located = locateTask(params.task, false);
      if (!located) {
        return makeToolResponse({ error: `Task not found: ${params.task}` }, true);
      }

      if ((located.task.type || '').toLowerCase() !== 'adr') {
        return makeToolResponse({ error: `Only ADRs can be promoted. ${params.task} has type "${located.task.type || 'task'}".` }, true);
      }

      const content = fs.readFileSync(runtime.boardContext.brainfilePath, 'utf-8');
      const parsed = Brainfile.parseWithErrors(content);
      if (!parsed.board) {
        return makeToolResponse({ error: 'Failed to parse board config.' }, true);
      }
      const board = parsed.board as any;

      const ruleText = extractRuleText(located.task.title);
      const ruleId = getNextRuleId(board.rules);
      const newRule = { id: ruleId, rule: ruleText, source: located.task.id };

      if (!board.rules || typeof board.rules !== 'object' || Array.isArray(board.rules)) {
        board.rules = {};
      }
      const existing: unknown[] = Array.isArray(board.rules[category]) ? board.rules[category] : [];
      board.rules[category] = [...existing, newRule];
      fs.writeFileSync(runtime.boardContext.brainfilePath, Brainfile.serialize(board), 'utf-8');

      const completedAt = new Date().toISOString();
      const promotedTask: Task = { ...located.task, completedAt } as any;
      (promotedTask as any).status = 'promoted';
      delete promotedTask.column;
      delete (promotedTask as any).position;

      fs.mkdirSync(runtime.boardContext.logsDir, { recursive: true });
      const logPath = path.join(runtime.boardContext.logsDir, taskFileName(located.task.id));
      writeTaskFile(logPath, promotedTask, located.body);
      fs.unlinkSync(located.filePath);

      if (runtime.activeTaskId === params.task) {
        runtime.activeTaskId = null;
        runtime.activeTaskPath = null;
      }

      emitEvent('task.completed', ctx, 'tool', {
        taskId: params.task,
        data: {
          reason: 'adr-promoted',
        },
      });

      updateStatus(ctx);

      return makeToolResponse({
        success: true,
        taskId: params.task,
        category,
        rule: newRule,
        completedAt,
      });
    },
  });

  pi.registerTool({
    name: BF_CONTRACT_VALIDATE_TOOL,
    label: 'Brainfile Contract Validate',
    description: 'Validate contract deliverables and commands, then set status done or failed.',
    parameters: Type.Object({
      task: Type.String({ description: 'Task ID' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !runtime.boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const located = locateTask(params.task, false);
      if (!located) {
        return makeToolResponse({ error: `Task not found: ${params.task}` }, true);
      }

      const contractResult = ensureTaskHasContract(located.task);
      if (!contractResult.ok) {
        return makeToolResponse({ error: contractResult.error }, true);
      }

      if (runtime.operatingMode !== 'pm') {
        // Security/authority guard: contract validation transitions ownership-critical
        // statuses (done/failed) and must only be executed by PM sessions.
        return makeToolResponse({
          error: 'Only PM sessions can run contract.validate. Switch to PM mode or delegate this step to PM.',
        }, true);
      }

      const validation = runContractValidation(located);
      if (!('ok' in validation)) {
        return makeToolResponse({ error: validation.error }, true);
      }

      const feedback = validation.ok ? undefined : formatValidationFeedback(validation);
      const updated = setContractStatus(
        located,
        validation.ok ? 'done' : 'failed',
        validation.ok
          ? { runtime }
          : {
              runtime,
              feedback,
            }
      );
      emitEvent('contract.validated', ctx, 'tool', {
        taskId: params.task,
        data: {
          result: validation.ok ? 'done' : 'failed',
        },
      });
      updateStatus(ctx);

      return makeToolResponse({
        success: validation.ok,
        context: buildContractContextPayload(updated),
        validation: {
          deliverableChecks: validation.deliverableChecks,
          commandResults: validation.commandResults,
        },
      }, !validation.ok);
    },
  });
}
