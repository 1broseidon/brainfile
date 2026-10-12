import type { McpServer } from "@modelcontextprotocol/server";
import { BUNDLED_SCHEMAS, readBundledSchema } from '../commands/schema';

/** The URI an MCP client reads a bundled schema at. */
export function schemaResourceUri(name: string): string {
  return `brainfile://schema/${name}`;
}

/**
 * The CLI's bundled JSON Schemas as MCP resources, `brainfile://schema/<name>`:
 * what `brainfile schema <name>` prints, served as data rather than a tool.
 */
export function registerSchemaResources(server: McpServer): void {
  for (const info of BUNDLED_SCHEMAS) {
    const uri = schemaResourceUri(info.id);
    server.registerResource(
      `schema-${info.id}`,
      uri,
      {
        title: `Brainfile ${info.id} schema`,
        description: `JSON Schema: ${info.description}`,
        mimeType: 'application/schema+json',
      },
      async (requested) => {
        const text = readBundledSchema(info.id);
        if (text === null) throw new Error(`Schema file not found: ${info.file}`);
        return { contents: [{ uri: requested.href, mimeType: 'application/schema+json', text }] };
      },
    );
  }
}
