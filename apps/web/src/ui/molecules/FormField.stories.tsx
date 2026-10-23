import type { Meta, StoryObj } from '@storybook/react-vite'
import { Input } from '../atoms/Input'
import { FormField } from './FormField'

const meta = {
  title: 'Molecules/FormField',
  component: FormField,
  args: { label: 'Correo de trabajo', children: (p) => <Input {...p} placeholder="compras@importadora.com" /> },
} satisfies Meta<typeof FormField>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const WithHint: Story = { args: { hint: 'Te enviaremos un código de 6 dígitos' } }
export const Optional: Story = { args: { label: 'Empresa', optionalText: '(opcional)', children: (p) => <Input {...p} placeholder="Importadora Andina S.A." /> } }
export const ErrorState: Story = { args: { error: 'Ingresa un correo válido', children: (p) => <Input {...p} defaultValue="compras@" /> } }
