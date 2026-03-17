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
const menuOpen = ref(false)

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
        <a href="https://chain.sh" target="_blank" rel="noopener" class="nav-chainsh">CHAIN.SH ↗</a>
      </div>
      <div class="nav-links">
        <a href="/reference/protocol">Specification</a>
        <a href="/quick-start">Quick Start</a>
        <a href="/guides/contracts">Guides</a>
        <a href="https://github.com/brainfile" target="_blank" rel="noopener">GitHub</a>
      </div>
      <button class="nav-hamburger" :class="{ open: menuOpen }" @click="menuOpen = !menuOpen" aria-label="mobile navigation" :aria-expanded="menuOpen">
        <span class="container">
          <span class="top" />
          <span class="middle" />
          <span class="bottom" />
        </span>
      </button>
    </nav>
    <div class="nav-mobile" :class="{ open: menuOpen }" @click="menuOpen = false">
      <a href="/reference/protocol">Specification</a>
      <a href="/quick-start">Quick Start</a>
      <a href="/guides/contracts">Guides</a>
      <a href="https://github.com/brainfile" target="_blank" rel="noopener">GitHub</a>
    </div>

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
        <div class="section-header">
          <h2 class="section-title">Contract Lifecycle</h2>
          <div class="section-divider"></div>
        </div>
        <StateMachine />
      </section>

      <!-- How it works -->
      <HowItWorks />

      <!-- Design decisions -->
      <section class="decisions fade-section">
        <div class="section-header">
          <h2 class="section-title">Design Decisions</h2>
          <div class="section-divider"></div>
        </div>
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
        <div class="footer-base">
          <div class="footer-bottom">
            <span class="footer-version">Brainfile v2.0 · Protocol Stable · MIT License</span>
            <a href="https://chain.sh" class="footer-chainsh" target="_blank" rel="noopener">CHAIN.SH ↗</a>
          </div>
          <div class="footer-agents">
            <span class="footer-agent">For agents: <a href="/llms-install.txt">brainfile.md/llms-install.txt</a></span>
          </div>
        </div>
      </footer>
      </div>
    </main>
  </div>
</template>

<style scoped>
.home-root {
  min-height: 100vh;
  background: #0d1117;
  color: #c9d1d9;
  font-family: 'Work Sans', sans-serif;
  -webkit-font-smoothing: antialiased;
  overflow-x: clip;
}

/* ---- Nav ---- */
.home-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 1.5rem;
  height: 64px;
}

.nav-chainsh {
  font-family: 'Work Sans', sans-serif;
  font-weight: 700;
  font-size: 0.8125rem;
  color: #7d8590;
  text-decoration: none;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  transition: color 0.2s;
}

.nav-chainsh:hover {
  color: #c9d1d9;
}

.nav-links {
  display: flex;
  gap: 1.75rem;
}

.nav-hamburger {
  display: none;
  justify-content: center;
  align-items: center;
  width: 48px;
  height: 48px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}

.nav-hamburger .container {
  position: relative;
  width: 16px;
  height: 14px;
  overflow: hidden;
}

.nav-hamburger .top,
.nav-hamburger .middle,
.nav-hamburger .bottom {
  position: absolute;
  width: 16px;
  height: 2px;
  background-color: #c9d1d9;
  transition: top 0.25s, background-color 0.5s, transform 0.25s;
}

.nav-hamburger .top    { top: 0;   left: 0; transform: translateX(0); }
.nav-hamburger .middle { top: 6px; left: 0; transform: translateX(8px); }
.nav-hamburger .bottom { top: 12px; left: 0; transform: translateX(4px); }

.nav-hamburger:hover .top    { top: 0;   transform: translateX(4px); }
.nav-hamburger:hover .middle { top: 6px; transform: translateX(0); }
.nav-hamburger:hover .bottom { top: 12px; transform: translateX(8px); }

.nav-hamburger.open .top    { top: 6px; transform: translateX(0) rotate(225deg); }
.nav-hamburger.open .middle { top: 6px; transform: translateX(16px); }
.nav-hamburger.open .bottom { top: 6px; transform: translateX(0) rotate(135deg); }

.nav-hamburger.open:hover .top,
.nav-hamburger.open:hover .middle,
.nav-hamburger.open:hover .bottom {
  background-color: #9198a1;
  transition: top 0.25s, background-color 0.25s, transform 0.25s;
}

.nav-mobile {
  display: none;
  flex-direction: column;
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 1.5rem;
  overflow: hidden;
  max-height: 0;
  transition: max-height 0.25s ease, padding 0.25s ease;
}

.nav-mobile.open {
  max-height: 300px;
  padding: 1rem 1.5rem;
}

.nav-mobile a {
  font-size: 0.9rem;
  color: #9198a1;
  text-decoration: none;
  padding: 0.6rem 0;
  border-bottom: 1px solid #21262d;
  transition: color 0.15s;
}

