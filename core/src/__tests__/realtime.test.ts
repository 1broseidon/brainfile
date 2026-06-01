import { BrainfileSerializer } from "../serializer";
import {
  diffBoards,
  hashBoard,
  hashBoardContent
} from "../realtime";
import { Board } from "../types";
import { complexBoard, minimalBoard } from "./fixtures/test-boards";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe("realtime helpers", () => {
  test("hashBoardContent is stable and distinct for different content", () => {
    const content = BrainfileSerializer.serialize(minimalBoard);
    const first = hashBoardContent(content);
    const second = hashBoardContent(content);
    const different = hashBoardContent(content + " ");

    expect(first).toEqual(second);
    expect(first).not.toEqual(different);
  });

  test("hashBoard matches serialized content hash", () => {
    const board = clone(minimalBoard);
    const serialized = BrainfileSerializer.serialize(board);

    expect(hashBoard(board)).toEqual(hashBoardContent(serialized));
  });

  test("detects metadata change and column additions", () => {
    const prev: Board = clone(minimalBoard);
    const next: Board = clone(minimalBoard);
    next.title = "Updated Title";
    next.columns.push({ id: "done", title: "Done", tasks: [] });

    const diff = diffBoards(prev, next);

    expect(diff.metadataChanged).toBe(true);
    expect(diff.columnsAdded).toHaveLength(1);
    expect(diff.columnsAdded[0]).toMatchObject({ columnId: "done", toIndex: 1 });
    expect(diff.columnsRemoved).toHaveLength(0);
  });

  test("detects task add and field update", () => {
    const prev: Board = clone(complexBoard);
    const next: Board = clone(complexBoard);

    // add
    next.columns[0].tasks.push({
      id: "task-2",
      title: "New Task",
      description: "fresh"
    });

    // update existing
    next.columns[0].tasks[0].title = "Updated Task Title";

    const diff = diffBoards(prev, next);

    expect(diff.tasksAdded).toHaveLength(1);
    expect(diff.tasksAdded[0]).toMatchObject({
      taskId: "task-2",
      toColumnId: "todo",
      toIndex: 1
    });

    expect(diff.tasksUpdated).toHaveLength(1);
    expect(diff.tasksUpdated[0].taskId).toBe("task-1");
    expect(diff.tasksUpdated[0].changedFields).toContain("title");
  });

  test("detects task moves between columns", () => {
    const prev: Board = clone(complexBoard);
    const next: Board = clone(complexBoard);

    const movedTask = next.columns[0].tasks.shift();
    if (!movedTask) {
      throw new Error("Expected task in fixture");
    }
    next.columns[1].tasks.push(movedTask);

    const diff = diffBoards(prev, next);

    expect(diff.tasksMoved).toHaveLength(1);
    expect(diff.tasksMoved[0]).toMatchObject({
      taskId: "task-1",
      fromColumnId: "todo",
      toColumnId: "done",
      fromIndex: 0,
      toIndex: 0
    });
    expect(diff.tasksAdded).toHaveLength(0);
    expect(diff.tasksRemoved).toHaveLength(0);
  });

  test("detects column reordering", () => {
    const prev: Board = clone(complexBoard);
    const next: Board = clone(complexBoard);
    next.columns = [...next.columns].reverse();

    const diff = diffBoards(prev, next);

    const todoMove = diff.columnsMoved.find((c) => c.columnId === "todo");
    const doneMove = diff.columnsMoved.find((c) => c.columnId === "done");
    expect(todoMove).toBeDefined();
    expect(doneMove).toBeDefined();
    expect(todoMove?.fromIndex).toBe(0);
    expect(todoMove?.toIndex).toBe(1);
    expect(doneMove?.fromIndex).toBe(1);
    expect(doneMove?.toIndex).toBe(0);
  });
});
