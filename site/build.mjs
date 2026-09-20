/* brainfile.md — the whole build.
 *
 * The page is rendered from ../MANUAL.md. That file is the single source of
 * truth: it is the manual an agent reads after cloning the repo, it is the
 * manual served at brainfile.md, and it is served verbatim as /llms-full.txt.
 * There is no second copy to drift.
 *
 * MANUAL.md is plain CommonMark — nothing in it is site-specific syntax. The
 * conventions below are how ordinary Markdown becomes the richer components:
 *
 *   # Title                 page title; the paragraphs under it become the hero
 *   ## Heading              a <section>, and one entry in the sticky rail
 *   ### Heading             a mono subhead
 *   #### name — note        a collapsible row; text after " — " is the muted tail
 *   > blockquote            an accent callout
 *   ```console              a terminal block: prompts tinted, comments dimmed
 *   ```console title="X"    the same, with a labelled copy bar
 *   ```yaml / ```json       a plain block, no shell highlighting
 *   | a | b |               a table that scrolls rather than overflowing
 *
 * Read on GitHub, all of that is just a well-formed Markdown document. marked
 * runs at build time only — the page still ships zero framework JavaScript, and
 * the ~15 lines at the bottom are the copy-button handler.
 *
 * Everything in public/ is copied into dist/ untouched: the JSON Schemas under
 * /v1 and /v2 that board frontmatter points at, the llms-*.txt bootstrap files,
 * the favicon, the social image and the CNAME for GitHub Pages.
 */

import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { Marked } from 'marked'

const root = (p) => new URL(p, import.meta.url)

const SITE = 'https://brainfile.md'
const REPO = 'https://github.com/1broseidon/brainfile'
const TAGLINE = 'markdown task boards for you and your agents'

const [md, css, stars] = await Promise.all([
  readFile(root('../MANUAL.md'), 'utf8'),
  readFile(root('src/page.css'), 'utf8'),
  readFile(root('src/stars.json'), 'utf8')
    .then(JSON.parse)
    .catch(() => ({ brainfile: null })),
])

/* Version comes from the repo's own tags, so the site can't drift from what
 * `brainfile --version` reports. Falls back to unversioned rather than guessing. */
