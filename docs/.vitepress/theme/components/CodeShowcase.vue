<script setup lang="ts">
import { ref, computed } from 'vue'

interface Tab {
  id: string
  label: string
}

const tabs: Tab[] = [
  { id: 'board', label: 'Board' },
  { id: 'task', label: 'Task' },
  { id: 'contract', label: 'Contract' },
  { id: 'validation', label: 'Validation' },
]

const activeTab = ref('board')
const tabRefs = ref<HTMLButtonElement[]>([])

const activeIndex = computed(() => tabs.findIndex(t => t.id === activeTab.value))

function selectTab(id: string) {
  activeTab.value = id
}

function onKeydown(e: KeyboardEvent, index: number) {
  let next = index
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault()
    next = (index + 1) % tabs.length
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault()
    next = (index - 1 + tabs.length) % tabs.length
  } else if (e.key === 'Home') {
    e.preventDefault()
    next = 0
  } else if (e.key === 'End') {
    e.preventDefault()
    next = tabs.length - 1
  } else {
    return
  }
  activeTab.value = tabs[next].id
  tabRefs.value[next]?.focus()
}
</script>

<template>
  <div class="showcase">
    <!-- Tab bar -->
    <div class="showcase-tabs" role="tablist" aria-label="Code examples">
      <button
        v-for="(tab, i) in tabs"
        :key="tab.id"
        :ref="(el) => { if (el) tabRefs[i] = el as HTMLButtonElement }"
        role="tab"
        :id="`tab-${tab.id}`"
        :aria-selected="activeTab === tab.id"
        :aria-controls="`panel-${tab.id}`"
        :tabindex="activeTab === tab.id ? 0 : -1"
        :class="['showcase-tab', { active: activeTab === tab.id }]"
        @click="selectTab(tab.id)"
        @keydown="onKeydown($event, i)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Tab panels — all rendered, stacked via grid, only active visible -->
    <div class="showcase-panels">
        <!-- Board tab -->
        <div
          key="board"
          role="tabpanel"
          id="panel-board"
          aria-labelledby="tab-board"
          :class="['showcase-panel', { active: activeTab === 'board' }]"
        >
          <div class="code-block">
            <pre><code><span class="hl-fence">---</span>
<span class="hl-key">title:</span> My Project
<span class="hl-key">columns:</span>
  - <span class="hl-key">id:</span> todo
    <span class="hl-key">title:</span> To Do
  - <span class="hl-key">id:</span> in-progress
    <span class="hl-key">title:</span> In Progress
<span class="hl-key">types:</span>
  <span class="hl-key">task:</span> { <span class="hl-key">idPrefix:</span> task, <span class="hl-key">completable:</span> <span class="hl-bool">true</span> }
  <span class="hl-key">epic:</span> { <span class="hl-key">idPrefix:</span> epic, <span class="hl-key">completable:</span> <span class="hl-bool">true</span> }
  <span class="hl-key">adr:</span> { <span class="hl-key">idPrefix:</span> adr, <span class="hl-key">completable:</span> <span class="hl-bool">false</span> }
<span class="hl-fence">---</span></code></pre>
          </div>
        </div>

        <!-- Task tab -->
        <div
          key="task"
          role="tabpanel"
          id="panel-task"
          aria-labelledby="tab-task"
          :class="['showcase-panel', { active: activeTab === 'task' }]"
        >
          <div class="code-block">
            <pre><code><span class="hl-fence">---</span>
<span class="hl-key">id:</span> task-12
<span class="hl-key">title:</span> Add rate limiting to API gateway
<span class="hl-key">column:</span> in-progress
<span class="hl-key">assignee:</span> codex
<span class="hl-key">priority:</span> high
<span class="hl-key">parentId:</span> epic-3
<span class="hl-key">tags:</span> [backend, performance]
<span class="hl-key">relatedFiles:</span>
  - src/api/gateway.ts
<span class="hl-key">subtasks:</span>
  - <span class="hl-key">id:</span> task-12-1
    <span class="hl-key">title:</span> Write unit tests
    <span class="hl-key">completed:</span> <span class="hl-bool">false</span>
<span class="hl-fence">---</span></code></pre>
          </div>
        </div>

        <!-- Contract tab -->
        <div
          key="contract"
          role="tabpanel"
          id="panel-contract"
          aria-labelledby="tab-contract"
          :class="['showcase-panel', { active: activeTab === 'contract' }]"
        >
          <div class="code-block">
            <pre><code><span class="hl-comment"># added to task-12 frontmatter</span>
