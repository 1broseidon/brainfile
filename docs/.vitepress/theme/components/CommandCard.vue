<script setup lang="ts">
import { ref, computed } from 'vue'

export interface CommandOption {
  flag: string
  description: string
  required?: boolean
  default?: string
}

export interface CommandExample {
  description: string
  code: string
}

const props = withDefaults(defineProps<{
  name: string
  description: string
  synopsis: string
  options?: CommandOption[]
  examples?: CommandExample[]
  expanded?: boolean
}>(), {
  options: () => [],
  examples: () => [],
  expanded: false,
})

const isExpanded = ref(props.expanded)

function toggle() {
  isExpanded.value = !isExpanded.value
}

const hasDetails = computed(() => {
  return props.options.length > 0 || props.examples.length > 0
})

const copiedIndex = ref<number | null>(null)

function copyCode(code: string, index: number) {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(code).then(() => {
      copiedIndex.value = index
      setTimeout(() => {
        copiedIndex.value = null
      }, 2000)
    })
  }
}
</script>

<template>
  <div
    class="command-card"
    :class="{ expanded: isExpanded }"
    role="region"
    :aria-label="`Command reference: ${name}`"
  >
    <!-- Header (always visible) -->
    <button
      class="command-header"
      :aria-expanded="isExpanded"
      :aria-controls="`cmd-details-${name.replace(/\s+/g, '-')}`"
      @click="toggle"
    >
      <div class="command-header-text">
        <span class="command-name">{{ name }}</span>
        <span class="command-desc">{{ description }}</span>
      </div>
      <span
        v-if="hasDetails"
        class="expand-indicator"
        aria-hidden="true"
      >{{ isExpanded ? '▾' : '▸' }}</span>
    </button>

    <!-- Expandable details -->
    <div
      :id="`cmd-details-${name.replace(/\s+/g, '-')}`"
      class="command-details"
      :class="{ open: isExpanded }"
    >
      <div class="command-details-inner">
        <!-- Synopsis -->
        <div class="command-section">
          <div class="section-label">Synopsis</div>
          <div class="synopsis-block">
            <code>{{ synopsis }}</code>
          </div>
        </div>

        <!-- Options -->
        <div v-if="options.length > 0" class="command-section">
          <div class="section-label">Options</div>
          <table class="options-table" role="table" aria-label="Command options">
            <thead>
              <tr>
                <th scope="col">Flag</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="opt in options" :key="opt.flag">
                <td>
                  <code class="option-flag">{{ opt.flag }}</code>
                  <span v-if="opt.required" class="option-required" aria-label="required">*</span>
                </td>
                <td>
                  {{ opt.description }}
                  <span v-if="opt.default" class="option-default">
                    (default: <code>{{ opt.default }}</code>)
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Examples -->
        <div v-if="examples.length > 0" class="command-section">
          <div class="section-label">Examples</div>
          <div
            v-for="(ex, i) in examples"
            :key="i"
            class="example-item"
          >
            <p class="example-desc">{{ ex.description }}</p>
            <div class="example-code-wrapper">
              <pre class="example-code"><code>{{ ex.code }}</code></pre>
              <button
                class="copy-btn"
                :aria-label="`Copy example: ${ex.description}`"
                @click.stop="copyCode(ex.code, i)"
              >
                <span v-if="copiedIndex === i" class="copy-feedback">✓</span>
                <span v-else class="copy-icon">⧉</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.command-card {
  background-color: var(--void-surface);
  border: 1px solid var(--void-border-strong);
  border-radius: 8px;
  overflow: hidden;
  margin: 1rem 0;
  transition: border-color 0.2s ease;
}

.command-card:hover {
  border-color: rgba(92, 200, 255, 0.2);
}

/* ── Header ── */

.command-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.875rem 1.25rem;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  color: inherit;
  font-family: inherit;
  gap: 1rem;
  transition: background-color 0.15s ease;
}

.command-header:hover {
  background-color: rgba(255, 255, 255, 0.02);
}

.command-header:focus-visible {
  outline: 2px solid var(--accent-cyan);
  outline-offset: -2px;
  border-radius: 8px;
}

.command-header-text {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.command-name {
  font-family: var(--vp-font-family-mono);
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--accent-cyan);
  white-space: nowrap;
}

