import { Board } from "../../types";

export const minimalBoard: Board = {
  title: "Test Board",
  columns: [
    {
      id: "todo",
      title: "To Do",
      tasks: [],
    },
  ],
};

export const complexBoard: Board = {
  title: "Complex Board",
  protocolVersion: "1.0",
  agent: {
    instructions: ["Test instruction"],
  },
  rules: {
    always: [{ id: 1, rule: "Always test" }],
    never: [{ id: 1, rule: "Never skip tests" }],
    prefer: [{ id: 1, rule: "Prefer simple solutions" }],
    context: [{ id: 1, rule: "Context matters" }],
  },
  statsConfig: {
    columns: ["todo", "done"],
  },
  columns: [
    {
      id: "todo",
      title: "To Do",
      tasks: [
        {
          id: "task-1",
          title: "Complete Task",
          description: "Full description",
          assignee: "alice",
          tags: ["bug", "urgent"],
          priority: "high",
          template: "bug",
          relatedFiles: ["src/app.ts"],
          subtasks: [
            { id: "sub-1", title: "Step 1", completed: true },
            { id: "sub-2", title: "Step 2", completed: false },
          ],
        },
      ],
    },
    {
      id: "done",
      title: "Done",
      tasks: [],
    },
  ],
  archive: [
    {
      id: "archived-1",
      title: "Old Task",
    },
  ],
};

export const invalidBoards = {
  noTitle: { columns: [] },
  noColumns: { title: "Test" },
  invalidPriority: {
    title: "Test",
    columns: [
      {
        id: "todo",
        title: "To Do",
        tasks: [
          {
            id: "task-1",
            title: "Task",
            priority: "super-high" as any,
          },
        ],
      },
    ],
  },
  invalidTemplate: {
    title: "Test",
    columns: [
      {
        id: "todo",
        title: "To Do",
        tasks: [
          {
            id: "task-1",
            title: "Task",
            template: "unknown" as any,
          },
        ],
      },
    ],
  },
};
