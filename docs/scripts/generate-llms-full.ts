#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.join(__dirname, '..');
const OUTPUT_FILE = path.join(__dirname, '../public/llms-full.txt');

interface DocSectionCandidate {
  file: string;
  title: string;
}

interface DocSectionSpec {
  candidates: DocSectionCandidate[];
}

interface DocSection {
  file: string;
  title: string;
}

// Define sections in order. Some sections support fallback paths/titles for migration compatibility.
const sectionSpecs: DocSectionSpec[] = [
  { candidates: [{ file: 'quick-start.md', title: 'Quick Start Guide' }] },
  { candidates: [{ file: 'guides/getting-started-with-contracts.md', title: 'Getting Started with Contracts' }] },
  { candidates: [{ file: 'guides/contracts.md', title: 'Comprehensive Guide to Contracts' }] },
  { candidates: [{ file: 'guides/agent-workflows.md', title: 'Agent Workflow Patterns' }] },
  { candidates: [{ file: 'tools/cli.md', title: 'CLI & Terminal UI' }] },
  { candidates: [{ file: 'tools/mcp.md', title: 'MCP Server Integration' }] },
  { candidates: [{ file: 'tools/core.md', title: 'Core Library' }] },
  { candidates: [{ file: 'reference/protocol.md', title: 'Board Format Reference' }] },
  { candidates: [{ file: 'reference/api.md', title: 'API Reference' }] },
  { candidates: [{ file: 'reference/commands.md', title: 'CLI Commands Reference' }] },
  { candidates: [{ file: 'reference/contract-schema.md', title: 'Contract Schema Reference' }] },
  { candidates: [{ file: 'reference/types.md', title: 'Schema Types' }] },
];

function resolveSections(): DocSection[] {
  const resolved: DocSection[] = [];

  for (const spec of sectionSpecs) {
    const match = spec.candidates.find((candidate) => fs.existsSync(path.join(DOCS_DIR, candidate.file)));

    if (!match) {
      const candidateFiles = spec.candidates.map((candidate) => candidate.file).join(', ');
      console.warn(`Warning: No section file found for candidates: ${candidateFiles}`);
      continue;
    }

    resolved.push(match);
  }

  return resolved;
}

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

function generateHeader(sections: DocSection[]): string {
  const now = new Date().toISOString().split('T')[0];
  return `# Brainfile - Complete Reference for AI Agents

> Comprehensive documentation for AI agents integrating with Brainfile
> Auto-generated from markdown documentation

Version: 2.0
Schema: https://brainfile.md/v2
Last Updated: ${now}

---

## Table of Contents

${sections.map((s, i) => `${i + 1}. ${s.title}`).join('\n')}

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

function generate(): void {
  console.log('Generating llms-full.txt from markdown documentation...\n');

  const sections = resolveSections();
  if (sections.length === 0) {
    throw new Error('No documentation sections were resolved.');
  }

  let output = generateHeader(sections);

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

  // Add footer
  output += `---\n\n`;
  output += `## Support & Resources\n\n`;
  output += `- **Website**: https://brainfile.md\n`;
  output += `- **Quick Reference**: https://brainfile.md/llms.txt\n`;
  output += `- **Schema**: https://brainfile.md/v2\n`;
  output += `- **GitHub**: https://github.com/1broseidon/brainfile\n`;
  output += `- **Issues**: https://github.com/1broseidon/brainfile/issues\n`;
  output += `- **Discussions**: https://github.com/1broseidon/brainfile/discussions\n\n`;
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
