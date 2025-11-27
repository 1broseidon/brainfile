import { PALETTE } from './theme.js';

export function truncate(value: string, maxLength: number): string {
  if (!value) return ' '; // Return space instead of empty string for Ink compatibility
  if (maxLength <= 0) return ' ';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(1, maxLength - 1))}…`;
}

export function getPriorityColor(priority?: string): string {
  switch (priority?.toLowerCase()) {
    case 'critical':
      return PALETTE.critical;
    case 'giga':
      return PALETTE.giga;
    case 'high':
      return PALETTE.high;
    case 'medium':
      return PALETTE.medium;
    case 'low':
      return PALETTE.low;
    default:
      return PALETTE.border;
  }
}
