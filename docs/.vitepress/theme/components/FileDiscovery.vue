<script setup lang="ts">
import { ref } from 'vue'

const hovered = ref<string | null>(null)

interface Step {
  id: string
  path: string
  label: string
  tooltip: string
  priority: number
  found: boolean
}

const steps: Step[] = [
  { id: 'v2',     path: '.brainfile/brainfile.md', label: 'v2 directory',   tooltip: 'Preferred — full directory structure with board/ and logs/', priority: 1, found: true },
  { id: 'root',   path: 'brainfile.md',            label: 'root file',      tooltip: 'Legacy single-file mode — still fully supported',            priority: 2, found: true },
  { id: 'hidden', path: '.brainfile.md',            label: 'hidden file',    tooltip: 'Hidden variant — backward compatible',                       priority: 3, found: true },
]
</script>

<template>
  <div class="discovery-wrapper">
    <svg
      viewBox="0 0 680 160"
      xmlns="http://www.w3.org/2000/svg"
      class="discovery-diagram"
      role="img"
      aria-label="Brainfile discovery priority: .brainfile/brainfile.md, then brainfile.md, then .brainfile.md"
    >
      <defs>
        <marker id="fd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#2a2a38" />
        </marker>
        <marker id="fd-arrow-cyan" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#5cc8ff" />
        </marker>
      </defs>

      <!-- Start node -->
      <rect x="10" y="50" width="80" height="40" rx="20" class="pill start" />
      <text x="50" y="74" class="label start-text">discover</text>

      <!-- Arrow from start to first step -->
      <line x1="90" y1="70" x2="130" y2="70" class="line" marker-end="url(#fd-arrow)" />

      <!-- Steps -->
      <g v-for="(step, i) in steps" :key="step.id">
        <!-- Step box -->
        <g
          :class="['step-group', { hovered: hovered === step.id }]"
          @mouseenter="hovered = step.id"
          @mouseleave="hovered = null"
          role="button"
          :tabindex="0"
          :aria-label="`Priority ${step.priority}: ${step.path} — ${step.tooltip}`"
        >
          <rect
            :x="135 + i * 190"
            y="40"
            width="170"
            height="60"
            rx="6"
            class="box"
            :class="{ primary: i === 0 }"
          />
          <!-- Priority badge -->
          <circle
            :cx="150 + i * 190"
            y="40"
            :cy="48"
            r="10"
            class="badge"
            :class="{ primary: i === 0 }"
          />
          <text
            :x="150 + i * 190"
            y="52"
            class="badge-text"
          >{{ step.priority }}</text>

          <!-- Path -->
          <text
            :x="220 + i * 190"
            y="66"
            class="path-text"
            :class="{ primary: i === 0 }"
          >{{ step.path }}</text>

          <!-- Label -->
          <text
            :x="220 + i * 190"
            y="86"
            class="label-text"
          >{{ step.label }}</text>
        </g>

        <!-- Arrow to next step (✗ = not found, try next) -->
        <g v-if="i < steps.length - 1">
          <line
            :x1="305 + i * 190"
            y1="70"
            :x2="325 + i * 190"
            y2="70"
            class="line"
            marker-end="url(#fd-arrow)"
          />
          <text
            :x="315 + i * 190"
            y="62"
            class="miss-text"
          >✗</text>
        </g>

        <!-- Tooltip -->
        <g :class="['tooltip-group', { visible: hovered === step.id }]">
          <rect
            :x="220 + i * 190 - 130"
            y="108"
            width="260"
            height="26"
            rx="4"
            class="tooltip-bg"
          />
          <text
            :x="220 + i * 190"
            y="125"
            class="tooltip-text"
          >{{ step.tooltip }}</text>
        </g>
      </g>

      <!-- Not found terminal -->
      <line x1="495" y1="70" x2="525" y2="70" class="line" marker-end="url(#fd-arrow)" />
      <text x="505" y="62" class="miss-text">✗</text>
      <rect x="530" y="50" width="130" height="40" rx="6" class="box not-found" />
      <text x="595" y="74" class="label not-found-text">not found</text>
    </svg>
  </div>
</template>

<style scoped>
.discovery-wrapper {
  width: 100%;
  overflow-x: auto;
}

.discovery-diagram {
  min-width: 660px;
  max-width: 100%;
  display: block;
}

/* Start pill */
.pill.start {
  fill: #0a0a0e;
  stroke: #5cc8ff;
  stroke-width: 2;
}

.start-text {
  fill: #5cc8ff;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 500;
  text-anchor: middle;
  dominant-baseline: middle;
}

/* Step boxes */
.box {
  fill: #0a0a0e;
  stroke: #2a2a38;
  stroke-width: 2;
  cursor: pointer;
  transition: stroke 150ms ease;
}

.box.primary {
  stroke: #5cc8ff;
}

.step-group:hover .box,
.step-group.hovered .box {
  stroke: #5cc8ff;
}

/* Priority badge */
.badge {
  fill: #1a1a28;
  stroke: #2a2a38;
  stroke-width: 1.5;
}

.badge.primary {
  fill: rgba(92, 200, 255, 0.15);
  stroke: #5cc8ff;
}

.badge-text {
  fill: #a0a0b0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 600;
  text-anchor: middle;
  dominant-baseline: middle;
}

/* Text labels */
.path-text {
  fill: #a0a0b0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  text-anchor: middle;
  dominant-baseline: middle;
}

.path-text.primary {
  fill: #5cc8ff;
}

.label-text {
  fill: #585868;
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  text-anchor: middle;
  dominant-baseline: middle;
}

/* Lines */
.line {
  stroke: #2a2a38;
  stroke-width: 2;
  fill: none;
}

/* Miss indicator */
.miss-text {
  fill: #585868;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  text-anchor: middle;
}

/* Not found */
.box.not-found {
  fill: #0a0a0e;
  stroke: rgba(255, 107, 107, 0.3);
  stroke-width: 2;
  stroke-dasharray: 4 3;
}

.not-found-text {
  fill: #585868;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  text-anchor: middle;
  dominant-baseline: middle;
}

/* Tooltip */
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

.step-group {
  cursor: pointer;
  outline: none;
}

.step-group:focus-visible .box {
  stroke-dasharray: 4 2;
}

@media (prefers-reduced-motion: reduce) {
  .tooltip-group,
  .box {
    transition: none;
  }
}
</style>
