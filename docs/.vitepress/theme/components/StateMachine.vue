<script setup lang="ts">
import { ref } from 'vue'

const hoveredState = ref<string | null>(null)

interface StateInfo {
  id: string
  label: string
  tooltip: string
  x: number
  y: number
  width: number
  height: number
  variant: '' | 'success' | 'blocked' | 'failed'
}

const states: StateInfo[] = [
  { id: 'ready',       label: 'ready',       tooltip: 'Contract created, waiting for agent pickup',    x: 50,  y: 40, width: 100, height: 40, variant: '' },
  { id: 'in_progress', label: 'in_progress', tooltip: 'Agent actively working on deliverables',        x: 200, y: 40, width: 140, height: 40, variant: 'success' },
  { id: 'delivered',   label: 'delivered',    tooltip: 'Work complete, awaiting validation',            x: 400, y: 40, width: 140, height: 40, variant: 'success' },
  { id: 'done',        label: 'done',         tooltip: 'Validated and approved',                       x: 600, y: 40, width: 100, height: 40, variant: 'success' },
  { id: 'blocked',     label: 'blocked',      tooltip: 'Agent stuck on external dependency',           x: 200, y: 140, width: 140, height: 40, variant: 'blocked' },
  { id: 'failed',      label: 'failed',       tooltip: 'Validation failed, needs rework',              x: 400, y: 140, width: 140, height: 40, variant: 'failed' },
]

function onEnter(id: string) {
  hoveredState.value = id
}

function onLeave() {
  hoveredState.value = null
}

function tooltipX(s: StateInfo): number {
  return s.x + s.width / 2
}

function tooltipY(s: StateInfo): number {
  return s.y - 8
}
</script>

<template>
  <div class="state-machine-wrapper">
    <svg
      viewBox="0 0 750 240"
      xmlns="http://www.w3.org/2000/svg"
      class="contract-state-diagram"
      role="img"
      aria-label="Contract lifecycle state machine showing states: ready, in_progress, delivered, done, blocked, and failed"
    >
      <defs>
        <marker id="sm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#2a2a38" />
        </marker>
        <marker id="sm-arrow-success" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#5cc8ff" />
        </marker>

        <!-- Glow filters -->
        <filter id="glow-default" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feFlood flood-color="#a0a0b0" flood-opacity="0.3" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-success" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feFlood flood-color="#5cc8ff" flood-opacity="0.4" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-blocked" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feFlood flood-color="#ffb86c" flood-opacity="0.4" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-failed" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feFlood flood-color="#ff5555" flood-opacity="0.4" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <!-- ═══ Transition arrows ═══ -->

      <!-- Ready -> In Progress -->
      <line x1="150" y1="60" x2="200" y2="60" class="line success" marker-end="url(#sm-arrow-success)" />

      <!-- In Progress -> Delivered -->
      <line x1="340" y1="60" x2="400" y2="60" class="line success" marker-end="url(#sm-arrow-success)" />

      <!-- Delivered -> Done -->
      <line x1="540" y1="60" x2="600" y2="60" class="line success" marker-end="url(#sm-arrow-success)" />

      <!-- Delivered -> Failed -->
      <line x1="470" y1="80" x2="470" y2="140" class="line" marker-end="url(#sm-arrow)" />

      <!-- In Progress -> Failed -->
      <path d="M 340 70 L 370 70 L 370 160 L 400 160" class="line" marker-end="url(#sm-arrow)" />

      <!-- In Progress -> Blocked -->
      <line x1="270" y1="80" x2="270" y2="140" class="line" marker-end="url(#sm-arrow)" />

      <!-- Blocked -> Ready -->
      <path d="M 200 160 L 80 160 L 80 80" class="line" marker-end="url(#sm-arrow)" />

      <!-- Failed -> Ready -->
      <path d="M 470 180 L 470 210 L 120 210 L 120 80" class="line" marker-end="url(#sm-arrow)" />

      <!-- ═══ State boxes ═══ -->
      <g
        v-for="s in states"
        :key="s.id"
        :transform="`translate(${s.x}, ${s.y})`"
        :class="['state-group', { hovered: hoveredState === s.id }]"
        :filter="hoveredState === s.id ? `url(#glow-${s.variant || 'default'})` : undefined"
        @mouseenter="onEnter(s.id)"
        @mouseleave="onLeave"
        @focusin="onEnter(s.id)"
        @focusout="onLeave"
        role="button"
        :tabindex="0"
        :aria-label="`${s.label}: ${s.tooltip}`"
      >
        <rect
          x="0"
          y="0"
          :width="s.width"
          :height="s.height"
          :class="['box', s.variant]"
        />
        <text
          :x="s.width / 2"
          y="20"
          :class="['text', s.variant]"
        >{{ s.label }}</text>
      </g>

      <!-- ═══ Tooltips (rendered last so they sit on top) ═══ -->
      <g
        v-for="s in states"
        :key="`tip-${s.id}`"
        :class="['tooltip-group', { visible: hoveredState === s.id }]"
      >
        <rect
          :x="tooltipX(s) - 140"
          :y="tooltipY(s) - 28"
          width="280"
          height="26"
          rx="4"
          class="tooltip-bg"
        />
        <text
          :x="tooltipX(s)"
          :y="tooltipY(s) - 12"
          class="tooltip-text"
        >{{ s.tooltip }}</text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.state-machine-wrapper {
  width: 100%;
  overflow-x: auto;
}

.contract-state-diagram {
  min-width: 700px;
  max-width: 100%;
  display: block;
}

/* ── State boxes ── */

.contract-state-diagram .box {
  fill: #0a0a0e;
  stroke: #2a2a38;
  stroke-width: 2;
  rx: 6;
  cursor: pointer;
  transition: stroke-opacity 150ms ease;
}

.contract-state-diagram .text {
  fill: #a0a0b0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  text-anchor: middle;
  dominant-baseline: middle;
  pointer-events: none;
  transition: fill-opacity 150ms ease;
}

.contract-state-diagram .line {
  stroke: #2a2a38;
  stroke-width: 2;
  fill: none;
}

/* Variant colors */
.contract-state-diagram .box.success  { stroke: #5cc8ff; }
.contract-state-diagram .text.success { fill: #5cc8ff; }

.contract-state-diagram .box.blocked  { stroke: #ffb86c; }
.contract-state-diagram .text.blocked { fill: #ffb86c; }

.contract-state-diagram .box.failed   { stroke: #ff5555; }
.contract-state-diagram .text.failed  { fill: #ff5555; }

.contract-state-diagram .line.success { stroke: #5cc8ff; }

/* ── Hover glow (state-group level) ── */

.state-group {
  cursor: pointer;
  outline: none;
}

.state-group:focus-visible .box {
  stroke-dasharray: 4 2;
}

/* ── Tooltip ── */

.tooltip-group {
  opacity: 0;
  pointer-events: none;
  transition: opacity 150ms ease;
}

.tooltip-group.visible {
  opacity: 1;
}

.tooltip-bg {
  fill: #141420;
  stroke: #2a2a38;
  stroke-width: 1;
}

.tooltip-text {
  fill: #c0c0c8;
  font-family: 'Inter', -apple-system, sans-serif;
  font-size: 11px;
  text-anchor: middle;
  dominant-baseline: middle;
}

/* ── Reduced motion ── */

@media (prefers-reduced-motion: reduce) {
  .tooltip-group {
    transition: none;
  }

  .contract-state-diagram .box,
  .contract-state-diagram .text {
    transition: none;
  }
}
</style>
