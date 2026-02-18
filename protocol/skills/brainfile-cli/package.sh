#!/bin/bash
# Package brainfile CLI skill for distribution

SKILL_NAME="brainfile-cli"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${SCRIPT_DIR}/.."

cd "${SCRIPT_DIR}/.."

# Create zip with skill folder as root
zip -r "${OUTPUT_DIR}/${SKILL_NAME}.zip" "${SKILL_NAME}/" \
  -x "*.git*" \
  -x "*node_modules*" \
  -x "*.DS_Store" \
  -x "${SKILL_NAME}/package.sh"

echo "✅ Created ${OUTPUT_DIR}/${SKILL_NAME}.zip"
echo ""
echo "To install in Claude Desktop:"
echo "1. Open Claude Desktop settings"
echo "2. Go to Capabilities > Skills"
echo "3. Click 'Add Skill'"
echo "4. Upload ${SKILL_NAME}.zip"
echo "5. Enable the skill"
