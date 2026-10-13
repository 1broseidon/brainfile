/**
 * Effort on a model (task-50): the levels come from the agent's thought_level
 * option, groups flatten, and a choice that the model does not offer falls
 * back to medium.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultEffort, effortSelect, effortToSet, flatSelect } from '../src/agents/effort.ts';

const opus = {
  id: 'model',
  type: 'select',
  category: 'model',
  currentValue: 'opus',
  options: [
    { name: 'Claude', options: [{ value: 'opus', name: 'Opus' }, { value: 'sonnet', name: 'Sonnet' }] },
  ],
};

const effort = {
  id: 'reasoning_effort',
  type: 'select',
  category: 'thought_level',
  currentValue: 'high',
  options: [
    { value: 'low', name: 'Low' },
    { value: 'medium', name: 'Medium' },
    { value: 'high', name: 'High' },
  ],
};

test('a grouped model list flattens to its values', () => {
  assert.deepEqual(flatSelect(opus), [
    { value: 'opus', name: 'Opus', description: undefined },
    { value: 'sonnet', name: 'Sonnet', description: undefined },
  ]);
});

test('thought_level is the effort select, even under another id', () => {
  const found = effortSelect([opus, { id: 'mode', type: 'select', category: 'mode', currentValue: 'ask', options: [{ value: 'ask', name: 'Ask' }] }, effort]);
  assert.deepEqual(found, {
    id: 'reasoning_effort',
    current: 'high',
    options: [
      { value: 'low', name: 'Low' },
      { value: 'medium', name: 'Medium' },
      { value: 'high', name: 'High' },
    ],
  });
});

test('an option named effort counts when the category is absent', () => {
  const found = effortSelect([{ id: 'effort', type: 'select', currentValue: 'medium', options: [{ value: 'medium', name: 'Medium' }] }]);
  assert.equal(found?.id, 'effort');
  assert.equal(found?.options.length, 1);
});

test('medium is the level a new choice starts on', () => {
  const levels = [
    { value: 'low', name: 'Low' },
    { value: 'medium', name: 'Medium' },
    { value: 'high', name: 'High' },
  ];
  assert.equal(defaultEffort(levels), 'medium');
  assert.equal(effortToSet(levels), 'medium');
  assert.equal(effortToSet(levels, 'nope'), 'medium');
  assert.equal(effortToSet(levels, 'high'), 'high');
});

test('a model with no medium keeps no default, and one with no levels offers none', () => {
  assert.equal(defaultEffort([{ value: 'high', name: 'High' }]), undefined);
  assert.equal(effortToSet([{ value: 'high', name: 'High' }], 'low'), undefined);
  assert.equal(effortToSet([], 'medium'), undefined);
});

test('Medium matches by name when the value is the agent’s own word', () => {
  assert.equal(defaultEffort([{ value: 'med', name: 'Medium' }]), 'med');
});
