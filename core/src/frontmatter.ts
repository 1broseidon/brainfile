import * as yaml from 'js-yaml';

export interface FrontmatterDocument<T> {
  data: T;
  body: string;
}

/**
 * Parse YAML frontmatter and markdown body from raw file content.
 *
 * This helper is intentionally runtime-agnostic: it performs no filesystem
 * access and is safe to bundle for browsers.
 */
export function parseFrontmatter<T>(content: string): FrontmatterDocument<T> | null {
  const lines = content.split('\n');

  if (!lines[0] || lines[0].trim() !== '---') {
    return null;
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return null;
  }

  const yamlContent = lines.slice(1, endIndex).join('\n');
  const bodyContent = lines.slice(endIndex + 1).join('\n');

  let parsed: unknown;
  try {
    parsed = yaml.load(yamlContent);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  return {
    data: parsed as T,
    body: bodyContent.replace(/^\n/, ''),
  };
}

/**
 * Serialize YAML frontmatter plus optional markdown body.
 *
 * This helper is intentionally runtime-agnostic: it performs no filesystem
 * access and is safe to bundle for browsers.
 */
export function serializeFrontmatter<T>(data: T, body: string = ''): string {
  const yamlContent = yaml.dump(data, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
    forceQuotes: false,
  });

  const parts = ['---\n', yamlContent, '---\n'];

  if (body.length > 0) {
    parts.push('\n');
    parts.push(body);
    if (!body.endsWith('\n')) {
      parts.push('\n');
    }
  }

  return parts.join('');
}
