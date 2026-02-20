<script setup lang="ts">
</script>

<template>
  <div class="architecture-diagram">
    <svg
      viewBox="0 0 600 340"
      xmlns="http://www.w3.org/2000/svg"
      class="arch-svg"
      role="img"
      aria-label="Architecture diagram showing .brainfile directory structure and tool connections"
    >
      <defs>
        <marker
          id="arch-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#5cc8ff" />
        </marker>
      </defs>

      <!-- ═══ Main Repository Box ═══ -->
      <rect x="80" y="16" width="440" height="170" rx="6" class="box-repo" />

      <!-- Header -->
      <text x="300" y="44" class="text-title">Your Repository</text>
      <line x1="80" y1="56" x2="520" y2="56" class="line-divider" />

      <!-- Directory tree -->
      <text x="108" y="84" class="text-dir text-accent">.brainfile/</text>

      <text x="108" y="110" class="text-tree">├──</text>
      <text x="148" y="110" class="text-dir">brainfile.md</text>
      <text x="320" y="110" class="text-comment"># Board config</text>

      <text x="108" y="136" class="text-tree">├──</text>
      <text x="148" y="136" class="text-dir">board/</text>
      <text x="320" y="136" class="text-comment"># Active tasks</text>

      <text x="108" y="162" class="text-tree">└──</text>
      <text x="148" y="162" class="text-dir">logs/</text>
      <text x="320" y="162" class="text-comment"># Completed archive</text>

      <!-- ═══ Connection lines ═══ -->
      <!-- Start dots -->
      <circle cx="160" cy="186" r="2.5" class="conn-dot" />
      <circle cx="300" cy="186" r="2.5" class="conn-dot" />
      <circle cx="440" cy="186" r="2.5" class="conn-dot" />

      <!-- Animated lines -->
      <line x1="160" y1="189" x2="160" y2="262" class="line-conn line-conn-1" marker-end="url(#arch-arrow)" />
      <line x1="300" y1="189" x2="300" y2="262" class="line-conn line-conn-2" marker-end="url(#arch-arrow)" />
      <line x1="440" y1="189" x2="440" y2="262" class="line-conn line-conn-3" marker-end="url(#arch-arrow)" />

      <!-- ═══ Tool boxes ═══ -->
      <!-- CLI -->
      <rect x="100" y="268" width="120" height="44" rx="6" class="box-tool" />
      <text x="160" y="294" class="text-tool">CLI</text>

      <!-- MCP Server -->
      <rect x="240" y="268" width="120" height="44" rx="6" class="box-tool" />
      <text x="300" y="294" class="text-tool">MCP Server</text>

      <!-- AI Agents -->
      <rect x="380" y="268" width="120" height="44" rx="6" class="box-tool" />
      <text x="440" y="294" class="text-tool">AI Agents</text>
    </svg>
  </div>
</template>

<style scoped>
.architecture-diagram {
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
}

.arch-svg {
  width: 100%;
  height: auto;
  display: block;
}

/* ── Boxes ── */

.box-repo {
  fill: #0a0a0e;
  stroke: rgba(255, 255, 255, 0.08);
  stroke-width: 1.5;
}

.box-tool {
  fill: #0a0a0e;
  stroke: #5cc8ff;
  stroke-width: 1.5;
  stroke-opacity: 0.5;
}

/* ── Text ── */

.text-title {
  fill: #e8e8ec;
  font-family: 'Outfit', 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 600;
  text-anchor: middle;
  dominant-baseline: middle;
  letter-spacing: -0.02em;
}

.text-dir {
  fill: #a0a0b0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  dominant-baseline: middle;
}

.text-accent {
  fill: #5cc8ff;
}

.text-tree {
  fill: #383848;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  dominant-baseline: middle;
}

.text-comment {
  fill: #585868;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  dominant-baseline: middle;
}

.text-tool {
  fill: #e8e8ec;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  font-weight: 500;
  text-anchor: middle;
  dominant-baseline: middle;
}

/* ── Lines ── */

.line-divider {
  stroke: rgba(255, 255, 255, 0.06);
  stroke-width: 1;
}

/* ── Connection lines ── */

.conn-dot {
  fill: #5cc8ff;
  opacity: 0.5;
}

.line-conn {
  stroke: #5cc8ff;
  stroke-width: 1.5;
  stroke-opacity: 0.6;
  stroke-dasharray: 6 4;
  animation: dataflow 1.5s linear infinite;
}

.line-conn-2 {
  animation-delay: -0.5s;
}

.line-conn-3 {
  animation-delay: -1s;
}

@keyframes dataflow {
  from {
    stroke-dashoffset: 0;
  }
  to {
    stroke-dashoffset: -10;
  }
}
</style>
