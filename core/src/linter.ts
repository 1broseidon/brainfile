/**
 * Linter for Brainfile markdown files with YAML frontmatter
 * @packageDocumentation
 */

import * as yaml from "js-yaml";
import { Board } from "./types";
import { BrainfileParser } from "./parser";
import { BrainfileValidator } from "./validator";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter";

/** Warning text for a legacy `rules:` block (adr-2 removed the feature). */
export const LEGACY_RULES_MESSAGE =
  "rules is removed (adr-2); fold into agent.instructions";

/** Category order used when folding legacy rules into agent.instructions. */
const RULE_CATEGORY_ORDER = ["always", "never", "prefer", "context"] as const;

export interface LintIssue {
  type: "error" | "warning";
  message: string;
  line?: number;
  column?: number;
  fixable?: boolean;
  code?: string; // Error code for categorization
}

export interface LintResult {
  valid: boolean;
  issues: LintIssue[];
  fixedContent?: string;
  board?: Board;
}

export interface LintOptions {
  autoFix?: boolean;
  strictMode?: boolean; // If true, warnings are treated as errors
}

export class BrainfileLinter {
  /**
   * Lint a brainfile.md content string
   * @param content - The markdown content with YAML frontmatter
   * @param options - Linting options
   * @returns LintResult with issues and optionally fixed content
   */
  static lint(content: string, options: LintOptions = {}): LintResult {
    const issues: LintIssue[] = [];
    let fixedContent = content;
    let board: Board | null = null;

    // Step 1: Check for fixable YAML issues (unquoted strings with colons)
    const quotableStrings = this.findUnquotedStringsWithColons(content);
    if (quotableStrings.length > 0) {
      quotableStrings.forEach(({ line, text }) => {
        issues.push({
          type: "warning",
          message: `Unquoted string with colon: "${text}"`,
          line,
          fixable: true,
          code: "UNQUOTED_STRING"
        });
      });

      if (options.autoFix) {
        fixedContent = this.fixUnquotedStrings(content, quotableStrings);
      }
    }

    // Step 1b: legacy `rules:` block (removed by adr-2). Warned about always;
    // folded into `agent.instructions` under --fix.
    const legacyRules = this.findLegacyRules(fixedContent);
    if (legacyRules) {
      issues.push({
        type: "warning",
        message: LEGACY_RULES_MESSAGE,
        line: legacyRules.line,
        fixable: true,
        code: "LEGACY_RULES"
      });

      if (options.autoFix) {
        const folded = this.foldLegacyRules(fixedContent);
        if (folded !== null) fixedContent = folded;
      }
    }

    // Step 2: Check YAML syntax
    const contentToValidate = options.autoFix && fixedContent !== content ? fixedContent : content;
    const yamlIssues = this.checkYAMLSyntax(contentToValidate);
    
    // If we applied fixes, check if the issues still exist
    if (options.autoFix && fixedContent !== content) {
      const remainingYamlIssues = this.checkYAMLSyntax(fixedContent);
      issues.push(...remainingYamlIssues);
    } else {
      issues.push(...yamlIssues);
    }

    // Step 3: Validate board structure (if YAML is valid)
    const finalYamlIssues = options.autoFix ? this.checkYAMLSyntax(fixedContent) : yamlIssues;
    if (finalYamlIssues.length === 0) {
      const result = BrainfileParser.parseWithErrors(options.autoFix ? fixedContent : content);

      if (result.board) {
        board = result.board;

        // Check for duplicate column IDs (informational - already handled by parser)
        if (result.warnings && result.warnings.length > 0) {
          result.warnings.forEach(warning => {
            // Match both the header and individual warnings
            if (warning.includes("Duplicate column")) {
              // Skip the header line, only process actual duplicate messages
              if (!warning.includes("Duplicate columns detected:")) {
                const cleanMessage = warning
                  .replace("[Brainfile Parser]", "")
                  .replace(/^\s*-\s*/, "")
                  .trim();
                
                if (cleanMessage) {
                  issues.push({
                    type: "warning",
                    message: cleanMessage,
                    fixable: false,
                    code: "DUPLICATE_COLUMN"
                  });
                }
              }
            }
          });
        }

        // Run structural validation
        const validation = BrainfileValidator.validate(result.board);
        if (!validation.valid) {
          validation.errors.forEach(err => {
            issues.push({
              type: "error",
              message: `${err.path}: ${err.message}`,
              fixable: false,
              code: "VALIDATION_ERROR"
            });
          });
        }
      } else if (result.error) {
        issues.push({
          type: "error",
          message: `Parse error: ${result.error}`,
          fixable: false,
          code: "PARSE_ERROR"
        });
      }
    }

    // Determine if valid (no errors, or only warnings in non-strict mode)
    const hasErrors = issues.some(i => i.type === "error");
    const hasWarnings = issues.some(i => i.type === "warning");
    const valid = options.strictMode ? !hasErrors && !hasWarnings : !hasErrors;

    return {
      valid,
      issues,
      fixedContent: options.autoFix && fixedContent !== content ? fixedContent : undefined,
      board: board || undefined
    };
  }

