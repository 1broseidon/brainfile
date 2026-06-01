import { BrainfileValidator } from "../validator";
import { complexBoard, invalidBoards, minimalBoard } from "./fixtures/test-boards";

describe("BrainfileValidator.validate", () => {
  it("passes for a minimal valid board", () => {
    const result = BrainfileValidator.validate(minimalBoard);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns an error when board is null", () => {
    const result = BrainfileValidator.validate(null as any);

    expect(result.valid).toBe(false);
    expect(result.errors[0].path).toBe("");
  });

  it("fails when required top-level fields are missing", () => {
    const missingTitle = BrainfileValidator.validate(invalidBoards.noTitle);
    const missingColumns = BrainfileValidator.validate(invalidBoards.noColumns);

    expect(missingTitle.valid).toBe(false);
    expect(missingTitle.errors[0].path).toBe("title");

    expect(missingColumns.valid).toBe(false);
    expect(missingColumns.errors[0].path).toBe("columns");
  });

  it("validates tasks for priority and template enums", () => {
    const priorityResult = BrainfileValidator.validate(invalidBoards.invalidPriority);
    const templateResult = BrainfileValidator.validate(invalidBoards.invalidTemplate);

    expect(priorityResult.errors.find((e) => e.path.includes("priority"))).toBeDefined();
    expect(templateResult.errors.find((e) => e.path.includes("template"))).toBeDefined();
  });

  it("validates nested structures including archive and rules", () => {
    const result = BrainfileValidator.validate({
      ...complexBoard,
      archive: "not-an-array" as any,
      statsConfig: { columns: ["todo", "doing", "done", "qa", "icebox"] },
    });

    const archiveError = result.errors.find((e) => e.path === "archive");
    const statsError = result.errors.find((e) => e.path === "statsConfig.columns");

    expect(result.valid).toBe(false);
    expect(archiveError).toBeDefined();
    expect(statsError).toBeDefined();
  });

  it("validates statsConfig shape when columns is not an array", () => {
    const result = BrainfileValidator.validate({
      title: "Board with bad stats",
      columns: [],
      statsConfig: { columns: "todo" as any },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.find((e) => e.path === "statsConfig.columns")).toBeDefined();
  });

  it("validates rules collections and entries", () => {
    const result = BrainfileValidator.validate({
      title: "Rules board",
      columns: [],
      rules: {
        always: "not-array" as any,
        never: [{ id: "one" as any, rule: "" }],
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "rules.always" }),
        expect.objectContaining({ path: "rules.never[0].id" }),
        expect.objectContaining({ path: "rules.never[0].rule" }),
      ])
    );
  });

  it("collects errors for malformed nested structures", () => {
    const result = BrainfileValidator.validate({
      title: "Broken board",
      columns: [
        null,
        { id: " ", title: "", tasks: "invalid" },
        {
          id: "col-1",
          title: "Column",
          tasks: [
            {
              id: "",
              title: "",
              tags: "nope" as any,
              relatedFiles: "bad" as any,
              subtasks: [null],
            },
          ],
        },
      ],
      statsConfig: "invalid" as any,
    });

    const paths = result.errors.map((e) => e.path);
    expect(result.valid).toBe(false);
    expect(paths).toEqual(
      expect.arrayContaining([
        "columns[0]",
        "columns[1].id",
        "columns[1].title",
        "columns[1].tasks",
        "columns[2].tasks[0].id",
        "columns[2].tasks[0].title",
        "columns[2].tasks[0].tags",
        "columns[2].tasks[0].relatedFiles",
        "columns[2].tasks[0].subtasks[0]",
        "statsConfig",
      ])
    );
  });

  it("reports path details for invalid subtasks", () => {
    const result = BrainfileValidator.validate({
      ...minimalBoard,
      columns: [
        {
          id: "todo",
          title: "To Do",
          tasks: [
            {
              id: "task-1",
              title: "Task",
              subtasks: [{ id: "", title: "", completed: "not-boolean" as any }],
            },
          ],
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.path)).toEqual([
      "columns[0].tasks[0].subtasks[0].id",
      "columns[0].tasks[0].subtasks[0].title",
      "columns[0].tasks[0].subtasks[0].completed",
    ]);
  });
});
