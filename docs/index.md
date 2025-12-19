---
layout: home
title: Brainfile
titleTemplate: Task management for the AI era
---

<div class="bf-home">
  <div class="neural-bg">
    <canvas id="neuralCanvas"></canvas>
    <div class="grid-overlay"></div>
    <div class="glow-orb cyan"></div>
    <div class="glow-orb lime"></div>
    <div class="glow-orb magenta"></div>
  </div>
  <section class="hero-custom">
    <div class="hero-copy">
      <div class="hero-badge"><span class="pulse"></span>AI-Native Task Management</div>
      <h1 class="hero-title">Task management<br /><span class="highlight">in your repo</span></h1>
      <p class="hero-subtitle"><strong>One markdown file. Full kanban board.</strong><br />Built for AI agents to read, write, and coordinate tasks directly in your codebase.</p>
    </div>
    <div class="hero-visual" aria-hidden="true">
      <div class="code-window">
        <div class="code-window-header">
          <span class="code-window-dot"></span><span class="code-window-dot"></span><span class="code-window-dot"></span>
          <span class="code-window-title">brainfile.md</span>
        </div>
        <div class="code-window-body">
          <span class="line" style="--bf-line: 0"><span class="code-bracket">---</span></span>
          <span class="line" style="--bf-line: 1"><span class="code-key">type</span>: <span class="code-string">board</span></span>
          <span class="line" style="--bf-line: 2"><span class="code-key">schema</span>: <span class="code-string">https://brainfile.md/v1/board.json</span></span>
          <span class="line" style="--bf-line: 3"><span class="code-key">title</span>: <span class="code-string">Product Development Board</span></span>
          <span class="line" style="--bf-line: 4"><span class="code-key">protocolVersion</span>: <span class="code-string">1.0.0</span></span>
          <span class="line" style="--bf-line: 5"><span class="code-key">agent</span>:</span>
          <span class="line" style="--bf-line: 6"><span class="indent i2"></span><span class="code-key">instructions</span>:</span>
          <span class="line" style="--bf-line: 7"><span class="indent i4"></span>- <span class="code-string">Modify only the YAML frontmatter</span></span>
          <span class="line" style="--bf-line: 8"><span class="indent i4"></span>- <span class="code-string">Preserve all IDs and ordering</span></span>
          <span class="line" style="--bf-line: 9"><span class="code-key">columns</span>:</span>
          <span class="line" style="--bf-line: 10"><span class="indent i2"></span>- <span class="code-key">id</span>: <span class="code-string">todo</span></span>
          <span class="line" style="--bf-line: 11"><span class="indent i4"></span><span class="code-key">title</span>: <span class="code-string">To Do</span></span>
          <span class="line" style="--bf-line: 12"><span class="indent i4"></span><span class="code-key">tasks</span>:</span>
          <span class="line" style="--bf-line: 13"><span class="indent i6"></span>- <span class="code-key">id</span>: <span class="code-string">task-1</span></span>
          <span class="line" style="--bf-line: 14"><span class="indent i8"></span><span class="code-key">title</span>: <span class="code-string">Add user authentication</span></span>
          <span class="line" style="--bf-line: 15"><span class="indent i8"></span><span class="code-key">description</span>: <span class="code-bracket">|</span></span>
          <span class="line" style="--bf-line: 16"><span class="indent i10"></span><span class="code-string">Implement JWT auth with refresh tokens.</span></span>
          <span class="line" style="--bf-line: 17"><span class="indent i10"></span><span class="code-string">- Login/logout endpoints</span></span>
          <span class="line" style="--bf-line: 18"><span class="indent i10"></span><span class="code-string">- Protected routes + middleware</span></span>
          <span class="line" style="--bf-line: 19"><span class="indent i8"></span><span class="code-key">priority</span>: <span class="code-string">high</span></span>
          <span class="line" style="--bf-line: 20"><span class="indent i8"></span><span class="code-key">effort</span>: <span class="code-string">large</span></span>
          <span class="line" style="--bf-line: 21"><span class="indent i8"></span><span class="code-key">tags</span>:</span>
          <span class="line" style="--bf-line: 22"><span class="indent i10"></span>- <span class="code-string">backend</span></span>
          <span class="line" style="--bf-line: 23"><span class="indent i10"></span>- <span class="code-string">security</span></span>
          <span class="line" style="--bf-line: 24"><span class="indent i8"></span><span class="code-key">subtasks</span>:</span>
          <span class="line" style="--bf-line: 25"><span class="indent i10"></span>- <span class="code-key">id</span>: <span class="code-string">task-1-1</span></span>
          <span class="line" style="--bf-line: 26"><span class="indent i12"></span><span class="code-key">title</span>: <span class="code-string">Add JWT utilities</span></span>
          <span class="line" style="--bf-line: 27"><span class="indent i12"></span><span class="code-key">completed</span>: <span class="code-string">true</span></span>
          <span class="line" style="--bf-line: 28"><span class="indent i10"></span>- <span class="code-key">id</span>: <span class="code-string">task-1-2</span></span>
          <span class="line" style="--bf-line: 29"><span class="indent i12"></span><span class="code-key">title</span>: <span class="code-string">Implement login endpoint</span></span>
          <span class="line" style="--bf-line: 30"><span class="indent i12"></span><span class="code-key">completed</span>: <span class="code-string">false</span></span>
          <span class="line" style="--bf-line: 31"><span class="indent i10"></span>- <span class="code-key">id</span>: <span class="code-string">task-1-3</span></span>
          <span class="line" style="--bf-line: 32"><span class="indent i12"></span><span class="code-key">title</span>: <span class="code-string">Write auth tests</span></span>
          <span class="line" style="--bf-line: 33"><span class="indent i12"></span><span class="code-key">completed</span>: <span class="code-string">false</span></span>
          <span class="line" style="--bf-line: 34"><span class="indent i8"></span><span class="code-key">contract</span>:</span>
          <span class="line" style="--bf-line: 35"><span class="indent i10"></span><span class="code-key">status</span>: <span class="code-string">ready</span></span>
          <span class="line" style="--bf-line: 36"><span class="indent i10"></span><span class="code-key">deliverables</span>:</span>
          <span class="line" style="--bf-line: 37"><span class="indent i12"></span>- <span class="code-key">type</span>: <span class="code-string">file</span></span>
          <span class="line" style="--bf-line: 38"><span class="indent i14"></span><span class="code-key">path</span>: <span class="code-string">docs/auth.md</span></span>
          <span class="line" style="--bf-line: 39"><span class="indent i10"></span><span class="code-key">validation</span>:</span>
          <span class="line" style="--bf-line: 40"><span class="indent i12"></span><span class="code-key">commands</span>:</span>
          <span class="line" style="--bf-line: 41"><span class="indent i14"></span>- <span class="code-string">npm test</span></span>
          <span class="line" style="--bf-line: 42"><span class="code-bracket">---</span></span>
        </div>
      </div>
    </div>
    <div class="hero-actions">
      <div class="hero-cta">
        <a href="/quick-start" class="btn btn-primary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          Get Started
        </a>
        <a href="/why" class="btn btn-secondary">Why Brainfile?</a>
      </div>
      <div class="install-block">
        <code>npm install -g @brainfile/cli && brainfile init</code>
        <button class="copy-btn" type="button" :title="copied ? 'Copied!' : 'Copy to clipboard'" :aria-label="copied ? 'Copied!' : 'Copy to clipboard'" @click="copyInstall">
          <svg v-if="!copied" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </button>
      </div>
    </div>
  </section>
  <section class="features-section">
    <span class="section-label">Core Capabilities</span>
    <h2 class="section-title">Built for the age of AI agents</h2>
    <div class="features-grid">
      <div class="feature-card">
        <div class="feature-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" /></svg></div>
        <h3 class="feature-title">Agent Coordination</h3>
        <p class="feature-desc">First-class support for agent-to-agent contracts. Assign work to other AI assistants with clear deliverables.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg></div>
        <h3 class="feature-title">AI Native</h3>
        <p class="feature-desc">Built-in MCP server lets Claude Code, Cursor, and Cline manage your tasks directly. Zero friction.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg></div>
        <h3 class="feature-title">Lives in Your Repo</h3>
        <p class="feature-desc">A single brainfile.md file. Version control friendly. Branch it, merge it, diff it.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg></div>
        <h3 class="feature-title">Multiple Interfaces</h3>
        <p class="feature-desc">Terminal TUI, full CLI, VSCode kanban sidebar. Use what fits your workflow.</p>
      </div>
    </div>
  </section>
  <section class="problem-solution">
    <div class="ps-grid">
      <div class="ps-card problem">
        <span class="ps-label"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>The Problem</span>
        <h3 class="ps-title">Your AI can't see your task board</h3>
        <p class="ps-text">Tasks live in Linear, Jira, or Notion. Code lives in git. Your AI assistant can see your code but has no idea what you're working on. You're constantly context-switching, copy-pasting task descriptions, and manually updating status.</p>
      </div>
      <div class="ps-card solution">
        <span class="ps-label"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>The Solution</span>
        <h3 class="ps-title">Put your board in your repo</h3>
        <p class="ps-text">Brainfile puts your task board in a brainfile.md file right in your repo. It's structured YAML that tools can parse, but it's also just markdown you can read and edit. AI assistants update it directly via MCP — no manual syncing.</p>
      </div>
    </div>
  </section>
  <section class="code-section">
    <span class="section-label">Zero Configuration</span>
    <h2 class="section-title">AI integration in 30 seconds</h2>
    <p class="section-subtitle">Add this to your project's .mcp.json and you're done</p>
    <div class="code-example">
      <div class="code-window">
        <div class="code-window-header">
          <span class="code-window-dot"></span><span class="code-window-dot"></span><span class="code-window-dot"></span>
          <span class="code-window-title">.mcp.json</span>
        </div>
        <div class="code-window-body"><pre><span class="code-bracket">{</span>
  <span class="code-key">"mcpServers"</span>: <span class="code-bracket">{</span>
    <span class="code-key">"brainfile"</span>: <span class="code-bracket">{</span>
      <span class="code-key">"command"</span>: <span class="code-string">"npx"</span>,
      <span class="code-key">"args"</span>: <span class="code-bracket">[</span><span class="code-string">"@brainfile/cli"</span>, <span class="code-string">"mcp"</span><span class="code-bracket">]</span>
    <span class="code-bracket">}</span>
  <span class="code-bracket">}</span>
<span class="code-bracket">}</span></pre></div>
      </div>
    </div>
  </section>
  <section class="integrations-section">
    <span class="section-label">Ecosystem</span>
    <h2 class="section-title">Works with your tools</h2>
    <div class="integration-grid">
      <div class="integration-card"><div class="integration-icon">⌨️</div><div class="integration-name">Terminal TUI</div><div class="integration-desc">Interactive kanban in your terminal</div></div>
      <div class="integration-card"><div class="integration-icon">🖥️</div><div class="integration-name">CLI Commands</div><div class="integration-desc">Add, move, update from command line</div></div>
      <div class="integration-card"><div class="integration-icon">💎</div><div class="integration-name">VSCode Extension</div><div class="integration-desc">Visual board in the sidebar</div></div>
      <div class="integration-card"><div class="integration-icon">🤖</div><div class="integration-name">MCP Server</div><div class="integration-desc">AI assistants manage tasks directly</div></div>
    </div>
  </section>
  <section class="cta-section">
    <h2 class="section-title">Stop copy-pasting. Start shipping.</h2>
    <div class="hero-cta centered">
      <a href="/quick-start" class="btn btn-primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>Get Started Now</a>
      <a href="/reference/protocol" class="btn btn-secondary">Read the Docs</a>
    </div>
    <p class="cta-note">Free &amp; open source. MIT licensed.</p>
  </section>
  <div class="footer-links-custom"><a href="https://github.com/brainfile">GitHub</a><a href="https://www.npmjs.com/package/@brainfile/cli">npm</a><a href="/reference/protocol">Protocol</a></div>