  /**
   * Locate a legacy top-level `rules:` block in the frontmatter.
   *
   * Deliberately textual rather than YAML-object based: this must report a
   * usable line number, and it must still fire on a file whose frontmatter
   * fails to `yaml.load` for some unrelated reason.
   */
  private static findLegacyRules(content: string): { line: number } | null {
    const lines = content.split("\n");
    if (!lines[0] || lines[0].trim() !== "---") return null;

    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") return null; // end of frontmatter
      // Top-level key only — an indented `rules:` belongs to something else.
      if (/^rules:\s*$/.test(lines[i]) || /^rules:\s+\S/.test(lines[i])) {
        return { line: i + 1 };
      }
    }

    return null;
  }

  /**
   * Fold a legacy `rules:` block into `agent.instructions` and remove it.
   *
   * Each rule becomes `"<category>: <text>"` (adr-2's stated shape), appended
   * in category order after any instructions already present. Returns null if
   * the frontmatter cannot be round-tripped, in which case the caller keeps
   * the original content and the warning stands unfixed.
   */
  private static foldLegacyRules(content: string): string | null {
    const doc = parseFrontmatter<Record<string, unknown>>(content);
    if (!doc) return null;

    const data = doc.data;
    const rules = data.rules;
    if (!rules || typeof rules !== "object" || Array.isArray(rules)) return null;

    const folded: string[] = [];
    for (const category of RULE_CATEGORY_ORDER) {
      const entries = (rules as Record<string, unknown>)[category];
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const text =
          typeof entry === "string"
            ? entry
            : typeof (entry as { rule?: unknown })?.rule === "string"
              ? ((entry as { rule: string }).rule)
              : null;
        if (text && text.trim()) folded.push(`${category}: ${text.trim()}`);
      }
    }

    delete data.rules;

    if (folded.length > 0) {
      const agent =
        data.agent && typeof data.agent === "object" && !Array.isArray(data.agent)
          ? (data.agent as Record<string, unknown>)
          : {};
      const existing = Array.isArray(agent.instructions)
        ? (agent.instructions as unknown[]).filter((i): i is string => typeof i === "string")
        : [];
      agent.instructions = [...existing, ...folded];
      data.agent = agent;
    }

    return serializeFrontmatter(data, doc.body);
  }

  /**
   * Check YAML syntax by attempting to parse
   */
  private static checkYAMLSyntax(content: string): LintIssue[] {
    const issues: LintIssue[] = [];

    try {
      const lines = content.split("\n");
      
      // Find frontmatter boundaries
      if (!lines[0].trim().startsWith("---")) {
        issues.push({
          type: "error",
          message: "Missing YAML frontmatter opening (---)",
          line: 1,
          fixable: false,
          code: "MISSING_FRONTMATTER_START"
        });
        return issues;
      }

      let endIndex = -1;
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === "---") {
          endIndex = i;
          break;
        }
      }

      if (endIndex === -1) {
        issues.push({
          type: "error",
          message: "Missing YAML frontmatter closing (---)",
          fixable: false,
          code: "MISSING_FRONTMATTER_END"
        });
        return issues;
      }

      // Extract and parse YAML
      const yamlContent = lines.slice(1, endIndex).join("\n");
      yaml.load(yamlContent);

    } catch (error: any) {
      if (error.mark) {
        issues.push({
          type: "error",
          message: `YAML syntax error: ${error.reason || error.message}`,
          line: error.mark.line + 2, // Adjust for frontmatter offset
          column: error.mark.column,
          fixable: false,
          code: "YAML_SYNTAX_ERROR"
        });
      } else {
        issues.push({
          type: "error",
          message: `YAML error: ${error.message}`,
          fixable: false,
          code: "YAML_ERROR"
        });
      }
    }

    return issues;
  }

  /**
   * Find strings with colons that should be quoted
   */
  private static findUnquotedStringsWithColons(content: string): Array<{ line: number; text: string; fullLine: string }> {
    const results: Array<{ line: number; text: string; fullLine: string }> = [];
    const lines = content.split("\n");

    // Look for title: or rule: fields with unquoted strings containing colons
    const titlePattern = /^(\s+)(title|rule|description):\s+([^"'][^"\n]*:\s*[^"\n]+)$/;

    lines.forEach((line, index) => {
      const match = line.match(titlePattern);
      if (match) {
        const text = match[3].trim();
        // Check if it contains a colon followed by space (YAML separator)
        if (text.includes(": ")) {
          results.push({
            line: index + 1,
            text,
            fullLine: line
          });
        }
      }
    });

    return results;
  }

  /**
   * Fix unquoted strings by adding quotes
   */
  private static fixUnquotedStrings(
    content: string, 
    issues: Array<{ line: number; text: string; fullLine: string }>
  ): string {
    const lines = content.split("\n");

    issues.forEach(issue => {
      const lineIndex = issue.line - 1;
      const line = lines[lineIndex];
      
      // Match the pattern and replace with quoted version
      const match = line.match(/^(\s+)(title|rule|description):\s+(.+)$/);
      if (match) {
        const indent = match[1];
        const key = match[2];
        const value = match[3].trim();
        
        // Only quote if not already quoted
        if (!value.startsWith('"') && !value.startsWith("'")) {
          lines[lineIndex] = `${indent}${key}: "${value}"`;
        }
      }
    });

    return lines.join("\n");
  }

  /**
   * Get a human-readable summary of lint results
   */
  static getSummary(result: LintResult): string {
    if (result.valid && result.issues.length === 0) {
      return "✓ No issues found";
    }

    const errors = result.issues.filter(i => i.type === "error");
    const warnings = result.issues.filter(i => i.type === "warning");
    const fixable = result.issues.filter(i => i.fixable);

    const parts: string[] = [];
    
    if (errors.length > 0) {
      parts.push(`${errors.length} error${errors.length > 1 ? "s" : ""}`);
    }
    
    if (warnings.length > 0) {
      parts.push(`${warnings.length} warning${warnings.length > 1 ? "s" : ""}`);
    }
    
    if (fixable.length > 0) {
      parts.push(`${fixable.length} fixable`);
    }

    return parts.join(", ");
  }

  /**
   * Get issues grouped by type
   */
  static groupIssues(result: LintResult): {
    errors: LintIssue[];
    warnings: LintIssue[];
    fixable: LintIssue[];
  } {
    return {
      errors: result.issues.filter(i => i.type === "error"),
      warnings: result.issues.filter(i => i.type === "warning"),
      fixable: result.issues.filter(i => i.fixable)
    };
  }
}

