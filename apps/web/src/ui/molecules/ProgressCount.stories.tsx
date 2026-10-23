import type { Meta, StoryObj } from '@storybook/react-vite'
import { ProgressCount } from './ProgressCount'

const meta = {
  title: 'Molecules/ProgressCount',
  component: ProgressCount,
  args: { label: 'Calculando pronóstico', countText: '87 de 142 productos' },
} satisfies Meta<typeof ProgressCount>
export default meta
type Story = StoryObj<typeof meta>

export const WithCount: Story = {}
export const WithoutCount: Story = { args: { countText: undefined } }