</div>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

const copied = ref(false)
let copiedTimeout = 0
let cleanupNeural = () => {}

async function copyInstall() {
  const code = 'npm install -g @brainfile/cli && brainfile init'

  try {
    await navigator.clipboard.writeText(code)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = code
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }

  copied.value = true
  window.clearTimeout(copiedTimeout)
  copiedTimeout = window.setTimeout(() => {
    copied.value = false
  }, 2000)
}

onMounted(() => {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const canvas = document.getElementById('neuralCanvas')
  if (!canvas || prefersReducedMotion) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  let width = 0
  let height = 0
  let raf = 0
  let nodes = []

  const nodeCount = 50
  const connectionDistance = 200

  const visualViewport = window.visualViewport

  function getViewportSize() {
    const viewportWidth = visualViewport?.width ?? window.innerWidth
    const viewportHeight = visualViewport?.height ?? window.innerHeight

    return {
      width: Math.max(1, Math.floor(viewportWidth)),
      height: Math.max(1, Math.floor(viewportHeight)),
    }
  }

  function resize() {
    const viewportSize = getViewportSize()
    width = viewportSize.width
    height = viewportSize.height

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function createNodes() {
    nodes = []
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: Math.random() * 2 + 1,
      })
    }
  }

  function animate() {
    ctx.clearRect(0, 0, width, height)

    for (const node of nodes) {
      node.x += node.vx
      node.y += node.vy
      if (node.x < 0 || node.x > width) node.vx *= -1
      if (node.y < 0 || node.y > height) node.vy *= -1
    }

    ctx.lineWidth = 1

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x
        const dy = nodes[i].y - nodes[j].y
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance < connectionDistance) {
          const opacity = 1 - distance / connectionDistance
          ctx.strokeStyle = `rgba(0, 255, 204, ${opacity * 0.1})`
          ctx.beginPath()
          ctx.moveTo(nodes[i].x, nodes[i].y)
          ctx.lineTo(nodes[j].x, nodes[j].y)
          ctx.stroke()
        }
      }
    }

    for (const node of nodes) {
      ctx.beginPath()
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0, 255, 204, 0.4)'
      ctx.fill()
    }

    raf = window.requestAnimationFrame(animate)
  }

  function onResize() {
    resize()
    createNodes()
  }

  window.addEventListener('resize', onResize, { passive: true })
  visualViewport?.addEventListener('resize', onResize, { passive: true })

  resize()
  createNodes()
  animate()

  cleanupNeural = () => {
    window.removeEventListener('resize', onResize)
    visualViewport?.removeEventListener('resize', onResize)
    window.cancelAnimationFrame(raf)
  }
})

onBeforeUnmount(() => {
  window.clearTimeout(copiedTimeout)
  cleanupNeural()
})
</script>
