import type { Meta, StoryObj } from '@storybook/react-vite'
import { FocusChip } from './FocusChip'

const meta = {
  title: 'Molecules/FocusChip',
  component: FocusChip,
  args: { countText: '12 de 142 en foco', resetLabel: 'Restablecer', onReset: () => {} },
} satisfies Meta<typeof FocusChip>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
