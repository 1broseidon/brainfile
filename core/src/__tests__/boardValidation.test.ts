import { getBoardTypes, validateColumn, validateType } from "../boardValidation";
import type { BoardConfig } from "../types";

function createBoard(overrides: Partial<BoardConfig> = {}): BoardConfig {
  return {
    title: "Test Board",
    columns: [
      { id: "todo", title: "To Do" },
      { id: "done", title: "Done" },
    ],
    ...overrides,
  };
}

describe("boardValidation", () => {
  describe("validateType", () => {
    it("accepts any type when non-strict", () => {
      const board = createBoard({
        strict: false,
        types: { epic: { idPrefix: "epic" } },
      });

      expect(validateType(board, "anything")).toEqual({ valid: true });
    });

    it("accepts defined types and rejects undefined types in strict mode", () => {
      const board = createBoard({
        strict: true,
        types: {
          epic: { idPrefix: "epic" },
          bug: { idPrefix: "bug" },
        },
      });

      expect(validateType(board, "epic")).toEqual({ valid: true });

      const result = validateType(board, "feature");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Type 'feature' is not defined.");
      expect(result.error).toContain("Available types: task, epic, bug");
    });

    it("always accepts 'task' in strict mode", () => {
      const board = createBoard({
        strict: true,
        types: { epic: { idPrefix: "epic" } },
      });

      expect(validateType(board, "task")).toEqual({ valid: true });
    });
  });

  describe("validateColumn", () => {
    it("accepts any column when non-strict", () => {
      const board = createBoard({ strict: false });
      expect(validateColumn(board, "backlog")).toEqual({ valid: true });
    });

    it("accepts defined columns and rejects undefined columns in strict mode", () => {
      const board = createBoard({ strict: true });

      expect(validateColumn(board, "todo")).toEqual({ valid: true });

      const result = validateColumn(board, "backlog");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Column 'backlog' is not defined.");
      expect(result.error).toContain("Available columns: todo, done");
    });
  });

  describe("getBoardTypes", () => {
    it("returns an empty object when board.types is not defined", () => {
      const board = createBoard({ strict: true });
      expect(getBoardTypes(board)).toEqual({});
    });
  });
});
