#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.join(__dirname, '../src/content/docs');
const OUTPUT_FILE = path.join(__dirname, '../public/llms-full.txt');
const EXAMPLE_FILE = path.join(__dirname, '../../example/brainfile.md');

interface DocSection {
  file: string;
  title: string;
}

// Define sections in order
const sections: DocSection[] = [
  { file: 'getting-started/quick-start.md', title: 'Quick Start Guide' },
  { file: 'protocol/specification.md', title: 'Protocol Specification' },
  { file: 'agents/integration.md', title: 'AI Agent Integration' },
  { file: 'cli/installation.md', title: 'CLI Installation' },
  { file: 'cli/commands.md', title: 'CLI Commands Reference' },
  { file: 'cli/examples.md', title: 'CLI Examples' },
  { file: 'core/overview.md', title: 'Core Library Overview' },
  { file: 'core/api-reference.md', title: 'Core Library API Reference' },
  { file: 'core/templates.md', title: 'Templates' },
  { file: 'vscode/extension.md', title: 'VSCode Extension' },
];

function stripMarkdown(markdown: string): string {
  let text = markdown;

  // Remove frontmatter
  text = text.replace(/^---[\s\S]*?---\n/m, '');

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Convert headers to plain text with proper spacing
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '\n$1\n');

  // Remove code block language identifiers but keep content
  text = text.replace(/```(\w+)?\n/g, '```\n');

  // Remove inline code backticks (but keep content)
  text = text.replace(/`([^`]+)`/g, '$1');

  // Convert links [text](url) to just text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Convert bold **text** to TEXT
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');

  // Convert italic *text* to text
  text = text.replace(/\*([^*]+)\*/g, '$1');

  // Convert list items
  text = text.replace(/^[\s]*[-*+]\s+/gm, '  - ');

  // Convert numbered lists
  text = text.replace(/^[\s]*\d+\.\s+/gm, '  ');

  // Remove multiple blank lines
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

function generateHeader(): string {
  const now = new Date().toISOString().split('T')[0];
  return `# Brainfile Protocol - Complete Reference for AI Agents

> Comprehensive documentation for AI agents integrating with Brainfile
> Auto-generated from markdown documentation

Version: 1.0
Schema: https://brainfile.md/v1
Last Updated: ${now}

---

## Table of Contents

${sections.map((s, i) => `${i + 1}. ${s.title}`).join('\n')}
${sections.length + 1}. Complete Example

---

`;
}

function readDocFile(file: string): string | null {
  const fullPath = path.join(DOCS_DIR, file);

  if (!fs.existsSync(fullPath)) {
    console.warn(`Warning: File not found: ${file}`);
    return null;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  return stripMarkdown(content);
}

function readExampleFile(): string | null {
  if (!fs.existsSync(EXAMPLE_FILE)) {
    console.warn('Warning: Example brainfile.md not found');
    return null;
  }

  const content = fs.readFileSync(EXAMPLE_FILE, 'utf-8');
  return content;
}

function generate(): void {
  console.log('Generating llms-full.txt from markdown documentation...\n');

  let output = generateHeader();

  // Process each section
  sections.forEach((section, index) => {
    console.log(`Processing: ${section.file}`);

    const content = readDocFile(section.file);

    if (content) {
      output += `## ${index + 1}. ${section.title}\n\n`;
      output += content;
      output += '\n\n---\n\n';
    }
  });

  // Add complete example
  console.log('Adding complete example...');
  const example = readExampleFile();

  if (example) {
    output += `## ${sections.length + 1}. Complete Example\n\n`;
    output += 'Full example from protocol/example/brainfile.md:\n\n';
    output += '```yaml\n';
    output += example;
    output += '\n```\n\n';
  }

  // Add footer
  output += `---\n\n`;
  output += `## Support & Resources\n\n`;
  output += `- **Website**: https://brainfile.md\n`;
  output += `- **Quick Reference**: https://brainfile.md/llms.txt\n`;
  output += `- **Schema**: https://brainfile.md/v1\n`;
  output += `- **GitHub**: https://github.com/brainfile\n`;
  output += `- **Issues**: https://github.com/brainfile/protocol/issues\n`;
  output += `- **Discussions**: https://github.com/brainfile/protocol/discussions\n\n`;
  output += `---\n\n`;
  output += `End of Complete Reference\n`;
  output += `Auto-generated from markdown documentation\n`;

  // Write output
  fs.writeFileSync(OUTPUT_FILE, output, 'utf-8');

  const lineCount = output.split('\n').length;
  console.log(`\n✓ Generated llms-full.txt (${lineCount} lines)`);
  console.log(`  Output: ${OUTPUT_FILE}`);
}

// Run generation
try {
  generate();
} catch (error) {
  console.error('Error generating llms-full.txt:', error);
  process.exit(1);
}
