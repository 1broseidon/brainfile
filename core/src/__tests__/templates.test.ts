import * as Templates from "../templates";

const {
  BUILT_IN_TEMPLATES,
  generateTaskId,
  generateSubtaskId,
  processTemplate,
  getTemplateById,
  getAllTemplateIds,
} = Templates;

describe("BUILT_IN_TEMPLATES", () => {
  it("exports the expected built-in templates", () => {
    expect(BUILT_IN_TEMPLATES).toHaveLength(3);
    expect(BUILT_IN_TEMPLATES.map((t) => t.id)).toEqual([
      "bug-report",
      "feature-request",
      "refactor",
    ]);
    BUILT_IN_TEMPLATES.forEach((template) => {
      expect(template.isBuiltIn).toBe(true);
      expect(template.template).toBeDefined();
    });
  });
});

describe("processTemplate", () => {
  it("substitutes variables and regenerates subtask IDs", () => {
    const bugTemplate = getTemplateById("bug-report");

    const task = processTemplate(bugTemplate!, {
      title: "Crash on Launch",
      description: "App closes immediately",
    });

    expect(task.title).toBe("Crash on Launch");
    expect(task.description).toContain("App closes immediately");
    expect(task.subtasks).toBeDefined();

    const ids = task.subtasks!.map((subtask) => subtask.id);
    expect(new Set(ids).size).toBe(task.subtasks!.length);

    bugTemplate?.template.subtasks?.forEach((original) => {
      expect(ids).not.toContain(original.id);
    });
  });
});

describe("ID helpers", () => {
  it("generates task and subtask IDs with expected shapes", () => {
    expect(generateTaskId()).toMatch(/^task-\d+-[a-z0-9]{9}$/);
    expect(generateSubtaskId("task-abc", 1)).toBe("task-abc-2");
  });
});

describe("template lookup", () => {
  it("finds templates by id and returns available ids", () => {
    expect(getTemplateById("feature-request")?.name).toBe("Feature Request");
    expect(getTemplateById("unknown" as any)).toBeUndefined();
    expect(getAllTemplateIds()).toEqual([
      "bug-report",
      "feature-request",
      "refactor",
    ]);
  });
});
