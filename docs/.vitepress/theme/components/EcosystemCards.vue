<script setup lang="ts">
</script>

<template>
  <section class="ecosystem fade-section">
    <div class="section-header">
      <h2 class="section-title">Ecosystem</h2>
      <div class="section-divider"></div>
    </div>
    <p class="ecosystem-note">Integrations are optional adapters. The protocol comes first.</p>
    <div class="eco-grid">
      <a href="/tools/cli" class="eco-card">
        <div class="eco-card-header">
          <span class="eco-icon">⌘</span>
          <span class="eco-badge eco-badge-stable">stable</span>
        </div>
        <span class="eco-card-name">CLI &amp; TUI</span>
        <span class="eco-card-desc">The reference implementation. Manage boards, contracts, and validation from the terminal.</span>
      </a>
      <a href="/tools/mcp" class="eco-card">
        <div class="eco-card-header">
          <span class="eco-icon">◈</span>
          <span class="eco-badge eco-badge-stable">stable</span>
        </div>
        <span class="eco-card-name">MCP Server</span>
        <span class="eco-card-desc">Expose your board to any LLM. Model Context Protocol bridge for agent integration.</span>
      </a>
      <a href="/tools/core" class="eco-card">
        <div class="eco-card-header">
          <span class="eco-icon">◻</span>
          <span class="eco-badge eco-badge-stable">stable</span>
        </div>
        <span class="eco-card-name">Core Library</span>
        <span class="eco-card-desc">Build your own integrations. TypeScript SDK for parsing, validating, and manipulating boards.</span>
      </a>
      <a href="/tools/pi" class="eco-card">
        <div class="eco-card-header">
          <span class="eco-icon">π</span>
          <span class="eco-badge eco-badge-beta">beta</span>
        </div>
        <span class="eco-card-name">Pi Extension</span>
        <span class="eco-card-desc">Showcase orchestrator integration for multi-agent runs with contract coordination.</span>
      </a>
    </div>
  </section>
</template>

<style scoped>
/* ---- Section: Ecosystem ---- */
.ecosystem {
  padding-bottom: 8rem;
}

.section-header {
  display: flex;
  align-items: center;
  margin-bottom: 2rem;
}

.section-title {
  font-family: 'Work Sans', sans-serif;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4em;
  color: #5cc8ff;
  flex-shrink: 0;
  margin: 0;
}

.section-divider {
  height: 1px;
  flex-grow: 1;
  margin-left: 2rem;
  background: #21262d;
}

.ecosystem-note {
  text-align: center;
}

.ecosystem-note {
  margin: 0 0 1.5rem;
  font-size: 0.88rem;
  color: #585868;
}

.eco-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.eco-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1.25rem 1.5rem;
  background: rgba(10, 10, 14, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  text-decoration: none;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
}

.eco-card:hover {
  border-color: rgba(92, 200, 255, 0.25);
  box-shadow: 0 0 20px rgba(92, 200, 255, 0.06);
  transform: translateY(-2px);
}

.eco-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.eco-icon {
  font-size: 1.25rem;
  color: #585868;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.eco-badge {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem;
  font-weight: 500;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.eco-badge-stable {
  color: #43d08a;
  background: rgba(67, 208, 138, 0.1);
  border: 1px solid rgba(67, 208, 138, 0.2);
}

.eco-badge-beta {
  color: #ffb86c;
  background: rgba(255, 184, 108, 0.1);
  border: 1px solid rgba(255, 184, 108, 0.2);
}

.eco-card-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.9rem;
  font-weight: 500;
  color: #e8e8ec;
  transition: color 0.15s;
}

.eco-card:hover .eco-card-name {
  color: #5cc8ff;
}

.eco-card-desc {
  font-size: 0.82rem;
  color: #585868;
  line-height: 1.5;
}

/* ---- Scroll fade-in animation ---- */
@media (prefers-reduced-motion: no-preference) {
  .fade-section {
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 300ms ease-out, transform 300ms ease-out;
  }

  .fade-section.visible {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ---- Responsive ---- */
@media (max-width: 640px) {
  .eco-grid {
    grid-template-columns: 1fr;
  }

  .ecosystem {
    padding-bottom: 5rem;
  }
}
</style>