let version = ''
try {
  version = execFileSync('git', ['describe', '--tags', '--abbrev=0'], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
} catch {
  version = ''
}

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')

/* ---------- inline ---------- */

const marked = new Marked({ gfm: true })

/* marked's inline pass handles emphasis, links and entities. The only thing it
 * gets wrong for this design is bare <code>, which needs the .inline class. */
const inline = (src) =>
  marked.parseInline(src).replace(/<code>/g, '<code class="inline">')

/* ---------- terminal blocks ---------- */

const SHELL = new Set(['console', 'bash', 'sh', 'shell', 'text', ''])

/* Highlighting is derived from shell shape, not from a grammar: a leading $ or
 * > is a prompt, a # run is a comment, and quoted strings are the argument a
 * reader is most likely scanning for. Everything else stays plain. */
const highlight = (line) => {
  const prompt = line.match(/^(\s*)([$>]) (.*)$/)
  const lead = prompt ? `${prompt[1]}<span class="p">${prompt[2]}</span> ` : ''
  let body = prompt ? prompt[3] : line

  if (/^\s*#/.test(body)) return `${lead}<span class="dim">${esc(body)}</span>`

  let trailing = ''
  const comment = body.match(/^(.*?)(\s+#\s.*)$/)
  if (comment) {
    body = comment[1]
    trailing = `<span class="dim">${esc(comment[2])}</span>`
  }

  const code = esc(body).replace(
    /(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g,
    '<span class="key">$1</span>',
  )
  return lead + code + trailing
}

const terminal = (text, title) => {
  const body = text.split('\n').map(highlight).join('\n')
  const pre = `<pre><code>${body}</code></pre>`
  if (!title) return `      ${pre}`

  /* Copy the commands, not the prompts — pasting a leading $ into a shell is
   * the single most common way a copied install line fails. */
  const copy = text
    .split('\n')
    .map((l) => l.replace(/^(\s*)[$>] /, '$1'))
    .join('\n')

  return `      <div class="copyblock">
        <div class="cb-head">
          <span>${esc(title)}</span>
          <button type="button" data-copy="${esc(copy)}">Copy</button>
        </div>
        ${pre}
      </div>`
}

/* ---------- block rendering ---------- */

const cell = (raw, first) => {
  const bare = raw.match(/^`([^`]+)`$/)
  if (bare) return `<td class="cmd">${esc(bare[1])}</td>`
  return `<td${first ? '' : ' class="no"'}>${inline(raw)}</td>`
}

const table = (t) => {
  const head = t.header.map((h) => `<th>${inline(h.text)}</th>`).join('')
  const rows = t.rows
    .map(
      (r) =>
        `            <tr>${r.map((c, i) => cell(c.text, i === 0)).join('')}</tr>`,
    )
    .join('\n')
  return `      <div class="scroll">
        <table>
          <thead><tr>${head}</tr></thead>
          <tbody>
${rows}
          </tbody>
        </table>
      </div>`
}

/* `note` marks the muted, smaller paragraph style used inside disclosures. */
const block = (tok, note) => {
  switch (tok.type) {
    case 'paragraph':
      return `      <p${note ? ' class="note"' : ''}>${inline(tok.text)}</p>`
    case 'heading':
      return `      <h${tok.depth}>${inline(tok.text)}</h${tok.depth}>`
    case 'code': {
      const [lang = ''] = (tok.lang || '').split(/\s+/)
      const title = (tok.lang || '').match(/title="([^"]+)"/)?.[1]
      if (!SHELL.has(lang)) return `      <pre><code>${esc(tok.text)}</code></pre>`
      return terminal(tok.text, title)
    }
    case 'table':
      return table(tok)
    case 'blockquote':
      return `      <div class="callout">
${tok.tokens.map((t) => block(t, false)).join('\n')}
      </div>`
    case 'list':
      return `      <ul class="plain">
${tok.items.map((i) => `        <li>${inline(i.text)}</li>`).join('\n')}
      </ul>`
    case 'space':
      return ''
    default:
      return tok.raw ? `      ${tok.raw.trim()}` : ''
  }
}

/* ---------- document walk ---------- */

const tokens = marked.lexer(md)

let title = 'brainfile'
const intro = []
const sections = []

/* A #### heading opens a disclosure that swallows every block after it until
 * the next heading of equal or higher rank. Consecutive disclosures are wrapped
 * in one .discs run so their rules meet. */
let current = null
let disc = null

const flushDisc = () => {
  if (!disc) return
  current.blocks.push({ kind: 'discs', items: disc })
  disc = null
}

for (const tok of tokens) {
  if (tok.type === 'heading' && tok.depth === 1) {
    title = tok.text
    continue
  }

  if (tok.type === 'heading' && tok.depth === 2) {
    flushDisc()
    current = { id: slug(tok.text), label: tok.text, blocks: [] }
    sections.push(current)
    continue
  }

  if (!current) {
    if (tok.type === 'paragraph') intro.push(inline(tok.text))
    continue
  }

  if (tok.type === 'heading' && tok.depth === 4) {
    const [name, tail] = tok.text.split(/\s+—\s+/)
    if (!disc) disc = []
    disc.push({ name, tail, blocks: [] })
    continue
  }

  if (tok.type === 'heading' && tok.depth <= 3) flushDisc()

  if (disc) disc[disc.length - 1].blocks.push(tok)
  else current.blocks.push(tok)
}
flushDisc()

if (!sections.length) {
  throw new Error('no ## sections found in MANUAL.md — nothing to render')
}

const renderDiscs = (items) => `      <div class="discs">
${items
  .map(
    (d) => `        <details>
          <summary>${esc(d.name)}${d.tail ? ` <span class="sm">${esc(d.tail)}</span>` : ''}</summary>
          <div class="disc-body">
${d.blocks.map((t) => block(t, t.type === 'paragraph')).join('\n')}
          </div>
        </details>`,
  )
  .join('\n')}
      </div>`

const body = sections
  .map(
    (s) => `      <section id="${s.id}">
        <h2>${esc(s.label)}</h2>
${s.blocks
  .map((b) => (b.kind === 'discs' ? renderDiscs(b.items) : block(b, false)))
  .filter(Boolean)
  .join('\n')}
      </section>`,
  )
  .join('\n\n')

const rail = sections
  .map((s) => `          <li><a href="#${s.id}">${esc(s.label)}</a></li>`)
  .join('\n')

/* The meta description is the first sentence of the manual's own opening
 * paragraph, stripped of markup — one fewer string to keep in sync. */
const plain = (html) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
const description = plain(intro[0] ?? '')

const GH_MARK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>`

const masthead = `  <header class="masthead">
    <span class="mark">${esc(title)}</span>${version ? `\n    <span class="ver">${version}</span>` : ''}
    <nav>
      <a href="/#install">install</a>
      <a class="gh" href="${REPO}">
        ${GH_MARK}${
          typeof stars.brainfile === 'number'
            ? `\n        <span class="stars">${stars.brainfile}</span>`
            : ''
        }
      </a>
    </nav>
  </header>`

/* One <head> for both pages the build writes. */
const shell = ({ pageTitle, pageDescription, path, robots, content }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(pageDescription)}">${robots ? `\n<meta name="robots" content="${robots}">` : ''}
<link rel="canonical" href="${SITE}${path}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:title" content="${esc(pageTitle)}">
<meta property="og:description" content="${esc(pageDescription)}">
<meta property="og:image" content="${SITE}/og-banner.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:wght@400&display=swap">
<style>
${css.trim()}
</style>
</head>
<body>
<div class="wrap">

${masthead}

${content}

</div>
</body>
</html>
`

const html = shell({
  pageTitle: `${title} — ${TAGLINE}`,
  pageDescription: description,
  path: '/',
  content: `  <div class="layout">
    <main class="col">

      <div class="hero">
        <h1>${esc(title)}</h1>
        <div class="rule"></div>
${intro.map((p, i) => `        <p class="${i === 0 ? 'lede' : 'sub'}">${p}</p>`).join('\n')}
      </div>

${body}

      <footer>
        <span>${esc(title)}${version ? ` ${version}` : ''}</span>
        <span>MIT licensed</span>
        <span>Plain Markdown on disk</span>
        <span class="spacer"><a href="https://chain.sh">chain.sh</a></span>
      </footer>

    </main>

    <aside class="rail">
      <nav aria-label="Contents">
        <p class="rail-label">Contents</p>
        <ol>
${rail}
        </ol>
      </nav>
    </aside>
  </div>

<script>
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-copy]')
  if (!btn) return
  navigator.clipboard.writeText(btn.dataset.copy).then(() => {
    const original = btn.textContent
    btn.textContent = 'Copied'
    btn.dataset.copied = '1'
    setTimeout(() => {
      btn.textContent = original
      delete btn.dataset.copied
    }, 1600)
  })
})
</script>`,
})

/* The VitePress site that used to live here is gone, but its URLs are in the
 * wild. GitHub Pages has no server-side redirects, only a 404 page, so the 404
 * page carries the map: everything that folded into the manual lands on its
 * anchor, and what stayed in the repo points at the file on GitHub. Anything
 * else says "not found" honestly rather than bouncing to the top of the page. */
const MOVED = {
  '/quick-start': '/#quickstart',
  '/reference/commands': '/#commands',
  '/cli/contract-commands': '/#contracts',
  '/tools/cli': '/#the-tui',
  '/reference/protocol': '/#the-board-on-disk',
  '/reference/types': '/#the-board-on-disk',
  '/types/base': '/#the-board-on-disk',
  '/types/board': '/#the-board-on-disk',
  '/reference/ledger-schema': '/#the-board-on-disk',
  '/guides/ledger': '/#the-board-on-disk',
  '/types/contract': '/#contracts',
  '/reference/contract-schema': '/#contracts',
  '/guides/contracts': '/#contracts',
  '/guides/getting-started-with-contracts': '/#contracts',
  '/guides/agent-workflows': '/#for-agents',
  '/guides/orchestration': '/#for-agents',
  '/agents/integration': '/#for-agents',
  '/tools/mcp': '/#for-agents',
  '/reference/mcp-tools': '/#for-agents',
  '/core/templates': '/#commands',
  '/tools/core': `${REPO}/tree/main/core`,
  '/reference/api': `${REPO}/blob/main/core/README.md`,
  '/contributing': `${REPO}/blob/main/CONTRIBUTING.md`,
}

const notFound = shell({
  pageTitle: `Not found — ${title}`,
  pageDescription: `This page is not part of the ${title} manual.`,
  path: '/404.html',
  robots: 'noindex',
  content: `  <div class="layout">
    <main class="col">
      <div class="hero">
        <h1>Not found</h1>
        <div class="rule"></div>
        <p class="lede">The documentation is one page now. Whatever was at <code class="inline" id="nf-path">this address</code> is either in <a href="/">the manual</a> or <a href="${REPO}">in the repository</a>.</p>
        <p class="sub">The JSON Schemas under <a href="/v2/index.json">/v2/</a> and the <a href="/llms-install.txt">llms-install.txt</a> bootstrap file have not moved.</p>
      </div>
    </main>
  </div>

<script>
(() => {
  const moved = ${JSON.stringify(MOVED)}
  const path = location.pathname.replace(/\\.html$/, '').replace(/\\/+$/, '') || '/'
  const el = document.getElementById('nf-path')
  if (el) el.textContent = path
  const to = moved[path]
  if (to) location.replace(to)
})()
</script>`,
})

await rm(root('dist'), { recursive: true, force: true })
await mkdir(root('dist'), { recursive: true })
await cp(root('public'), root('dist'), { recursive: true })
await writeFile(root('dist/index.html'), html)
await writeFile(root('dist/404.html'), notFound)
await writeFile(root('dist/llms-full.txt'), md)

const kb = (n) => `${(n / 1024).toFixed(2)} kB`
const discs = sections.reduce(
  (n, s) => n + s.blocks.filter((b) => b.kind === 'discs').reduce((m, b) => m + b.items.length, 0),
  0,
)
console.log(
  `built dist/index.html  ${kb(Buffer.byteLength(html))}  ·  ${sections.length} sections  ·  ${discs} disclosures  ·  ${version || 'no tag'}`,
)