.nav-mobile a:last-child {
  border-bottom: none;
}

.nav-mobile a:hover {
  color: #c9d1d9;
}

@media (max-width: 640px) {
  .nav-links { display: none; }
  .nav-hamburger { display: flex; }
  .nav-mobile { display: flex; }
}

.nav-links a {
  font-size: 0.85rem;
  color: #9198a1;
  text-decoration: none;
  transition: color 0.15s;
}

.nav-links a:hover {
  color: #c9d1d9;
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
  overflow: hidden;
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
  color: #c9d1d9;
  margin: 0 0 1.5rem;
}

.headline {
  position: relative;
  font-size: clamp(1.15rem, 2.5vw, 1.35rem);
  line-height: 1.5;
  color: #c9d1d9;
  margin: 0 0 0.75rem;
  max-width: 36ch;
}

.subline {
  position: relative;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
  color: #7d8590;
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
  color: #9198a1;
}

.link-secondary:hover {
  color: #9198a1;
}

.arrow {
  display: inline-block;
  transition: transform 0.15s;
}

.link-primary:hover .arrow,
.link-secondary:hover .arrow {
  transform: translateX(3px);
}

.section-header {
  display: flex;
  align-items: center;
  margin-bottom: 3rem;
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

.code-block {
  background: #161b22;
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
  color: #9198a1;
}

.code-block code {
  font-family: inherit;
}

.code-block .hl-key {
  color: #c9d1d9;
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
  color: #7d8590;
}

.step-keyword {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.9rem;
  font-weight: 500;
  color: #c9d1d9;
}

.step-desc {
  font-size: 0.95rem;
  color: #9198a1;
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
  background: rgba(22, 27, 34, 0.5);
  border: 1px solid #21262d;
  transition: border-color 0.2s;
}

.decision-card:hover {
  border-color: rgba(92, 200, 255, 0.2);
}

.decision-card h3 {
  font-family: 'Outfit', sans-serif;
  font-size: 1rem;
  font-weight: 500;
  color: #c9d1d9;
  margin: 0 0 0.6rem;
  letter-spacing: -0.01em;
}

.decision-card p {
  font-size: 0.85rem;
  color: #7d8590;
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
  color: #7d8590;
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
  background: rgba(22, 27, 34, 0.5);
  border: 1px solid #21262d;
  text-decoration: none;
  transition: border-color 0.2s, background 0.2s;
}

.eco-card:hover {
  border-color: rgba(92, 200, 255, 0.25);
  background: rgba(92, 200, 255, 0.02);
}

.eco-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.eco-icon {
  font-size: 1.25rem;
  color: #7d8590;
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
  color: #c9d1d9;
  transition: color 0.15s;
}

.eco-card:hover .eco-card-name {
  color: #5cc8ff;
}

.eco-card-desc {
  font-size: 0.82rem;
  color: #7d8590;
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
  background: #1c2128;
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
  color: #7d8590;
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
  color: #7d8590;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
  padding: 0;
}

.terminal-copy:hover {
  color: #9198a1;
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
}

.terminal-body {
  background: #161b22;
  padding: 1.5rem;
  overflow-x: auto;
}

.terminal-body pre {
  margin: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  line-height: 1.7;
  color: #9198a1;
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
  color: #9198a1;
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
  color: #9198a1;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 0.5rem;
}

.footer-col a {
  font-size: 0.85rem;
  color: #7d8590;
  text-decoration: none;
  transition: color 0.15s;
}

.footer-col a:hover {
  color: #c9d1d9;
}

.footer-bottom {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-top: 1.5rem;
  border-top: 1px solid #21262d;
}

.footer-base {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.footer-agents {
  padding-top: 0.3rem;
}

.footer-version {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: #7d8590;
}

.footer-chainsh {
  font-family: 'Work Sans', sans-serif;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: #7d8590;
  text-decoration: none;
  transition: color 0.2s;
}

.footer-chainsh:hover {
  color: #c9d1d9;
}

.footer-agent {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: #7d8590;
}

.footer-agent a {
  color: #7d8590;
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
  color: #7d8590;
  margin: 0;
  line-height: 1.6;
  max-width: 58ch;
}


.contract-state-diagram .box { fill: #161b22; stroke: #21262d; stroke-width: 2; rx: 6; }
.contract-state-diagram .text { fill: #9198a1; font-family: 'JetBrains Mono', monospace; font-size: 14px; text-anchor: middle; dominant-baseline: middle; }
.contract-state-diagram .line { stroke: #21262d; stroke-width: 2; fill: none; }

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
  color: #7d8590;
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
  color: #9198a1;
  border-color: rgba(255, 255, 255, 0.15);
  background: rgba(10, 10, 14, 0.95);
}

.copy-overlay-text {
  color: #43d08a;
}

/* ---- Responsive ---- */
@media (max-width: 640px) {
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

  .footer-bottom {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .footer-agents {
    padding-top: 0.5rem;
  }
}
</style>
