/**
 * Serializer for converting Brainfile objects (all types) to markdown format
 * @packageDocumentation
 */

import * as yaml from "js-yaml";
import { Board, Brainfile } from "./types";

export interface SerializeOptions {
  /** YAML indentation (default: 2) */
  indent?: number;
  /** Maximum line width, -1 for unlimited (default: -1) */
  lineWidth?: number;
  /** Include trailing newline (default: true) */
  trailingNewline?: boolean;
}

export class BrainfileSerializer {
  /**
   * Serialize any Brainfile object (board, journal, etc.) to markdown format
   * The type field is automatically preserved if present in the data
   * @param data - The Brainfile object to serialize (Board, Journal, etc.)
   * @param options - Serialization options
   * @returns Markdown string with YAML frontmatter
   */
  static serialize(data: Brainfile | Board, options: SerializeOptions = {}): string {
    const {
      indent = 2,
      lineWidth = -1,
      trailingNewline = true
    } = options;

    const yamlContent = yaml.dump(data, {
      indent,
      lineWidth,
      noRefs: true,
      sortKeys: false,
      quotingType: '"',
      forceQuotes: false
    });

    const result = `---\n${yamlContent}---\n`;
    return trailingNewline ? result : result.trimEnd();
  }

  /**
   * Serialize any Brainfile object to YAML only (without markdown wrapper)
   * @param data - The Brainfile object to serialize
   * @param options - Serialization options
   * @returns YAML string
   */
  static serializeYamlOnly(data: Brainfile | Board, options: SerializeOptions = {}): string {
    const {
      indent = 2,
      lineWidth = -1
    } = options;

    return yaml.dump(data, {
      indent,
      lineWidth,
      noRefs: true,
      sortKeys: false
    });
  }

  /**
   * Pretty print any Brainfile object for debugging
   * @param data - The Brainfile object to print
   * @returns Pretty-printed JSON string
   */
  static prettyPrint(data: Brainfile | Board): string {
    return JSON.stringify(data, null, 2);
  }
}
