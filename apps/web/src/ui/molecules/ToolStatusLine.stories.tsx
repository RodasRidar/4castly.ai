import type { Meta, StoryObj } from '@storybook/react-vite'
import { ToolStatusLine } from './ToolStatusLine'

const meta = {
  title: 'Molecules/ToolStatusLine',
  component: ToolStatusLine,
  args: { text: 'Consultando el stock de Glicerina USP…' },
} satisfies Meta<typeof ToolStatusLine>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
