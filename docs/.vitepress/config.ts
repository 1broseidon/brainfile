import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import fs from 'fs'
import path from 'path'
import { buildEndGenerateOpenGraphImages } from '@nolebase/vitepress-plugin-og-image/vitepress'

export default withMermaid(defineConfig({
  title: 'Brainfile',
  description: 'An open protocol for structured task coordination between humans and AI agents',
  cleanUrls: true,
  ignoreDeadLinks: true,
  appearance: 'force-dark',

  markdown: {
    html: true,
  },

  head: [
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { href: 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;600;700&display=swap', rel: 'stylesheet' }],

    // Open Graph (per-page og:image injected by nolebase plugin at buildEnd)
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'Brainfile' }],
  ],

  // Fix EMFILE error on systems with low file watcher limits
  vite: {
    server: {
      watch: {
        usePolling: true,
        interval: 1000,
      },
    },
    plugins: [
      {
        name: 'serve-static-directories',
        configureServer(server) {
          // Serve v1 and example directories during dev
          server.middlewares.use((req, res, next) => {
            const url = req.url || ''

            // Handle /v1 or /v1/
            if (url === '/v1' || url === '/v1/') {
              const htmlPath = path.resolve(__dirname, '../../v1/index.html')
              const content = fs.readFileSync(htmlPath, 'utf-8')
              res.setHeader('Content-Type', 'text/html')
              res.end(content)
              return
            }

            // Handle /v1/*.json files
            if (url.startsWith('/v1/') && url.endsWith('.json')) {
              const filename = url.split('/v1/')[1]
              const jsonPath = path.resolve(__dirname, '../../v1', filename)
              if (fs.existsSync(jsonPath)) {
                const content = fs.readFileSync(jsonPath, 'utf-8')
                res.setHeader('Content-Type', 'application/json')
                res.end(content)
                return
              }
            }

            // Handle /v1/*.html or /v1/*.md files
            if (url.startsWith('/v1/') && (url.endsWith('.html') || url.endsWith('.md'))) {
              const filename = url.split('/v1/')[1]
              const filePath = path.resolve(__dirname, '../../v1', filename)
              if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8')
                res.setHeader('Content-Type', url.endsWith('.md') ? 'text/markdown' : 'text/html')
                res.end(content)
                return
              }
            }

            // Handle /v2 or /v2/
            if (url === '/v2' || url === '/v2/') {
              const htmlPath = path.resolve(__dirname, '../../v2/index.html')
              const content = fs.readFileSync(htmlPath, 'utf-8')
              res.setHeader('Content-Type', 'text/html')
              res.end(content)
              return
            }

            // Handle /v2/*.json files
            if (url.startsWith('/v2/') && url.endsWith('.json')) {
              const filename = url.split('/v2/')[1]
              const jsonPath = path.resolve(__dirname, '../../v2', filename)
              if (fs.existsSync(jsonPath)) {
                const content = fs.readFileSync(jsonPath, 'utf-8')
                res.setHeader('Content-Type', 'application/json')
                res.end(content)
                return
              }
            }

            // Handle /v2/*.html or /v2/*.md files
            if (url.startsWith('/v2/') && (url.endsWith('.html') || url.endsWith('.md'))) {
              const filename = url.split('/v2/')[1]
              const filePath = path.resolve(__dirname, '../../v2', filename)
              if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8')
                res.setHeader('Content-Type', url.endsWith('.md') ? 'text/markdown' : 'text/html')
                res.end(content)
                return
              }
            }

            // Handle /example/** (files under protocol/example/, including nested paths)
            if (url.startsWith('/example/')) {
              const rawPath = (url.split('?')[0] || '').trim()
              const rel = decodeURIComponent(rawPath.replace(/^\/example\//, ''))

              const exampleDir = path.resolve(__dirname, '../../example')
              const filePath = path.resolve(exampleDir, rel)

              // Prevent path traversal
              if (filePath.startsWith(exampleDir) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                const ext = path.extname(filePath).toLowerCase()
                const contentType =
                  ext === '.md'
                    ? 'text/markdown; charset=utf-8'
                    : ext === '.json'
                      ? 'application/json; charset=utf-8'
                      : ext === '.txt'
                        ? 'text/plain; charset=utf-8'
                        : ext === '.yml' || ext === '.yaml'
                          ? 'text/yaml; charset=utf-8'
                          : 'application/octet-stream'

                const content = fs.readFileSync(filePath)
                res.setHeader('Content-Type', contentType)
                res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`)
                res.end(content)
                return
              }
            }

            next()
          })
        },
        generateBundle() {
          // Copy v1 directory files (schemas are now at /v1/*.json)
          const v1Dir = path.resolve(__dirname, '../../v1')
          const v1Files = fs.readdirSync(v1Dir)
          for (const file of v1Files) {
            const filePath = path.join(v1Dir, file)
            if (fs.statSync(filePath).isFile()) {
              const content = fs.readFileSync(filePath, 'utf-8')
              this.emitFile({
                type: 'asset',
                fileName: `v1/${file}`,
                source: content,
              })
            }
          }

          // Copy v2 directory files
          const v2Dir = path.resolve(__dirname, '../../v2')
          const v2Files = fs.readdirSync(v2Dir)
          for (const file of v2Files) {
            const filePath = path.join(v2Dir, file)
            if (fs.statSync(filePath).isFile()) {
              const content = fs.readFileSync(filePath, 'utf-8')
              this.emitFile({
                type: 'asset',
                fileName: `v2/${file}`,
                source: content,
              })
            }
          }

          // Copy example directory files (recursive, includes nested directories like .brainfile/)
          const copyDirRecursive = (srcDir: string, outDir: string) => {
            const entries = fs.readdirSync(srcDir, { withFileTypes: true })
            for (const entry of entries) {
              const srcPath = path.join(srcDir, entry.name)
              const outPath = `${outDir}/${entry.name}`

              if (entry.isDirectory()) {
                copyDirRecursive(srcPath, outPath)
              } else if (entry.isFile()) {
                const content = fs.readFileSync(srcPath)
                this.emitFile({
                  type: 'asset',
                  fileName: outPath,
                  source: content,
                })
              }
            }
          }

          const exampleDir = path.resolve(__dirname, '../../example')
          copyDirRecursive(exampleDir, 'example')
        },
      },
    ],
  },

  buildEnd: async (siteConfig) => {
    await buildEndGenerateOpenGraphImages({
      baseUrl: 'https://brainfile.md',
      templateSvgPath: path.resolve(__dirname, '../public/og-template.svg'),
      category: {
        byCustomGetter: (page) => {
          const p = page.sourceFilePath
          if (p.startsWith('/reference/') || p.startsWith('/types/')) return 'REFERENCE'
          if (p.startsWith('/guides/') || p.startsWith('/cli/')) return 'GUIDE'
          if (p.startsWith('/tools/')) return 'TOOLS'
          return 'PROTOCOL'
        },
      },
    })(siteConfig)
  },

  // Per-page OG title/description/url (og:image handled by nolebase plugin)
  transformPageData(pageData) {
    pageData.frontmatter ??= {}
    pageData.frontmatter.head ??= []

    const title = pageData.frontmatter.title || pageData.title || 'Brainfile'
    const description = pageData.frontmatter.description || pageData.description || 'An open protocol for structured task coordination between humans and AI agents'
    const relativePath = pageData.relativePath.replace(/\.md$/, '').replace(/\/index$/, '')
    const url = `https://brainfile.md/${relativePath === 'index' ? '' : relativePath}`

    pageData.frontmatter.head.push(['meta', { name: 'twitter:card', content: 'summary_large_image' }])
    pageData.frontmatter.head.push(['meta', { name: 'twitter:title', content: title }])
    pageData.frontmatter.head.push(['meta', { name: 'twitter:description', content: description }])
    pageData.frontmatter.head.push(['meta', { property: 'og:title', content: title }])
    pageData.frontmatter.head.push(['meta', { property: 'og:description', content: description }])
    pageData.frontmatter.head.push(['meta', { property: 'og:url', content: url }])
  },

  mermaid: {
    theme: 'base',
    themeVariables: {
      // Node colors — cyan-tinted surface for primary nodes
      primaryColor: '#0d1520',
      primaryBorderColor: 'rgba(92, 200, 255, 0.3)',
      primaryTextColor: '#e8e8ec',
      // Secondary — subtle blue-tinted for decision nodes / alt paths
      secondaryColor: '#111428',
      secondaryBorderColor: 'rgba(107, 138, 255, 0.25)',
      secondaryTextColor: '#e8e8ec',
      // Tertiary — muted for backgrounds / clusters
      tertiaryColor: '#0a0a0f',
      tertiaryBorderColor: 'rgba(255, 255, 255, 0.08)',
      tertiaryTextColor: '#a0a0b0',
      // Lines and edges — visible but not harsh
      lineColor: 'rgba(92, 200, 255, 0.4)',
      textColor: '#e8e8ec',
      // Notes
      noteBkgColor: '#0f111a',
      noteTextColor: '#a0a0b0',
      noteBorderColor: 'rgba(92, 200, 255, 0.15)',
      // Nodes
      nodeBorder: 'rgba(92, 200, 255, 0.3)',
      mainBkg: '#0d1520',
      // Clusters / subgraphs
      clusterBkg: 'rgba(92, 200, 255, 0.04)',
      clusterBorder: 'rgba(92, 200, 255, 0.15)',
      // Sequence diagrams
      actorBkg: '#0d1520',
      actorBorder: 'rgba(92, 200, 255, 0.3)',
      actorTextColor: '#e8e8ec',
      signalColor: '#5cc8ff',
      signalTextColor: '#e8e8ec',
      activationBkgColor: 'rgba(92, 200, 255, 0.08)',
      activationBorderColor: 'rgba(92, 200, 255, 0.3)',
      sequenceNumberColor: '#050508',
      // Labels
      labelBoxBkgColor: '#0d1520',
      labelBoxBorderColor: 'rgba(92, 200, 255, 0.2)',
      labelTextColor: '#e8e8ec',
      edgeLabelBackground: '#0a0a0f',
      labelColor: '#e8e8ec',
      altBackground: 'rgba(92, 200, 255, 0.03)',
      // Typography
      fontFamily: '"Inter", sans-serif',
      fontSize: '13px',
    },
  },

  mermaidPlugin: {
    class: 'mermaid-diagram',
  },

  themeConfig: {
    nav: [
      { text: 'Specification', link: '/reference/protocol' },
      { text: 'Reference', link: '/reference/commands' },
      { text: 'Guides', link: '/guides/contracts' },
      { text: 'Tools', link: '/tools/cli' },
      { text: 'GitHub', link: 'https://github.com/brainfile' },
    ],

    sidebar: [
      {
        text: 'Protocol',
        items: [
          { text: 'Home', link: '/' },
          { text: 'Why this Protocol?', link: '/why' },
          { text: 'Quick Start', link: '/quick-start' },
          { text: 'Specification', link: '/reference/protocol' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'CLI Commands', link: '/reference/commands' },
          { text: 'API Reference', link: '/reference/api' },
          { text: 'Schema Types', link: '/reference/types' },
          { text: 'Contract Schema', link: '/reference/contract-schema' },
          { text: 'Base Schema', link: '/types/base' },
          { text: 'Board Schema', link: '/types/board' },
        ],
      },
      {
        text: 'Guides',
        items: [
          { text: 'Getting Started with Contracts', link: '/guides/getting-started-with-contracts' },
          { text: 'Contract System', link: '/guides/contracts' },
          { text: 'Contract Commands', link: '/cli/contract-commands' },
          { text: 'Agent Workflows', link: '/guides/agent-workflows' },
          { text: 'Orchestration', link: '/guides/orchestration' },
        ],
      },
      {
        text: 'Tools',
        items: [
          { text: 'CLI & TUI', link: '/tools/cli' },
          { text: 'MCP Server', link: '/tools/mcp' },
          { text: 'Pi Extension', link: '/tools/pi' },
        ],
      },
      {
        text: 'Libraries',
        items: [
          { text: 'TypeScript', link: '/tools/core' },
          { text: 'Python', link: '/tools/python' },
        ],
      },
      {
        text: 'Community',
        items: [
          { text: 'Contributing', link: '/contributing' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/brainfile' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/@brainfile/cli' },
    ],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2025 Brainfile',
    },
  },
}))
