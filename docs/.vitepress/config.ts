import { defineConfig } from 'vitepress'
import fs from 'fs'
import path from 'path'

export default defineConfig({
  title: 'Brainfile',
  description: 'A protocol-first task management system for the AI era',
  ignoreDeadLinks: true,

  head: [
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap', rel: 'stylesheet' }],
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

            // Handle /example/*.md files
            if (url.startsWith('/example/') && url.endsWith('.md')) {
              const filename = url.split('/example/')[1]
              const filePath = path.resolve(__dirname, '../../example', filename)
              if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8')
                res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
                res.setHeader('Content-Disposition', `inline; filename="${filename}"`)
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

          // Copy example directory files
          const exampleDir = path.resolve(__dirname, '../../example')
          const exampleFiles = fs.readdirSync(exampleDir)
          for (const file of exampleFiles) {
            const filePath = path.join(exampleDir, file)
            if (fs.statSync(filePath).isFile()) {
              const content = fs.readFileSync(filePath, 'utf-8')
              this.emitFile({
                type: 'asset',
                fileName: `example/${file}`,
                source: content,
              })
            }
          }
        },
      },
    ],
  },

  themeConfig: {
    nav: [
      { text: 'Quick Start', link: '/quick-start' },
      { text: 'Tools', link: '/tools/cli' },
      { text: 'Reference', link: '/reference/protocol' },
      { text: 'GitHub', link: 'https://github.com/brainfile' },
    ],

    sidebar: [
      {
        text: 'Start Here',
        items: [
          { text: 'Home', link: '/' },
          { text: 'Quick Start', link: '/quick-start' },
          { text: 'Why Brainfile?', link: '/why' },
        ],
      },
      {
        text: 'Tools',
        items: [
          { text: 'CLI & TUI', link: '/tools/cli' },
          { text: 'MCP Server', link: '/tools/mcp' },
          { text: 'VSCode Extension', link: '/tools/vscode' },
          { text: 'Core Library', link: '/tools/core' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Protocol Specification', link: '/reference/protocol' },
          { text: 'API Reference', link: '/reference/api' },
          { text: 'CLI Commands', link: '/reference/commands' },
          { text: 'Schema Types', link: '/reference/types' },
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
})
