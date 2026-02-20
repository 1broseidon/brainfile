<script setup lang="ts">
import { ref } from 'vue'

export interface SchemaField {
  name: string
  type: string
  required: boolean
  description: string
  default?: string
  children?: SchemaField[]
  enumValues?: string[]
}

interface Props {
  title: string
  fields: SchemaField[]
  expanded?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  expanded: false,
})

const expandedFields = ref<Set<string>>(new Set())
const rootExpanded = ref(props.expanded)

function toggleRoot() {
  rootExpanded.value = !rootExpanded.value
}

function toggleField(fieldName: string) {
  if (expandedFields.value.has(fieldName)) {
    expandedFields.value.delete(fieldName)
  } else {
    expandedFields.value.add(fieldName)
  }
}

function isFieldExpanded(fieldName: string): boolean {
  return expandedFields.value.has(fieldName)
}

function hasExpandableContent(field: SchemaField): boolean {
  return (
    (field.type === 'object' && !!field.children?.length) ||
    (field.type === 'enum' && !!field.enumValues?.length)
  )
}

function typeVariant(type: string): string {
  switch (type) {
    case 'string': return 'cyan'
    case 'number':
    case 'integer': return 'blue'
    case 'boolean': return 'green'
    case 'array': return 'amber'
    case 'object': return 'blue'
    case 'enum': return 'amber'
    default: return 'muted'
  }
}

function fieldPath(prefix: string, name: string): string {
  return prefix ? `${prefix}.${name}` : name
}
</script>

<template>
  <div class="schema-viewer" role="region" :aria-label="`${title} schema explorer`">
    <button
      class="schema-header"
      :aria-expanded="rootExpanded"
      :aria-controls="`schema-body-${title}`"
      @click="toggleRoot"
    >
      <span class="header-chevron" :class="{ expanded: rootExpanded }" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="header-title">{{ title }}</span>
      <span class="header-count">{{ fields.length }} fields</span>
    </button>

    <div
      v-show="rootExpanded"
      :id="`schema-body-${title}`"
      class="schema-body"
      role="list"
      :aria-label="`${title} fields`"
    >
      <template v-for="field in fields" :key="field.name">
        <SchemaFieldRow
          :field="field"
          :prefix="''"
          :expanded-fields="expandedFields"
          @toggle="toggleField"
        />
      </template>
    </div>
  </div>
</template>

<!-- Recursive child component defined inline -->
<script lang="ts">
import { defineComponent, type PropType } from 'vue'

const SchemaFieldRow = defineComponent({
  name: 'SchemaFieldRow',
  props: {
    field: { type: Object as PropType<SchemaField>, required: true },
    prefix: { type: String, default: '' },
    depth: { type: Number, default: 0 },
    expandedFields: { type: Object as PropType<Set<string>>, required: true },
  },
  emits: ['toggle'],
  setup(props, { emit }) {
    function fullPath(): string {
      return props.prefix ? `${props.prefix}.${props.field.name}` : props.field.name
    }

    function isExpanded(): boolean {
      return props.expandedFields.has(fullPath())
    }

    function hasExpandable(): boolean {
      return (
        (props.field.type === 'object' && !!props.field.children?.length) ||
        (props.field.type === 'enum' && !!props.field.enumValues?.length)
      )
    }

    function toggle() {
      emit('toggle', fullPath())
    }

    function getTypeVariant(type: string): string {
      switch (type) {
        case 'string': return 'cyan'
        case 'number':
        case 'integer': return 'blue'
        case 'boolean': return 'green'
        case 'array': return 'amber'
        case 'object': return 'blue'
        case 'enum': return 'amber'
        default: return 'muted'
      }
    }

    return { fullPath, isExpanded, hasExpandable, toggle, getTypeVariant }
  },
  template: `
    <div class="field-wrapper" :style="{ '--depth': depth }">
      <div
        class="field-row"
        :class="{ expandable: hasExpandable(), expanded: isExpanded() }"
        role="listitem"
        :aria-expanded="hasExpandable() ? isExpanded() : undefined"
        @click="hasExpandable() && toggle()"
        @keydown.enter="hasExpandable() && toggle()"
        @keydown.space.prevent="hasExpandable() && toggle()"
        :tabindex="hasExpandable() ? 0 : -1"
      >
        <span class="field-indent" aria-hidden="true"></span>

        <span v-if="hasExpandable()" class="field-chevron" :class="{ expanded: isExpanded() }" aria-hidden="true">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
        <span v-else class="field-chevron-spacer" aria-hidden="true"></span>

        <span class="field-name">{{ field.name }}</span>

        <span class="field-type" :class="'type-' + getTypeVariant(field.type)">{{ field.type }}</span>

        <span v-if="field.required" class="field-required" aria-label="required">●</span>

        <span class="field-desc">{{ field.description }}</span>

        <span v-if="field.default" class="field-default" :aria-label="'default: ' + field.default">= {{ field.default }}</span>
      </div>

      <div v-if="hasExpandable() && isExpanded()" class="field-children">
        <template v-if="field.type === 'enum' && field.enumValues?.length">
          <div class="enum-values" role="list" :aria-label="field.name + ' values'">
            <span
              v-for="val in field.enumValues"
              :key="val"
              class="enum-pill"
              role="listitem"
            >{{ val }}</span>
          </div>
        </template>

        <template v-if="field.type === 'object' && field.children?.length">
          <SchemaFieldRow
            v-for="child in field.children"
            :key="child.name"
            :field="child"
            :prefix="fullPath()"
            :depth="depth + 1"
            :expanded-fields="expandedFields"
            @toggle="(path: string) => $emit('toggle', path)"
          />
        </template>
      </div>
    </div>
  `,
})

export default { components: { SchemaFieldRow } }
</script>

