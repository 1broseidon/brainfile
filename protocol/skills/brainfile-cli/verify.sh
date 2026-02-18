#!/bin/bash
# Verify brainfile CLI skill structure

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_MD="${SKILL_DIR}/Skill.md"

echo "🔍 Verifying brainfile CLI skill structure..."
echo ""

# Check required files
echo "📁 Checking required files:"
files=("Skill.md" "README.md" "EXAMPLES.md")
all_present=true

for file in "${files[@]}"; do
  if [ -f "${SKILL_DIR}/${file}" ]; then
    echo "  ✅ ${file}"
  else
    echo "  ❌ ${file} - MISSING"
    all_present=false
  fi
done

if [ "$all_present" = false ]; then
  echo ""
  echo "❌ Required files missing"
  exit 1
fi

echo ""
echo "📋 Checking Skill.md structure:"

# Check YAML frontmatter
if grep -q "^---" "${SKILL_MD}"; then
  echo "  ✅ YAML frontmatter present"
else
  echo "  ❌ YAML frontmatter missing"
  exit 1
fi

# Check required fields
if grep -q "^name:" "${SKILL_MD}"; then
  name=$(grep "^name:" "${SKILL_MD}" | cut -d':' -f2- | xargs)
  echo "  ✅ name: ${name}"
else
  echo "  ❌ name field missing"
  exit 1
fi

if grep -q "^description:" "${SKILL_MD}"; then
  description=$(grep "^description:" "${SKILL_MD}" | cut -d':' -f2- | xargs)
  desc_length=${#description}

  if [ $desc_length -le 200 ]; then
    echo "  ✅ description: ${desc_length} chars (≤200)"
  else
    echo "  ⚠️  description: ${desc_length} chars (>200, recommended to shorten)"
  fi
else
  echo "  ❌ description field missing"
  exit 1
fi

# Check for key sections
echo ""
echo "📖 Checking content sections:"

sections=(
  "## Overview"
  "## Core Commands Reference"
  "## Contract System"
  "## Best Practices"
  "## Quick Reference"
)

for section in "${sections[@]}"; do
  if grep -q "^${section}" "${SKILL_MD}"; then
    echo "  ✅ ${section}"
  else
    echo "  ⚠️  ${section} - not found (optional but recommended)"
  fi
done

echo ""
echo "📊 File sizes:"
printf "  Skill.md: %8s\n" "$(du -h "${SKILL_DIR}/Skill.md" | cut -f1)"
printf "  EXAMPLES.md: %5s\n" "$(du -h "${SKILL_DIR}/EXAMPLES.md" | cut -f1)"
printf "  README.md: %7s\n" "$(du -h "${SKILL_DIR}/README.md" | cut -f1)"

echo ""
echo "✅ Skill structure verification complete!"
echo ""
echo "To package for distribution, run:"
echo "  ./package.sh"
