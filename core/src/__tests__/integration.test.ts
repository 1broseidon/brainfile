import { readFileSync } from "fs";
import { join } from "path";
import { Brainfile } from "../index";

const loadFixture = (name: string) =>
  readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("Brainfile integration", () => {
  it("parses, validates, and serializes a full board", () => {
    const markdown = loadFixture("valid-complex.md");
    const parsed = Brainfile.parse(markdown);

    expect(parsed?.columns[0].tasks[0].id).toBe("task-1");

    const validation = Brainfile.validate(parsed);
    expect(validation.valid).toBe(true);

    const serialized = Brainfile.serialize(parsed!);
    expect(serialized.startsWith("---\n")).toBe(true);
  });

  it("supports parseWithErrors facade", () => {
    const markdown = loadFixture("valid-simple.md");
    const result = Brainfile.parseWithErrors(markdown);

    expect(result.error).toBeUndefined();
    expect(result.board?.title).toBe("Simple Board");
  });

  it("creates tasks from templates through high-level API", () => {
    const task = Brainfile.createFromTemplate("feature-request", {
      title: "User onboarding",
      description: "First run improvements",
    });

    expect(task.title).toContain("User onboarding");
    expect(task.template).toBe("feature");
  });

  it("exposes template helpers", () => {
    const templates = Brainfile.getBuiltInTemplates();
    expect(templates).toHaveLength(3);
    expect(Brainfile.getTemplate("refactor")?.id).toBe("refactor");
  });

  it("throws when creating tasks from unknown templates", () => {
    expect(() => Brainfile.createFromTemplate("missing", {})).toThrow("Template not found");
  });

  it("finds task and rule locations through the facade", () => {
    const markdown = loadFixture("valid-complex.md");
    expect(Brainfile.findTaskLocation(markdown, "task-1")?.line).toBe(30);
    expect(Brainfile.findRuleLocation(markdown, 1, "always")?.line).toBe(11);
  });
});