<style scoped>
.schema-viewer {
  background-color: var(--void-surface, #0f111a);
  border: 1px solid var(--void-border, rgba(255, 255, 255, 0.06));
  border-radius: 8px;
  overflow: hidden;
  margin: 1.5em 0;
}

/* ── Header ── */

.schema-header {
  display: flex;
  align-items: center;
  gap: 0.6em;
  width: 100%;
  padding: 0.8em 1em;
  background: none;
  border: none;
  border-bottom: 1px solid var(--void-border, rgba(255, 255, 255, 0.06));
  cursor: pointer;
  color: var(--void-text-1, #e8e8ec);
  text-align: left;
  transition: background-color 0.15s ease;
}

.schema-header:hover {
  background-color: var(--void-bg-alt, #0a0a0f);
}

.schema-header:focus-visible {
  outline: 2px solid var(--accent-cyan, #5cc8ff);
  outline-offset: -2px;
}

.header-chevron {
  display: inline-flex;
  color: var(--void-text-3, #606070);
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.header-chevron.expanded {
  transform: rotate(90deg);
}

.header-title {
  font-family: var(--font-display, 'Outfit', sans-serif);
  font-weight: 600;
  font-size: 0.95em;
  letter-spacing: -0.01em;
}

.header-count {
  font-family: var(--vp-font-family-mono, 'JetBrains Mono', monospace);
  font-size: 0.75em;
  color: var(--void-text-3, #606070);
  margin-left: auto;
}

/* ── Body ── */

.schema-body {
  padding: 0.25em 0;
}

/* ── Field Row ── */

.field-wrapper {
  --indent-size: 1.2em;
}

.field-row {
  display: flex;
  align-items: center;
  gap: 0.5em;
  padding: 0.45em 1em;
  font-size: 0.875em;
  line-height: 1.4;
  transition: background-color 0.12s ease;
}

.field-row:hover {
  background-color: var(--void-bg-alt, #0a0a0f);
}

.field-row.expandable {
  cursor: pointer;
}

.field-row.expandable:focus-visible {
  outline: 2px solid var(--accent-cyan, #5cc8ff);
  outline-offset: -2px;
}

.field-indent {
  width: calc(var(--depth, 0) * var(--indent-size));
  flex-shrink: 0;
}

/* ── Chevron ── */

.field-chevron {
  display: inline-flex;
  color: var(--void-text-3, #606070);
  transition: transform 0.2s ease;
  flex-shrink: 0;
  width: 10px;
}

.field-chevron.expanded {
  transform: rotate(90deg);
}

.field-chevron-spacer {
  width: 10px;
  flex-shrink: 0;
}

/* ── Field parts ── */

.field-name {
  font-family: var(--vp-font-family-mono, 'JetBrains Mono', monospace);
  color: var(--accent-cyan, #5cc8ff);
  font-weight: 500;
  flex-shrink: 0;
}

.field-type {
  display: inline-flex;
  align-items: center;
  font-family: var(--vp-font-family-mono, 'JetBrains Mono', monospace);
  font-size: 0.8em;
  font-weight: 500;
  padding: 0.1em 0.5em;
  border-radius: 9999px;
  line-height: 1.3;
  flex-shrink: 0;
  border-width: 1px;
  border-style: solid;
}

.type-cyan {
  background-color: var(--accent-cyan-dim, rgba(92, 200, 255, 0.15));
  border-color: rgba(92, 200, 255, 0.25);
  color: var(--accent-cyan, #5cc8ff);
}

.type-blue {
  background-color: var(--accent-blue-dim, rgba(107, 138, 255, 0.12));
  border-color: rgba(107, 138, 255, 0.25);
  color: var(--accent-blue, #6b8aff);
}

.type-green {
  background-color: rgba(80, 200, 120, 0.12);
  border-color: rgba(80, 200, 120, 0.25);
  color: #50c878;
}

.type-amber {
  background-color: var(--accent-amber-dim, rgba(255, 179, 71, 0.12));
  border-color: rgba(255, 179, 71, 0.25);
  color: var(--accent-amber, #ffb347);
}

.type-muted {
  background-color: rgba(96, 96, 112, 0.12);
  border-color: rgba(96, 96, 112, 0.25);
  color: var(--void-text-3, #606070);
}

.field-required {
  color: var(--accent-red, #ff6b6b);
  font-size: 0.6em;
  flex-shrink: 0;
  line-height: 1;
}

.field-desc {
  color: var(--void-text-2, #a0a0b0);
  font-size: 0.9em;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-default {
  font-family: var(--vp-font-family-mono, 'JetBrains Mono', monospace);
  font-size: 0.8em;
  color: var(--void-text-3, #606070);
  flex-shrink: 0;
}

/* ── Children ── */

.field-children {
  border-left: 1px solid var(--void-border, rgba(255, 255, 255, 0.06));
  margin-left: calc(1em + (var(--depth, 0) * var(--indent-size)) + 10px + 0.5em);
}

/* ── Enum Pills ── */

.enum-values {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4em;
  padding: 0.5em 1em 0.6em;
}

.enum-pill {
  display: inline-flex;
  font-family: var(--vp-font-family-mono, 'JetBrains Mono', monospace);
  font-size: 0.75em;
  font-weight: 500;
  padding: 0.15em 0.55em;
  border-radius: 9999px;
  background-color: var(--accent-amber-dim, rgba(255, 179, 71, 0.12));
  border: 1px solid rgba(255, 179, 71, 0.25);
  color: var(--accent-amber, #ffb347);
}

/* ── Reduced Motion ── */

@media (prefers-reduced-motion: reduce) {
  .header-chevron,
  .field-chevron,
  .field-row,
  .schema-header {
    transition: none;
  }
}
</style>
