import { BrainfileParser } from "../parser";
import { BrainfileSerializer } from "../serializer";
import { complexBoard, minimalBoard } from "./fixtures/test-boards";

describe("BrainfileSerializer.serialize", () => {
  it("wraps YAML with frontmatter and trailing newline by default", () => {
    const output = BrainfileSerializer.serialize(minimalBoard);

    expect(output.startsWith("---\n")).toBe(true);
    expect(output.endsWith("---\n")).toBe(true);
    expect(output).toContain("title: Test Board");
  });

  it("respects serializer options", () => {
    const output = BrainfileSerializer.serialize(minimalBoard, {
      indent: 4,
      trailingNewline: false,
    });

    expect(output.endsWith("---")).toBe(true);
    expect(output).toContain("    id: todo");
  });

  it("round-trips complex boards through parse and serialize", () => {
    const serialized = BrainfileSerializer.serialize(complexBoard);
    const parsed = BrainfileParser.parse(serialized);

    expect(parsed?.columns[0].tasks[0].tags).toEqual(["bug", "urgent"]);
    expect(parsed?.rules?.always?.[0].rule).toContain("Always test");
  });
});

describe("BrainfileSerializer.serializeYamlOnly", () => {
  it("omits frontmatter markers", () => {
    const yamlOnly = BrainfileSerializer.serializeYamlOnly(minimalBoard);

    expect(yamlOnly.trimStart().startsWith("title: Test Board")).toBe(true);
    expect(yamlOnly).not.toContain("---");
  });
});

describe("BrainfileSerializer.prettyPrint", () => {
  it("returns formatted JSON for debugging", () => {
    const output = BrainfileSerializer.prettyPrint(minimalBoard);

    expect(output).toContain('"title": "Test Board"');
    expect(output.trim().startsWith("{")).toBe(true);
    expect(output).toContain('\n  "columns": [');
    expect(output.trimEnd().endsWith("}")).toBe(true);
  });
});
