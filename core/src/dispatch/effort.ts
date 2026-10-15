/**
 * Effort levels on a model's own menu (task-50).
 *
 * An agent publishes them as a session config option of category
 * `thought_level` (some name the option `effort` or `reasoning_effort`).
 * The levels can change with the model, so each model carries the ones it
 * offered when it was selected. Medium is the level a new choice starts on:
 * it is the one most models have.
 */

export interface EffortLevel {
  value: string;
  name: string;
}

interface SelectEntry {
  value?: string;
  name?: string;
  description?: string | null;
  options?: SelectEntry[];
}

interface ConfigOptionLike {
  id?: string;
  type?: string;
  category?: string | null;
  currentValue?: string | boolean;
  options?: SelectEntry[];
}

/** Ids agents use for the effort select when they leave the category off. */
const EFFORT_ID = /^(thought_level|reasoning_effort|effort)$/i;

function isMedium(level: EffortLevel): boolean {
  return level.value.trim().toLowerCase() === 'medium' || level.name.trim().toLowerCase() === 'medium';
}

function asOption(value: unknown): ConfigOptionLike | null {
  if (!value || typeof value !== 'object') return null;
  return value as ConfigOptionLike;
}

/** A select's values, its groups flattened. A group has no value of its own. */
export function flatSelect(option: ConfigOptionLike): { value: string; name: string; description?: string }[] {
  const flat: { value: string; name: string; description?: string }[] = [];
  if (option.type !== 'select' || !option.options) return flat;
  for (const entry of option.options) {
    for (const item of entry.options ?? [entry]) {
      if (item.value) flat.push({ value: item.value, name: item.name || item.value, description: item.description ?? undefined });
    }
  }
  return flat;
}

/**
 * The session's effort select, if the agent offers one.
 * `category: thought_level`, or an option id agents already use for it.
 */
export function effortSelect(options: unknown): { id: string; current: string; options: EffortLevel[] } | null {
  if (!Array.isArray(options)) return null;
  for (const raw of options) {
    const option = asOption(raw);
    if (!option || option.type !== 'select' || !option.id) continue;
    if (option.category !== 'thought_level' && !EFFORT_ID.test(option.id)) continue;
    const levels = flatSelect(option).map(({ value, name }) => ({ value, name }));
    if (!levels.length) continue;
    return { id: option.id, current: typeof option.currentValue === 'string' ? option.currentValue : '', options: levels };
  }
  return null;
}

/** Medium, when the model offers it. */
export function defaultEffort(levels: EffortLevel[]): string | undefined {
  return levels.find(isMedium)?.value;
}

/**
 * The effort to set on a session: the one the person chose, when this model
 * still offers it, otherwise medium. Undefined when the model offers none.
 */
export function effortToSet(levels: EffortLevel[], chosen?: string): string | undefined {
  if (!levels.length) return undefined;
  if (chosen && levels.some((level) => level.value === chosen)) return chosen;
  return defaultEffort(levels);
}
