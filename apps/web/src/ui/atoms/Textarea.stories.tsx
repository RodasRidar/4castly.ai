import type { Meta, StoryObj } from '@storybook/react-vite'

import { Textarea } from './Textarea'

const meta = { title: 'Atoms/Textarea', component: Textarea, args: { 'aria-label': 'Mensaje', placeholder: 'Pregunta algo sobre tus datos' } } satisfies Meta<typeof Textarea>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Autosize: Story = { args: { defaultValue: 'Línea 1\nLínea 2\nLínea 3', maxRows: 4 } }
export const CappedAtMaxRows: Story = { args: { defaultValue: '1\n2\n3\n4\n5\n6\n7\n8', maxRows: 3 } }
export const Error: Story = { args: { invalid: true } }
export const Disabled: Story = { args: { disabled: true } }
