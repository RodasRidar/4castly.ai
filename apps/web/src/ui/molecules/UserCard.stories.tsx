import type { Meta, StoryObj } from '@storybook/react-vite'
import { UserCard } from './UserCard'

const meta = {
  title: 'Molecules/UserCard',
  component: UserCard,
  args: { name: 'Marta Quispe', company: 'Química Andina S.A.' },
  decorators: [(Story) => <div className="w-64"><Story /></div>],
} satisfies Meta<typeof UserCard>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const MenuOpen: Story = { args: { 'aria-haspopup': 'menu', 'aria-expanded': true } }
