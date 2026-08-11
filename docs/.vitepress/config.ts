import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import path from 'path'
import { buildEndGenerateOpenGraphImages } from '@nolebase/vitepress-plugin-og-image/vitepress'

export default withMermaid(defineConfig({
  title: 'brainfile',
  description: 'Markdown task boards you share with your AI agents — CLI, TUI, and MCP server',
  cleanUrls: true,
  ignoreDeadLinks: true,
  appearance: 'force-dark',

  markdown: {
    html: true,
  },

  head: [
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { href: 'https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;700&family=Outfit:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;600;700&display=swap', rel: 'stylesheet' }],

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
          return 'BRAINFILE'
        },
      },
    })(siteConfig)
  },

  // Per-page OG title/description/url (og:image handled by nolebase plugin)
  transformPageData(pageData) {
    pageData.frontmatter ??= {}
    pageData.frontmatter.head ??= []

    const title = pageData.frontmatter.title || pageData.title || 'Brainfile'
    const description = pageData.frontmatter.description || pageData.description || 'Markdown task boards you share with your AI agents — CLI, TUI, and MCP server'
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
      { text: 'Quick Start', link: '/quick-start' },
      { text: 'Guides', link: '/guides/contracts' },
      { text: 'Reference', link: '/reference/commands' },
      { text: 'GitHub', link: 'https://github.com/1broseidon/brainfile' },
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Home', link: '/' },
          { text: 'Quick Start', link: '/quick-start' },
          { text: 'Board Format', link: '/reference/protocol' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'CLI Commands', link: '/reference/commands' },
          { text: 'API Reference', link: '/reference/api' },
          { text: 'Schema Types', link: '/reference/types' },
          { text: 'Base Schema', link: '/types/base' },
          { text: 'Board Schema', link: '/types/board' },
          { text: 'Contract Schema', link: '/reference/contract-schema' },
          { text: 'Contract Object', link: '/types/contract' },
          { text: 'Ledger Schema', link: '/reference/ledger-schema' },
          { text: 'Ledger Query API', link: '/reference/mcp-tools' },
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
          { text: 'Ledger & Context', link: '/guides/ledger' },
          { text: 'AI Agent Integration', link: '/agents/integration' },
        ],
      },
      {
        text: 'Tools',
        items: [
          { text: 'CLI & TUI', link: '/tools/cli' },
          { text: 'MCP Server', link: '/tools/mcp' },
        ],
      },
      {
        text: 'Library',
        items: [
          { text: '@brainfile/core', link: '/tools/core' },
          { text: 'Task Templates', link: '/core/templates' },
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
      { icon: 'github', link: 'https://github.com/1broseidon/brainfile' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/brainfile' },
    ],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 George Dikeakos',
    },
  },
}))
