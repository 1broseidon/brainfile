import { readFileSync } from "fs";
import { join } from "path";
import { BrainfileParser } from "../parser";

const loadFixture = (name: string) =>
  readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("BrainfileParser.parse", () => {
  it("parses a minimal board", () => {
    const markdown = loadFixture("valid-simple.md");
    const board = BrainfileParser.parse(markdown);

    expect(board).not.toBeNull();
    expect(board?.title).toBe("Simple Board");
    expect(board?.columns).toHaveLength(1);
    expect(board?.columns[0].tasks[0].title).toBe("First Task");
  });

  it("parses a complex board with rules and archive", () => {
    const markdown = loadFixture("valid-complex.md");
    const board = BrainfileParser.parse(markdown);

    expect(board).not.toBeNull();
    expect(board?.rules?.always?.[0].rule).toContain("Write tests");
    expect(board?.archive?.[0].title).toBe("Old Task");
    expect(board?.columns[0].tasks[0].relatedFiles).toContain("src/utils.ts");
  });

  it("returns null for invalid YAML", () => {
    const markdown = loadFixture("invalid-yaml.md");
    const board = BrainfileParser.parse(markdown);

    expect(board).toBeNull();
  });

  it("returns null when frontmatter is not closed", () => {
    const markdown = "---\ntitle: Test Board";
    const board = BrainfileParser.parse(markdown);

    expect(board).toBeNull();
  });
});

describe("BrainfileParser.parseWithErrors", () => {
  it("returns error when frontmatter is missing", () => {
    const result = BrainfileParser.parseWithErrors("title: Missing fences");

    expect(result.board).toBeNull();
    expect(result.error).toContain("Failed to parse YAML");
  });

  it("returns board without error for valid input", () => {
    const markdown = loadFixture("valid-simple.md");
    const result = BrainfileParser.parseWithErrors(markdown);

    expect(result.error).toBeUndefined();
    expect(result.board?.columns[0].tasks[0].id).toBe("task-1");
  });
});

describe("BrainfileParser.findTaskLocation", () => {
  it("finds a task in compact format", () => {
    const markdown = loadFixture("valid-complex.md");
    const location = BrainfileParser.findTaskLocation(markdown, "task-1");

    expect(location).toEqual({ line: 30, column: 0 });
  });

  it("finds a task when the dash is on its own line", () => {
    const markdown = `---\ncolumns:\n  -\n    id: spaced-task\n    title: Spaced\n    tasks: []\n---\n`;
    const location = BrainfileParser.findTaskLocation(markdown, "spaced-task");

    expect(location).toEqual({ line: 3, column: 0 });
  });

  it("returns null for unknown task id", () => {
    const markdown = loadFixture("valid-complex.md");
    const location = BrainfileParser.findTaskLocation(markdown, "does-not-exist");

    expect(location).toBeNull();
  });
});

describe("BrainfileParser.findRuleLocation", () => {
  const markdown = loadFixture("valid-complex.md");

  it("finds rules across all rule types", () => {
    expect(BrainfileParser.findRuleLocation(markdown, 1, "always")).toEqual({ line: 11, column: 0 });
    expect(BrainfileParser.findRuleLocation(markdown, 1, "never")).toEqual({ line: 14, column: 0 });
    expect(BrainfileParser.findRuleLocation(markdown, 1, "prefer")).toEqual({ line: 17, column: 0 });
    expect(BrainfileParser.findRuleLocation(markdown, 1, "context")).toEqual({ line: 20, column: 0 });
  });

  it("returns null when the rule id is missing", () => {
    const location = BrainfileParser.findRuleLocation(markdown, 99, "always");
    expect(location).toBeNull();
  });
});
