import type { Meta, StoryObj } from '@storybook/react-vite'
import { Search } from 'lucide-react'
import { Input } from './Input'

const meta = { title: 'Atoms/Input', component: Input, args: { 'aria-label': 'Correo', placeholder: 'tu@empresa.com' } } satisfies Meta<typeof Input>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const WithLeadingIcon: Story = { args: { leadingIcon: Search, placeholder: 'Buscar producto' } }
export const Error: Story = { args: { invalid: true, defaultValue: 'correo-invalido' } }
export const ReadOnly: Story = { args: { readOnly: true, defaultValue: 'Importadora Acme' } }
export const Disabled: Story = { args: { disabled: true } }
