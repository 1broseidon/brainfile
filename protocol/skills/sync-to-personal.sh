#!/bin/bash
# Sync brainfile-cli skill to personal Claude Code skills directory

SKILL_NAME="brainfile-cli"
PROJECT_SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/${SKILL_NAME}"
PERSONAL_SKILL_DIR="${HOME}/.claude/skills/${SKILL_NAME}"

echo "🔄 Syncing ${SKILL_NAME} skill to personal directory..."
echo ""
echo "From: ${PROJECT_SKILL_DIR}"
echo "To:   ${PERSONAL_SKILL_DIR}"
echo ""

# Create personal skills directory if it doesn't exist
mkdir -p "${HOME}/.claude/skills"

# Copy skill to personal directory
cp -r "${PROJECT_SKILL_DIR}" "${PERSONAL_SKILL_DIR}"

if [ $? -eq 0 ]; then
  echo "✅ Skill synced successfully!"
  echo ""
  echo "Personal skill is now available in all Claude Code projects."
  echo ""
  echo "To verify:"
  echo "  cd ${PERSONAL_SKILL_DIR}"
  echo "  ./verify.sh"
else
  echo "❌ Sync failed"
  exit 1
fi
