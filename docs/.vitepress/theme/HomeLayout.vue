<script setup lang="ts">
import { useData } from 'vitepress'
import { ref, onMounted, onUnmounted } from 'vue'
import CodeShowcase from './components/CodeShowcase.vue'
import StateMachine from './components/StateMachine.vue'
import HowItWorks from './components/HowItWorks.vue'
import EcosystemCards from './components/EcosystemCards.vue'
import QuickStartTerminal from './components/QuickStartTerminal.vue'

const { site } = useData()

const homeRef = ref<HTMLElement | null>(null)

// IntersectionObserver for scroll-triggered fade-in animations
let observer: IntersectionObserver | null = null

onMounted(() => {
  if (!homeRef.value) return
  const sections = homeRef.value.querySelectorAll('.fade-section')

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible')
          observer?.unobserve(entry.target)
        }
      })
    },
    { threshold: 0.1 }
  )

  sections.forEach((section) => observer?.observe(section))
})

onUnmounted(() => {
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <div class="home-root" ref="homeRef">
    <nav class="home-nav">
      <div class="nav-brand">
        <a href="/" class="nav-wordmark">brainfile</a>
        <span class="version-badge"><span class="status-dot"></span>v2.0</span>
      </div>
      <div class="nav-links">
        <a href="/reference/protocol">Specification</a>
        <a href="/quick-start">Quick Start</a>
        <a href="/guides/contracts">Guides</a>
        <a href="https://github.com/brainfile" target="_blank" rel="noopener">GitHub</a>
      </div>
    </nav>

    <main class="home-content">
      <!-- Section 1: Hero split — text left, code right -->
      <section class="hero-split fade-section">
        <div class="dot-grid-bg"></div>
        <div class="hero-left">
          <h1 class="wordmark">brainfile</h1>
          <p class="headline">An open protocol for agent-to-agent task coordination.</p>
          <p class="subline">Human-in-the-loop compatible. File-system native. MIT licensed.</p>
          <div class="opening-links">
            <a href="/reference/protocol" class="link-primary">Read the Specification <span class="arrow">&rarr;</span></a>
            <a href="/quick-start" class="link-secondary">Quick Start <span class="arrow">&rarr;</span></a>
          </div>
        </div>
        <div class="hero-right">
          <CodeShowcase />
        </div>
      </section>

      <div class="home-inner">
      <!-- Contract Lifecycle -->
      <section class="lifecycle fade-section">
        <span class="section-label">A contract has a lifecycle.</span>
        <StateMachine />
      </section>

      <!-- How it works -->
      <HowItWorks />

      <!-- Design decisions -->
      <section class="decisions fade-section">
        <span class="section-label">Design decisions.</span>
        <div class="decisions-grid">
          <div class="decision-card">
            <h3>Why files?</h3>
            <p>Tasks live in your repo. Git history is your audit trail. No database, no API, no vendor lock-in.</p>
          </div>
          <div class="decision-card">
            <h3>Why contracts?</h3>
            <p>Informal "please do X" breaks down at scale. Structured deliverables and validation commands make agent output verifiable.</p>
          </div>
          <div class="decision-card">
            <h3>Why a protocol?</h3>
            <p>Tools change. Claude, Cursor, Copilot, the next thing. A protocol survives all of them.</p>
          </div>
        </div>
      </section>

      <!-- Ecosystem -->
      <EcosystemCards />

      <!-- Quick Start CTA -->
      <QuickStartTerminal />

      <!-- Section 7: Footer -->
      <footer class="home-footer">
        <div class="footer-columns">
          <div class="footer-col">
            <h4 class="footer-col-title">Protocol</h4>
            <a href="/reference/protocol">Specification</a>
            <a href="/quick-start">Quick Start</a>
            <a href="/guides/contracts">Guides</a>
          </div>
          <div class="footer-col">
            <h4 class="footer-col-title">Tools</h4>
            <a href="/tools/cli">CLI</a>
            <a href="/tools/mcp">MCP Server</a>
            <a href="/tools/core">Core Library</a>
          </div>
          <div class="footer-col">
            <h4 class="footer-col-title">Community</h4>
            <a href="https://github.com/brainfile" target="_blank" rel="noopener">GitHub</a>
            <a href="https://github.com/orgs/brainfile/discussions" target="_blank" rel="noopener">Discussions</a>
            <a href="/contributing">Contributing</a>
          </div>
        </div>
        <div class="footer-bottom">
          <span class="footer-version">Brainfile v2.0 · Protocol Stable · MIT License</span>
          <span class="footer-agent">For agents: <a href="/llms-install.txt">brainfile.md/llms-install.txt</a></span>
        </div>
      </footer>
      </div>
    </main>
  </div>
</template>

<style scoped>
.home-root {
  min-height: 100vh;
  background: #050508;
  color: #e8e8ec;
  font-family: 'Inter', -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* ---- Nav ---- */
.home-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem 1.5rem 0;
}

.nav-wordmark {
  font-family: 'Outfit', sans-serif;
  font-weight: 600;
  font-size: 1.1rem;
  color: #e8e8ec;
  text-decoration: none;
  letter-spacing: -0.02em;
}

.nav-links {
  display: flex;
  gap: 1.75rem;
}

.nav-links a {
  font-size: 0.85rem;
  color: #707080;
  text-decoration: none;
  transition: color 0.15s;
}

.nav-links a:hover {
  color: #e8e8ec;
}

/* ---- Content container ---- */
.home-content {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

.home-inner {
  max-width: 860px;
  margin: 0 auto;
}

/* ---- Section 1: Hero split ---- */
.hero-split {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3rem;
  align-items: center;
  padding-top: 8rem;
  padding-bottom: 6rem;
}

.hero-left {
  position: relative;
}

.hero-right {
  position: relative;
}

.dot-grid-bg {
  position: absolute;
  top: 0;
  left: -50%;
  right: -50%;
  bottom: 0;
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
  background-size: 24px 24px;
  pointer-events: none;
  mask-image: radial-gradient(ellipse 60% 70% at 50% 40%, black 20%, transparent 70%);
  -webkit-mask-image: radial-gradient(ellipse 60% 70% at 50% 40%, black 20%, transparent 70%);
}

.wordmark {
  position: relative;
  font-family: 'Outfit', sans-serif;
  font-weight: 600;
  font-size: clamp(3rem, 7vw, 4.5rem);
  letter-spacing: -0.04em;
  line-height: 1;
  color: #f0f0f4;
  margin: 0 0 1.5rem;
}

.headline {
  position: relative;
  font-size: clamp(1.15rem, 2.5vw, 1.35rem);
  line-height: 1.5;
  color: #c0c0c8;
  margin: 0 0 0.75rem;
  max-width: 36ch;
}

.subline {
  position: relative;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
  color: #585868;
  margin: 0 0 2.5rem;
}

.opening-links {
  position: relative;
  display: flex;
  gap: 2rem;
  align-items: center;
}

.link-primary,
.link-secondary {
  font-size: 0.95rem;
  text-decoration: none;
  transition: color 0.15s;
}

.link-primary {
  color: #5cc8ff;
}

.link-primary:hover {
  color: #8cddff;
}

.link-secondary {
  color: #707080;
}

.link-secondary:hover {
  color: #a0a0b0;
}

.arrow {
  display: inline-block;
  transition: transform 0.15s;
}

.link-primary:hover .arrow,
.link-secondary:hover .arrow {
  transform: translateX(3px);
}

.section-label {
  display: block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: #505060;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 1.25rem;
  text-align: center;
}

.code-block {
  background: #0a0a0e;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 2rem;
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

.code-block .hl-key {
  color: #c8c8d0;
}

/* ---- Section 2b: Contract Lifecycle ---- */
.lifecycle {
  padding-bottom: 8rem;
}

/* ---- Section 3: How it works ---- */
.how-it-works {
  padding-bottom: 8rem;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.step {
  display: flex;
  align-items: baseline;
  gap: 2rem;
  padding: 1.25rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.step:first-child {
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.step-left {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  flex-shrink: 0;
  min-width: 160px;
}

.step-number {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: #383848;
}

.step-keyword {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.9rem;
  font-weight: 500;
  color: #e8e8ec;
}

.step-desc {
  font-size: 0.95rem;
  color: #707080;
  margin: 0;
  line-height: 1.5;
}

/* ---- Design decisions (3-column cards) ---- */
.decisions {
  padding-bottom: 8rem;
}

.decisions-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.decision-card {
  padding: 1.5rem;
  background: rgba(10, 10, 14, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  transition: border-color 0.2s;
}

.decision-card:hover {
  border-color: rgba(92, 200, 255, 0.15);
}

.decision-card h3 {
  font-family: 'Outfit', sans-serif;
  font-size: 1rem;
  font-weight: 500;
  color: #e8e8ec;
  margin: 0 0 0.6rem;
  letter-spacing: -0.01em;
}

.decision-card p {
  font-size: 0.85rem;
  color: #585868;
  margin: 0;
  line-height: 1.6;
}

/* ---- Section 5: Ecosystem (Card Grid) ---- */
.ecosystem {
  padding-bottom: 8rem;
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

/* ---- Section 6: Quick Start Terminal ---- */
.quick-start {
  padding-bottom: 8rem;
}

.terminal {
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  overflow: hidden;
  margin-top: 1.25rem;
}

.terminal-header {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  background: #0c0c12;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.terminal-dots {
  display: flex;
  gap: 6px;
}

.terminal-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.dot-red {
  background: #ff5f57;
  opacity: 0.6;
}

.dot-yellow {
  background: #febc2e;
  opacity: 0.6;
}

.dot-green {
  background: #28c840;
  opacity: 0.6;
}

.terminal-title {
  flex: 1;
  text-align: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  color: #383848;
}

.terminal-copy {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 5px;
  color: #505060;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
  padding: 0;
}

.terminal-copy:hover {
  color: #a0a0b0;
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
}

.terminal-body {
  background: #08080c;
  padding: 1.5rem;
  overflow-x: auto;
}

.terminal-body pre {
  margin: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  line-height: 1.7;
  color: #a0a0b0;
}

.terminal-body code {
  font-family: inherit;
}

.t-prompt {
  color: #43d08a;
  user-select: none;
}

.t-cmd {
  color: #5cc8ff;
}

.t-string {
  color: #ffb86c;
}

.t-output {
  color: #43d08a;
  opacity: 0.7;
}

.quick-start-link {
  display: inline-block;
  margin-top: 1.25rem;
  font-size: 0.9rem;
  color: #707080;
  text-decoration: none;
  transition: color 0.15s;
}

.quick-start-link:hover {
  color: #5cc8ff;
}

.quick-start-link:hover .arrow {
  transform: translateX(3px);
}

/* ---- Section 7: Footer (Column Layout) ---- */
.home-footer {
  padding: 4rem 0 6rem;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  display: flex;
  flex-direction: column;
  gap: 3rem;
}

.footer-columns {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 2rem;
}

.footer-col {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.footer-col-title {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  font-weight: 600;
  color: #707080;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 0.5rem;
}

.footer-col a {
  font-size: 0.85rem;
  color: #505060;
  text-decoration: none;
  transition: color 0.15s;
}

.footer-col a:hover {
  color: #e8e8ec;
}

.footer-bottom {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.footer-version {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: #383848;
}

.footer-agent {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: #2a2a38;
}

.footer-agent a {
  color: #383848;
  text-decoration: none;
  transition: color 0.15s;
}

.footer-agent a:hover {
  color: #5cc8ff;
}


.nav-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.version-badge {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.15rem 0.6rem;
  background: rgba(42, 42, 56, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  color: #a0a0b0;
  font-weight: 500;
}

.status-dot {
  width: 6px;
  height: 6px;
  background: #43d08a; /* subtle green */
  border-radius: 50%;
  box-shadow: 0 0 6px rgba(67, 208, 138, 0.4);
}

.state-machine {
  margin-top: 3rem;
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  background: rgba(10, 10, 14, 0.3);
  padding: 2rem 1rem;
  overflow-x: auto;
}

.contract-state-diagram {
  min-width: 700px;
  max-width: 100%;
}

.step-content {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.step-details {
  font-size: 0.9rem;
  color: #585868;
  margin: 0;
  line-height: 1.6;
  max-width: 58ch;
}


.contract-state-diagram .box { fill: #0a0a0e; stroke: #2a2a38; stroke-width: 2; rx: 6; }
.contract-state-diagram .text { fill: #a0a0b0; font-family: 'JetBrains Mono', monospace; font-size: 14px; text-anchor: middle; dominant-baseline: middle; }
.contract-state-diagram .line { stroke: #2a2a38; stroke-width: 2; fill: none; }

.contract-state-diagram .box.success { stroke: #5cc8ff; }
.contract-state-diagram .text.success { fill: #5cc8ff; }

.contract-state-diagram .box.blocked { stroke: #ffb86c; }
.contract-state-diagram .text.blocked { fill: #ffb86c; }

.contract-state-diagram .box.failed { stroke: #ff5555; }
.contract-state-diagram .text.failed { fill: #ff5555; }

.contract-state-diagram .line.success { stroke: #5cc8ff; }

/* ---- Scroll fade-in animations ---- */
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

/* ---- Copy overlay buttons ---- */
.code-block,
.terminal-body {
  position: relative;
}

.copy-overlay {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.5rem;
  background: rgba(10, 10, 14, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 5px;
  color: #505060;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s, border-color 0.15s;
  z-index: 1;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  line-height: 1;
}

.code-block:hover .copy-overlay,
.terminal-body:hover .copy-overlay {
  opacity: 1;
}

.copy-overlay:hover {
  color: #a0a0b0;
  border-color: rgba(255, 255, 255, 0.15);
  background: rgba(10, 10, 14, 0.95);
}

.copy-overlay-text {
  color: #43d08a;
}

/* ---- Responsive ---- */
@media (max-width: 640px) {
  .home-nav {
    padding-top: 1.5rem;
  }

  .nav-links {
    gap: 1rem;
  }

  .hero-split {
    grid-template-columns: 1fr;
    padding-top: 6rem;
    padding-bottom: 5rem;
  }

  .step {
    flex-direction: column;
    gap: 0.25rem;
  }

  .step-left {
    min-width: unset;
  }
  .state-machine {
    padding: 1.5rem 0.5rem;
  }

  .eco-grid {
    grid-template-columns: 1fr;
  }

  .lifecycle,
  .how-it-works,
  .decisions,
  .ecosystem,
  .quick-start {
    padding-bottom: 5rem;
  }

  .decisions-grid {
    grid-template-columns: 1fr;
  }

  .code-block {
    padding: 1.25rem;
  }

  .code-block pre {
    font-size: 0.72rem;
  }

  .terminal-body pre {
    font-size: 0.72rem;
  }

  .footer-columns {
    grid-template-columns: 1fr;
    gap: 2rem;
  }
}
</style>
