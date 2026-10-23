import type { Meta, StoryObj } from '@storybook/react-vite'
import { OtpInput } from './OtpInput'

const meta = {
  title: 'Molecules/OtpInput',
  component: OtpInput,
  args: { groupLabel: 'Código de verificación', cellLabel: (i: number) => `Dígito ${i + 1}`, onComplete: () => {} },
} satisfies Meta<typeof OtpInput>
export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {}
export const Filled: Story = { args: { value: '482913' } }
export const ErrorState: Story = { args: { value: '482913', invalid: true } }
export const Disabled: Story = { args: { disabled: true } }
