import React from 'react';
import { Box, Text } from 'ink';
import { PALETTE, BOX, ICONS } from '../theme.js';
import type { RuleType } from '../types.js';
import { truncate } from '../utils.js';

interface Rule {
  id: number;
  rule: string;
}

interface Rules {
  always?: Rule[];
  never?: Rule[];
  prefer?: Rule[];
  context?: Rule[];
}

export interface RulesPanelProps {
  rules: Rules | undefined;
  activeRuleType: RuleType;
  selectedRuleIndex: number;
  viewportHeight: number;
  termWidth: number;
  mode: string;
  editText?: string;
}

const RULE_TYPES: RuleType[] = ['always', 'never', 'prefer', 'context'];

const RULE_TYPE_LABELS: Record<RuleType, string> = {
  always: 'Always',
  never: 'Never',
  prefer: 'Prefer',
  context: 'Context',
};

const RULE_TYPE_COLORS: Record<RuleType, string> = {
  always: PALETTE.success,
  never: PALETTE.error,
  prefer: PALETTE.warning,
  context: PALETTE.accent,
};

export function RulesPanel({
  rules,
  activeRuleType,
  selectedRuleIndex,
  viewportHeight,
  termWidth,
  mode,
  editText,
}: RulesPanelProps) {
  const currentRules = rules?.[activeRuleType] || [];
  const maxWidth = Math.max(termWidth - 8, 20);

  // Calculate scroll offset for rules list
  const scrollPadding = 2;
  const visibleRules = Math.max(viewportHeight - 8, 3); // Reserve space for tabs and footer
  let scrollOffset = 0;
  if (selectedRuleIndex >= visibleRules - scrollPadding) {
    scrollOffset = Math.min(
      selectedRuleIndex - visibleRules + scrollPadding + 1,
      Math.max(0, currentRules.length - visibleRules)
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Rule type tabs */}
      <Box marginBottom={1}>
        {RULE_TYPES.map((type, idx) => {
          const count = rules?.[type]?.length || 0;
          const isActive = type === activeRuleType;
          return (
            <Box key={type} marginRight={2}>
              <Text
                color={isActive ? RULE_TYPE_COLORS[type] : PALETTE.textMuted}
                bold={isActive}
                inverse={isActive}
              >
                {' '}{RULE_TYPE_LABELS[type]}
                {count > 0 && <Text color={PALETTE.textSecondary}> ({count})</Text>}
                {' '}
              </Text>
              <Text color={PALETTE.textDim}> [{idx + 1}]</Text>
            </Box>
          );
        })}
      </Box>

      {/* Instructions */}
      <Box marginBottom={1}>
        <Text color={PALETTE.textMuted}>
          <Text color={PALETTE.textSecondary}>h/l</Text> switch type{' '}
          <Text color={PALETTE.textSecondary}>j/k</Text> select{' '}
          <Text color={PALETTE.textSecondary}>n</Text> new{' '}
          <Text color={PALETTE.textSecondary}>e</Text> edit{' '}
          <Text color={PALETTE.textSecondary}>d</Text> delete
        </Text>
      </Box>

      {/* Separator */}
      <Box>
        <Text color={PALETTE.border}>{BOX.horizontal.repeat(Math.max(1, termWidth - 4))}</Text>
      </Box>

      {/* Rule editing mode */}
      {(mode === 'rule-add' || mode === 'rule-edit') && (
        <Box flexDirection="column" marginY={1}>
          <Text color={PALETTE.accent}>
            {mode === 'rule-add' ? 'New rule:' : 'Edit rule:'}
          </Text>
          <Box marginTop={0}>
            <Text color={PALETTE.text} backgroundColor={PALETTE.bgHighlight}>
              {' '}{editText || ' '}{ICONS.cursor}{' '}
            </Text>
          </Box>
          <Text color={PALETTE.textMuted} dimColor>
            Enter to save, Esc to cancel
          </Text>
        </Box>
      )}

      {/* Delete confirmation */}
      {mode === 'rule-delete-confirm' && currentRules[selectedRuleIndex] && (
        <Box flexDirection="column" marginY={1} paddingX={1}>
          <Text color={PALETTE.error} bold>
            Delete this {activeRuleType} rule?
          </Text>
          <Box marginTop={1}>
            <Text color={PALETTE.textSecondary}>
              #{currentRules[selectedRuleIndex].id}: {truncate(currentRules[selectedRuleIndex].rule, maxWidth - 10)}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color={PALETTE.textMuted}>
              Press <Text color={PALETTE.success}>y</Text> to confirm, <Text color={PALETTE.error}>n</Text> to cancel
            </Text>
          </Box>
        </Box>
      )}

      {/* Rules list */}
      {mode !== 'rule-add' && mode !== 'rule-edit' && mode !== 'rule-delete-confirm' && (
        <Box flexDirection="column" marginTop={1}>
          {currentRules.length === 0 ? (
            <Box paddingY={1}>
              <Text color={PALETTE.textMuted}>
                No {activeRuleType} rules defined. Press <Text color={PALETTE.accent}>n</Text> to add one.
              </Text>
            </Box>
          ) : (
            currentRules.slice(scrollOffset, scrollOffset + visibleRules).map((rule, displayIdx) => {
              const actualIdx = scrollOffset + displayIdx;
              const isSelected = actualIdx === selectedRuleIndex;
              return (
                <Box key={rule.id} paddingY={0}>
                  <Text
                    color={isSelected ? PALETTE.text : PALETTE.textSecondary}
                    backgroundColor={isSelected ? PALETTE.bgHighlight : undefined}
                    bold={isSelected}
                  >
                    {isSelected ? ICONS.pointer : ' '}{' '}
                    <Text color={RULE_TYPE_COLORS[activeRuleType]}>#{rule.id}</Text>
                    {' '}{truncate(rule.rule, maxWidth - 8)}
                  </Text>
                </Box>
              );
            })
          )}

          {/* Scroll indicator */}
          {currentRules.length > visibleRules && (
            <Box marginTop={1}>
              <Text color={PALETTE.textDim}>
                {scrollOffset + 1}-{Math.min(scrollOffset + visibleRules, currentRules.length)} of {currentRules.length}
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
