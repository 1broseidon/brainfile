# Brainfile QA Pipeline Skill

Reusable post-delivery QA workflow for Brainfile tasks.

## Purpose

This skill standardizes the same review sequence each time:
1. contract validation
2. pragmatist complexity review
3. karen spec/reality review
4. subtask toggles + explicit pass/fail verdict

## Files

- `Skill.md` - Core reusable workflow
- `EXAMPLES.md` - Practical pass/fail scenarios
- `verify.sh` - Basic structure checks
- `package.sh` - Zip packaging helper

## Use Cases

- “Run QA pipeline on task-123”
- “Run pragmatist + karen review”
- “Validate delivered contract before completion”

## Quick Start

```bash
cd protocol/skills/brainfile-qa-pipeline
./verify.sh
./package.sh
```

Then upload the zip to Claude Desktop Skills if needed.
