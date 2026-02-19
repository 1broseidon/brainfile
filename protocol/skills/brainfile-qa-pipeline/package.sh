#!/bin/bash
# Package brainfile QA pipeline skill for distribution

SKILL_NAME="brainfile-qa-pipeline"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${SCRIPT_DIR}/.."

cd "${SCRIPT_DIR}/.."

zip -r "${OUTPUT_DIR}/${SKILL_NAME}.zip" "${SKILL_NAME}/" \
  -x "*.git*" \
  -x "*node_modules*" \
  -x "*.DS_Store" \
  -x "${SKILL_NAME}/package.sh"

echo "✅ Created ${OUTPUT_DIR}/${SKILL_NAME}.zip"
