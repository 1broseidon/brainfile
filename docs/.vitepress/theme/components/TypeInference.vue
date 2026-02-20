<script setup lang="ts">
import { ref } from 'vue'

const hovered = ref<string | null>(null)

interface Check {
  id: string
  question: string
  result: string
  y: number
}

const checks: Check[] = [
  { id: 'type',    question: 'has type field?',     result: 'Use declared type',  y: 30 },
  { id: 'schema',  question: 'has schema URL?',     result: 'Infer from URL',     y: 80 },
  { id: 'suffix',  question: 'filename suffix?',    result: 'Infer from suffix',  y: 130 },
  { id: 'columns', question: 'has columns array?',  result: '→ Board type',       y: 180 },
]
</script>

<template>
  <div class="inference-wrapper">
    <svg
      viewBox="0 0 600 260"
      xmlns="http://www.w3.org/2000/svg"
      class="inference-diagram"
      role="img"
      aria-label="Type inference: checks type field, schema URL, filename suffix, then columns array"
    >
      <defs>
        <marker id="ti-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#2a2a38" />
        </marker>
        <marker id="ti-arrow-cyan" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#5cc8ff" />
        </marker>
      </defs>

      <!-- Start node -->
      <rect x="20" y="10" width="100" height="32" rx="16" class="pill" />
      <text x="70" y="30" class="start-text">📄 file loaded</text>

      <!-- Vertical line from start -->
      <line x1="70" y1="42" x2="70" y2="50" class="line" marker-end="url(#ti-arrow)" />

      <!-- Check rows -->
      <g v-for="(check, i) in checks" :key="check.id">
        <!-- Question box -->
        <g
          :class="['check-group', { hovered: hovered === check.id }]"
          @mouseenter="hovered = check.id"
          @mouseleave="hovered = null"
          role="button"
          :tabindex="0"
        >
          <rect
            x="20"
            :y="check.y"
            width="200"
            height="36"
            rx="6"
            class="check-box"
          />
          <text
            x="120"
            :y="check.y + 22"
            class="check-text"
          >{{ check.question }}</text>
        </g>

        <!-- ✓ arrow to result -->
        <line
          x1="220"
          :y1="check.y + 18"
          x2="330"
          :y2="check.y + 18"
          class="line yes"
          marker-end="url(#ti-arrow-cyan)"
        />
        <text
          x="270"
          :y="check.y + 12"
          class="yes-label"
        >✓</text>

        <!-- Result box -->
        <rect
          x="335"
          :y="check.y"
          width="200"
          height="36"
          rx="6"
          class="result-box"
        />
        <text
          x="435"
          :y="check.y + 22"
          class="result-text"
        >{{ check.result }}</text>

        <!-- ✗ arrow down to next check -->
        <g v-if="i < checks.length - 1">
          <line
            x1="70"
            :y1="check.y + 36"
            x2="70"
            :y2="check.y + 50"
            class="line"
            marker-end="url(#ti-arrow)"
          />
          <text
            x="82"
            :y="check.y + 46"
            class="no-label"
          >✗</text>
        </g>
      </g>

      <!-- Default fallback -->
      <line x1="70" y1="216" x2="70" y2="230" class="line" marker-end="url(#ti-arrow)" />
      <text x="82" y="226" class="no-label">✗</text>
      <rect x="20" y="232" width="200" height="28" rx="6" class="default-box" />
      <text x="120" y="250" class="default-text">⚙️ Default: Board</text>
    </svg>
  </div>
</template>

<style scoped>
.inference-wrapper {
  width: 100%;
  overflow-x: auto;
}

.inference-diagram {
  min-width: 560px;
  max-width: 100%;
  display: block;
}

/* Start pill */
.pill {
  fill: #0a0a0e;
  stroke: #5cc8ff;
  stroke-width: 2;
}

.start-text {
  fill: #5cc8ff;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 500;
  text-anchor: middle;
  dominant-baseline: middle;
}

/* Check boxes (questions) */
.check-box {
  fill: #0a0a0e;
  stroke: #2a2a38;
  stroke-width: 2;
  cursor: pointer;
  transition: stroke 150ms ease;
}

.check-group:hover .check-box,
.check-group.hovered .check-box {
  stroke: #5cc8ff;
}

.check-text {
  fill: #a0a0b0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  text-anchor: middle;
  dominant-baseline: middle;
  pointer-events: none;
}

/* Result boxes */
.result-box {
  fill: #0a0a0e;
  stroke: rgba(92, 200, 255, 0.25);
  stroke-width: 1.5;
}

.result-text {
  fill: #5cc8ff;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  text-anchor: middle;
  dominant-baseline: middle;
}

/* Default fallback */
.default-box {
  fill: #0a0a0e;
  stroke: #2a2a38;
  stroke-width: 1.5;
  stroke-dasharray: 4 3;
}

.default-text {
  fill: #585868;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  text-anchor: middle;
  dominant-baseline: middle;
}

/* Lines */
.line {
  stroke: #2a2a38;
  stroke-width: 2;
  fill: none;
}

.line.yes {
  stroke: rgba(92, 200, 255, 0.4);
}

/* Labels */
.yes-label {
  fill: #5cc8ff;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 600;
  text-anchor: middle;
}

.no-label {
  fill: #585868;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
}

.check-group {
  cursor: pointer;
  outline: none;
}

.check-group:focus-visible .check-box {
  stroke-dasharray: 4 2;
}

@media (prefers-reduced-motion: reduce) {
  .check-box {
    transition: none;
  }
}
</style>
