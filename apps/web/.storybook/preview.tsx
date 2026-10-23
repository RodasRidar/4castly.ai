import type { Decorator, Preview } from '@storybook/react-vite'
import '../src/theme/theme.css'

const withTheme: Decorator = (Story, context) => {
  document.documentElement.dataset.theme = context.globals.theme
  return (
    <div className="bg-canvas text-body p-6">
      <Story />
    </div>
  )
}

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: 'Theme',
      toolbar: { title: 'Theme', items: ['light', 'dark'], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: 'light' },
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
}

export default preview
