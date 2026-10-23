import type { Meta, StoryObj } from '@storybook/react-vite'
import { TextLink } from './TextLink'

const meta = { title: 'Atoms/TextLink', component: TextLink, args: { href: '#', children: 'Términos' } } satisfies Meta<typeof TextLink>
export default meta
type Story = StoryObj<typeof meta>

export const Inline: Story = {}
export const External: Story = { args: { external: true, children: 'Soporte' } }
