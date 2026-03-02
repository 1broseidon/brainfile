<script setup lang="ts">
import { ref } from 'vue'

const hovered = ref<string | null>(null)

interface Stage {
  id: string
  number: string
  label: string
  desc: string
  x: number
}

const stages: Stage[] = [
  { id: 'plan',     number: '01', label: 'plan',     desc: 'Create contract',    x: 20 },
  { id: 'delegate', number: '02', label: 'delegate',  desc: 'Agent picks up',     x: 175 },
  { id: 'validate', number: '03', label: 'validate',  desc: 'QA review',          x: 330 },
  { id: 'complete', number: '04', label: 'complete',  desc: 'Archive to logs/',      x: 485 },
]
</script>

<template>
  <div class="pipeline-wrapper">
    <svg
      viewBox="0 0 650 100"
      xmlns="http://www.w3.org/2000/svg"
      class="pipeline-diagram"
      role="img"
      aria-label="Orchestration pipeline: plan, delegate, validate, complete"
    >
      <defs>
        <marker id="pf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#5cc8ff" />
        </marker>
        <marker id="pf-arrow-dim" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#2a2a38" />
        </marker>
      </defs>

      <!-- Stages -->
      <g v-for="(stage, i) in stages" :key="stage.id">
        <g
          :class="['stage-group', { hovered: hovered === stage.id }]"
          @mouseenter="hovered = stage.id"
          @mouseleave="hovered = null"
          role="button"
          :tabindex="0"
        >
          <rect
            :x="stage.x"
            y="20"
            width="140"
            height="52"
            rx="6"
            class="stage-box"
          />
          <text
            :x="stage.x + 16"
            y="42"
            class="stage-number"
          >{{ stage.number }}</text>
          <text
            :x="stage.x + 42"
            y="42"
            class="stage-label"
          >{{ stage.label }}</text>
          <text
            :x="stage.x + 70"
            y="60"
            class="stage-desc"
          >{{ stage.desc }}</text>
        </g>

        <!-- Arrow to next -->
        <line
          v-if="i < stages.length - 1"
          :x1="stage.x + 140"
          y1="46"
          :x2="stage.x + 155"
          y2="46"
          class="arrow"
          marker-end="url(#pf-arrow)"
        />
      </g>

      <!-- Rework loop arrow: validate back to delegate -->
      <path
        d="M 370 72 L 370 88 L 245 88 L 245 72"
        class="rework-line"
        marker-end="url(#pf-arrow-dim)"
      />
      <text x="308" y="86" class="rework-text">rework</text>
    </svg>
  </div>
</template>

<style scoped>
.pipeline-wrapper {
  width: 100%;
  overflow-x: auto;
}

.pipeline-diagram {
  min-width: 620px;
  max-width: 100%;
  display: block;
}

/* Stage boxes */
.stage-box {
  fill: #0a0a0e;
  stroke: #2a2a38;
  stroke-width: 2;
  cursor: pointer;
  transition: stroke 150ms ease;
}

.stage-group:hover .stage-box,
.stage-group.hovered .stage-box {
  stroke: #5cc8ff;
}

.stage-number {
  fill: #383848;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 600;
  dominant-baseline: middle;
}

.stage-label {
  fill: #e8e8ec;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  font-weight: 500;
  dominant-baseline: middle;
}

.stage-desc {
  fill: #585868;
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  text-anchor: middle;
  dominant-baseline: middle;
}

/* Forward arrows */
.arrow {
  stroke: rgba(92, 200, 255, 0.4);
  stroke-width: 2;
  fill: none;
}

/* Rework loop */
.rework-line {
  stroke: #2a2a38;
  stroke-width: 1.5;
  fill: none;
  stroke-dasharray: 4 3;
}

.rework-text {
  fill: #585868;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  text-anchor: middle;
  dominant-baseline: middle;
}

.stage-group {
  cursor: pointer;
  outline: none;
}

.stage-group:focus-visible .stage-box {
  stroke-dasharray: 4 2;
}

@media (prefers-reduced-motion: reduce) {
  .stage-box {
    transition: none;
  }
}
</style>