<span class="hl-key">contract:</span>
  <span class="hl-key">status:</span> <span class="hl-status">in_progress</span>
  <span class="hl-key">deliverables:</span>
    - <span class="hl-key">path:</span> src/middleware/rateLimiter.ts
      <span class="hl-key">description:</span> Token bucket implementation
    - <span class="hl-key">path:</span> src/__tests__/rateLimiter.test.ts
      <span class="hl-key">description:</span> Unit tests
  <span class="hl-key">validation:</span>
    <span class="hl-key">commands:</span>
      - npm test -- rateLimiter
      - npm run build
  <span class="hl-key">constraints:</span>
    - Token bucket algorithm
    - Non-blocking async implementation</code></pre>
          </div>
        </div>

        <!-- Validation tab -->
        <div
          key="validation"
          role="tabpanel"
          id="panel-validation"
          aria-labelledby="tab-validation"
          :class="['showcase-panel', { active: activeTab === 'validation' }]"
        >
          <div class="code-block terminal">
            <pre><code><span class="t-prompt">$</span> <span class="t-cmd">brainfile contract validate</span> -t task-12
<span class="t-pass">✓</span> Checking deliverables...
  <span class="t-pass">✓</span> src/middleware/rateLimiter.ts exists
  <span class="t-pass">✓</span> src/__tests__/rateLimiter.test.ts exists
<span class="t-pass">✓</span> Running validation commands...
  <span class="t-pass">✓</span> npm test -- rateLimiter <span class="t-dim">(exit 0)</span>
  <span class="t-pass">✓</span> npm run build <span class="t-dim">(exit 0)</span>

<span class="t-pass">✓ Contract validated. Status: done</span></code></pre>
          </div>
        </div>
    </div>
  </div>
</template>

<style scoped>
/* ---- Container ---- */
.showcase {
  width: 100%;
}

/* ---- Tab bar ---- */
.showcase-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  margin-bottom: 0;
}

.showcase-tab {
  position: relative;
  padding: 0.6rem 1.25rem;
  background: transparent;
  border: none;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.78rem;
  font-weight: 500;
  color: #505060;
  cursor: pointer;
  transition: color 0.15s;
  outline: none;
}

.showcase-tab:hover {
  color: #a0a0b0;
}

.showcase-tab:focus-visible {
  outline: 2px solid #5cc8ff;
  outline-offset: -2px;
  border-radius: 4px;
}

.showcase-tab.active {
  color: #e8e8ec;
}

/* Cyan underline indicator */
.showcase-tab::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0.75rem;
  right: 0.75rem;
  height: 2px;
  background: #5cc8ff;
  border-radius: 1px;
  opacity: 0;
  transform: scaleX(0);
  transition: opacity 0.15s, transform 0.15s;
}

.showcase-tab.active::after {
  opacity: 1;
  transform: scaleX(1);
}

/* ---- Panels (grid-stacked so tallest sets height) ---- */
.showcase-panels {
  display: grid;
}

.showcase-panel {
  grid-area: 1 / 1;
  width: 100%;
  visibility: hidden;
  opacity: 0;
  transition: opacity 0.15s ease;
  pointer-events: none;
}

.showcase-panel.active {
  visibility: visible;
  opacity: 1;
  pointer-events: auto;
}

/* ---- Code block ---- */
.code-block {
  background: #0a0a0e;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-top: none;
  border-radius: 0 0 8px 8px;
  padding: 1.75rem 2rem;
  overflow-x: auto;
}

.code-block pre {
  margin: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.82rem;
  line-height: 1.7;
  color: #a0a0b0;
}

.code-block code {
  font-family: inherit;
}

/* ---- YAML highlighting ---- */
.hl-key {
  color: #c8c8d0;
}

.hl-status {
  color: #5cc8ff;
}

.hl-bool {
  color: #ffb86c;
}

.hl-fence {
  color: #383848;
}

.hl-comment {
  color: #505060;
  font-style: italic;
}

/* ---- Terminal highlighting ---- */
.t-prompt {
  color: #43d08a;
  user-select: none;
}

.t-cmd {
  color: #5cc8ff;
}

.t-pass {
  color: #43d08a;
}

.t-fail {
  color: #ff5555;
}

.t-dim {
  color: #505060;
}

/* ---- Reduced motion ---- */
@media (prefers-reduced-motion: reduce) {
  .showcase-panel {
    transition: none;
  }

  .showcase-tab::after {
    transition: none;
  }

  .showcase-tab {
    transition: none;
  }
}

/* ---- Responsive ---- */
@media (max-width: 640px) {
  .showcase-tab {
    padding: 0.5rem 0.85rem;
    font-size: 0.72rem;
  }

  .code-block {
    padding: 1.25rem;
  }

  .code-block pre {
    font-size: 0.72rem;
  }
}
</style>