.command-desc {
  font-size: 0.85rem;
  color: var(--void-text-2);
  line-height: 1.4;
}

.expand-indicator {
  font-size: 0.8rem;
  color: var(--void-text-3);
  flex-shrink: 0;
  transition: color 0.15s ease;
}

.command-header:hover .expand-indicator {
  color: var(--void-text-2);
}

/* ── Details (collapse/expand) ── */

.command-details {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.25s ease;
}

.command-details.open {
  grid-template-rows: 1fr;
}

.command-details-inner {
  overflow: hidden;
}

/* ── Sections ── */

.command-section {
  padding: 0 1.25rem 1rem;
}

.command-section:first-child {
  border-top: 1px solid var(--void-border);
  padding-top: 1rem;
}

.section-label {
  font-family: var(--vp-font-family-mono);
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--void-text-3);
  margin-bottom: 0.5rem;
}

/* ── Synopsis ── */

.synopsis-block {
  background-color: var(--vp-code-block-bg);
  border: 1px solid var(--void-border);
  border-radius: 6px;
  padding: 0.625rem 1rem;
  overflow-x: auto;
}

.synopsis-block code {
  font-family: var(--vp-font-family-mono);
  font-size: 0.85rem;
  color: var(--void-text-1);
  background: none;
  border: none;
  padding: 0;
}

/* ── Options Table ── */

.options-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid var(--void-border);
  border-radius: 6px;
  overflow: hidden;
  font-size: 0.85rem;
}

.options-table th {
  background-color: var(--void-bg-alt);
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--void-text-3);
  padding: 0.5rem 0.75rem;
  text-align: left;
}

.options-table td {
  padding: 0.5rem 0.75rem;
  border-top: 1px solid var(--void-border);
  color: var(--void-text-2);
  vertical-align: top;
}

.options-table tr:first-child td {
  border-top: none;
}

.option-flag {
  font-family: var(--vp-font-family-mono);
  font-size: 0.85em;
  color: var(--accent-cyan);
  background: none;
  border: none;
  padding: 0;
  white-space: nowrap;
}

.option-required {
  color: var(--accent-red);
  font-weight: 700;
  margin-left: 0.2em;
}

.option-default {
  color: var(--void-text-3);
  font-size: 0.9em;
}

.option-default code {
  font-family: var(--vp-font-family-mono);
  font-size: 0.9em;
  color: var(--void-text-2);
  background: none;
  border: none;
  padding: 0;
}

/* ── Examples ── */

.example-item {
  margin-bottom: 0.75rem;
}

.example-item:last-child {
  margin-bottom: 0;
}

.example-desc {
  font-size: 0.82rem;
  color: var(--void-text-2);
  margin: 0 0 0.35rem;
  line-height: 1.4;
}

.example-code-wrapper {
  position: relative;
}

.example-code {
  background-color: var(--vp-code-block-bg);
  border: 1px solid var(--void-border);
  border-radius: 6px;
  padding: 0.625rem 1rem;
  margin: 0;
  overflow-x: auto;
}

.example-code code {
  font-family: var(--vp-font-family-mono);
  font-size: 0.82rem;
  color: var(--void-text-1);
  line-height: 1.6;
  background: none;
  border: none;
  padding: 0;
}

.copy-btn {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--void-surface);
  border: 1px solid var(--void-border);
  border-radius: 6px;
  cursor: pointer;
  color: var(--void-text-3);
  font-size: 0.8rem;
  opacity: 0;
  transition: opacity 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.example-code-wrapper:hover .copy-btn {
  opacity: 1;
}

.copy-btn:hover {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
}

.copy-btn:focus-visible {
  opacity: 1;
  outline: 2px solid var(--accent-cyan);
  outline-offset: -2px;
}

.copy-feedback {
  color: var(--accent-cyan);
}

/* ── Reduced motion ── */

@media (prefers-reduced-motion: reduce) {
  .command-details {
    transition: none;
  }

  .command-card,
  .command-header,
  .expand-indicator,
  .copy-btn {
    transition: none;
  }
}

/* ── Responsive ── */

@media (max-width: 640px) {
  .command-header {
    padding: 0.75rem 1rem;
  }

  .command-section {
    padding: 0 1rem 0.875rem;
  }

  .options-table {
    display: block;
    overflow-x: auto;
  }
}
</style>
