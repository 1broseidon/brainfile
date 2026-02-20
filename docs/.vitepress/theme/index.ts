import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import Layout from './Layout.vue'
import StateMachine from './components/StateMachine.vue'
import ArchitectureDiagram from './components/ArchitectureDiagram.vue'
import ComparisonTable from './components/ComparisonTable.vue'
import StatusBadge from './components/StatusBadge.vue'
import SchemaViewer from './components/SchemaViewer.vue'
import CommandCard from './components/CommandCard.vue'
import RelatedPages from './components/RelatedPages.vue'
import TypeInference from './components/TypeInference.vue'
import PipelineFlow from './components/PipelineFlow.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    // Reusable components — available as <ComponentName /> in any .md file
    app.component('StateMachine', StateMachine)
    app.component('ArchitectureDiagram', ArchitectureDiagram)
    app.component('ComparisonTable', ComparisonTable)
    app.component('StatusBadge', StatusBadge)
    app.component('SchemaViewer', SchemaViewer)
    app.component('CommandCard', CommandCard)
    app.component('RelatedPages', RelatedPages)
    app.component('TypeInference', TypeInference)
    app.component('PipelineFlow', PipelineFlow)
  },
} satisfies Theme
