import type { Meta, StoryObj } from '@storybook/react-vite'

import { OtpCell } from './OtpCell'

const meta = { title: 'Atoms/OtpCell', component: OtpCell, args: { 'aria-label': 'Dígito 1', value: '', onChange: () => {} } } satisfies Meta<typeof OtpCell>
export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {}
export const Filled: Story = { args: { value: '4' } }
export const Error: Story = { args: { value: '4', invalid: true } }
