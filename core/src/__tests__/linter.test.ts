import { BrainfileLinter } from "../linter";

describe("BrainfileLinter", () => {
  describe("lint - valid files", () => {
    it("returns no issues for a valid brainfile", () => {
      const content = `---
title: Valid Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: My Task
        priority: high
---
`;

      const result = BrainfileLinter.lint(content);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.board).toBeDefined();
      expect(result.board?.title).toBe("Valid Board");
    });

    it("handles empty task lists", () => {
      const content = `---
title: Empty Board
columns:
  - id: todo
    title: To Do
    tasks: []
---
`;

      const result = BrainfileLinter.lint(content);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe("lint - YAML syntax errors", () => {
    it("detects missing frontmatter opening", () => {
      const content = `title: No Frontmatter
columns:
  - id: todo
---
`;

      const result = BrainfileLinter.lint(content);

      expect(result.valid).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].type).toBe("error");
      expect(result.issues[0].code).toBe("MISSING_FRONTMATTER_START");
      expect(result.issues[0].line).toBe(1);
    });

    it("detects missing frontmatter closing", () => {
      const content = `---
title: No Closing
columns:
  - id: todo
`;

      const result = BrainfileLinter.lint(content);

      expect(result.valid).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].type).toBe("error");
      expect(result.issues[0].code).toBe("MISSING_FRONTMATTER_END");
    });

    it("detects YAML syntax errors with line numbers", () => {
      const content = `---
title: Broken Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Task
        description: "Unclosed quote
---
`;

      const result = BrainfileLinter.lint(content);

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0].type).toBe("error");
      expect(result.issues[0].code).toBe("YAML_SYNTAX_ERROR");
      expect(result.issues[0].line).toBeDefined();
    });

    it("detects incorrect indentation", () => {
      const content = `---
title: Bad Indentation
columns:
- id: todo
  title: To Do
tasks:
    - id: task-1
---
`;

      const result = BrainfileLinter.lint(content);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.type === "error")).toBe(true);
    });
  });

  describe("lint - fixable issues", () => {
    it("detects unquoted strings with colons", () => {
      const content = `---
title: Board with Unquoted Strings
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Bug: Login not working
---
`;

      const result = BrainfileLinter.lint(content);

      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0].type).toBe("warning");
      expect(result.issues[0].code).toBe("UNQUOTED_STRING");
      expect(result.issues[0].fixable).toBe(true);
      expect(result.issues[0].message).toContain("Bug: Login not working");
    });

    it("auto-fixes unquoted strings when autoFix is true", () => {
      const content = `---
title: Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Bug: Login not working
---
`;

      const result = BrainfileLinter.lint(content, { autoFix: true });

      expect(result.fixedContent).toBeDefined();
      expect(result.fixedContent).toContain('title: "Bug: Login not working"');
      
      // Verify the fixed content is valid
      const recheck = BrainfileLinter.lint(result.fixedContent!);
      expect(recheck.valid).toBe(true);
    });

    it("fixes multiple unquoted strings", () => {
      const content = `---
title: Multiple Issues
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Bug: First issue
      - id: task-2
        title: Feature: Second issue
---
`;

      const result = BrainfileLinter.lint(content, { autoFix: true });

      expect(result.fixedContent).toBeDefined();
      expect(result.fixedContent).toContain('title: "Bug: First issue"');
      expect(result.fixedContent).toContain('title: "Feature: Second issue"');
    });

    it("doesn't double-quote already quoted strings", () => {
      const content = `---
title: Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: "Already: Quoted"
---
`;

      const result = BrainfileLinter.lint(content, { autoFix: true });

      expect(result.valid).toBe(true);
      expect(result.fixedContent).toBeUndefined(); // No fixes needed
    });
  });

  describe("lint - validation errors", () => {
    it("detects invalid priority values", () => {
      const content = `---
title: Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Task
        priority: urgent
---
`;

      const result = BrainfileLinter.lint(content);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => 
        i.type === "error" && i.code === "VALIDATION_ERROR"
      )).toBe(true);
    });

    it("detects missing required fields", () => {
      const content = `---
title: Board
columns:
  - id: todo
    tasks:
      - id: task-1
        title: Task
---
`;

      const result = BrainfileLinter.lint(content);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => 
        i.message.includes("title must be a non-empty string")
      )).toBe(true);
    });
  });

  describe("lint - duplicate columns", () => {
    it("warns about duplicate column IDs", () => {
      const content = `---
title: Board with Duplicates
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: First
  - id: todo
    title: To Do Again
    tasks:
      - id: task-2
        title: Second
---
`;

      const result = BrainfileLinter.lint(content);

      expect(result.issues.some(i => 
        i.type === "warning" && i.code === "DUPLICATE_COLUMN"
      )).toBe(true);
      
      // Should still be valid (warnings don't fail in non-strict mode)
      expect(result.valid).toBe(true);
    });

    it("treats warnings as errors in strict mode", () => {
      const content = `---
title: Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Bug: Issue here
---
`;

      const result = BrainfileLinter.lint(content, { strictMode: true });

      // Should be invalid in strict mode due to unquoted string warning
      expect(result.valid).toBe(false);
    });
  });

  describe("getSummary", () => {
    it("returns success message for valid files", () => {
      const result = {
        valid: true,
        issues: []
      };

      const summary = BrainfileLinter.getSummary(result);
      expect(summary).toBe("✓ No issues found");
    });

    it("summarizes errors and warnings", () => {
      const result = {
        valid: false,
        issues: [
          { type: "error" as const, message: "Error 1", fixable: false },
          { type: "error" as const, message: "Error 2", fixable: false },
          { type: "warning" as const, message: "Warning 1", fixable: true },
        ]
      };

      const summary = BrainfileLinter.getSummary(result);
      expect(summary).toContain("2 errors");
      expect(summary).toContain("1 warning");
      expect(summary).toContain("1 fixable");
    });

    it("handles singular vs plural correctly", () => {
      const result = {
        valid: false,
        issues: [
          { type: "error" as const, message: "Error", fixable: false },
        ]
      };

      const summary = BrainfileLinter.getSummary(result);
      expect(summary).toBe("1 error");
    });
  });

  describe("groupIssues", () => {
    it("groups issues by type", () => {
      const result = {
        valid: false,
        issues: [
          { type: "error" as const, message: "Error 1", fixable: false },
          { type: "warning" as const, message: "Warning 1", fixable: true },
          { type: "warning" as const, message: "Warning 2", fixable: false },
          { type: "error" as const, message: "Error 2", fixable: true },
        ]
      };

      const grouped = BrainfileLinter.groupIssues(result);

      expect(grouped.errors).toHaveLength(2);
      expect(grouped.warnings).toHaveLength(2);
      expect(grouped.fixable).toHaveLength(2);
    });
  });

  describe("integration tests", () => {
    it("handles complex brainfile with multiple issue types", () => {
      const content = `---
title: Complex Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Bug: Login issue
        priority: high
      - id: task-2
        title: Feature: New feature
---
`;

      const result = BrainfileLinter.lint(content, { autoFix: true });

      expect(result.fixedContent).toBeDefined();
      expect(result.board).toBeDefined();
      
      // Verify board was parsed correctly after fixes
      expect(result.board?.columns[0].tasks).toHaveLength(2);
    });

    it("preserves board structure after auto-fix", () => {
      const content = `---
title: Test Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Task: With colon
        description: Description: Also has colon
        tags:
          - bug
        priority: high
---
`;

      const result = BrainfileLinter.lint(content, { autoFix: true });

      expect(result.board).toBeDefined();
      expect(result.board?.title).toBe("Test Board");
      expect(result.board?.columns[0].tasks[0].tags).toEqual(["bug"]);
      expect(result.board?.columns[0].tasks[0].priority).toBe("high");
    });
  });
});

