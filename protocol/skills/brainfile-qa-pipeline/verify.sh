#!/bin/bash
# Verify brainfile QA pipeline skill structure

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_MD="${SKILL_DIR}/Skill.md"

echo "🔍 Verifying brainfile QA pipeline skill structure..."
echo ""

files=("Skill.md" "README.md" "EXAMPLES.md")
all_present=true

echo "📁 Checking required files:"
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
echo "📋 Checking Skill.md metadata:"

if grep -q "^name:" "${SKILL_MD}"; then
  echo "  ✅ name field"
else
  echo "  ❌ name field missing"
  exit 1
fi

if grep -q "^description:" "${SKILL_MD}"; then
  echo "  ✅ description field"
else
  echo "  ❌ description field missing"
  exit 1
fi

echo ""
echo "✅ Skill verification complete"
