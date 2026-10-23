import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { AnswerChips, type AnswerChipsProps } from './AnswerChips'

function Controlled(args: AnswerChipsProps) {
  const [value, setValue] = useState<string | null>(args.value)
  return <AnswerChips {...args} value={value} onChange={setValue} />
}

const options = [
  { value: '7', label: '7 días' },
  { value: '14', label: '14 días' },
  { value: '30', label: '30 días' },
]

const meta = {
  title: 'Molecules/AnswerChips',
  component: AnswerChips,
  args: {
    label: '¿Cuánto demora en llegar la reposición?',
    options,
    other: { label: 'Otro', inputLabel: 'Días de reposición', placeholder: 'Ej. 21' },
    value: null,
    onChange: () => {},
  },
  render: (args) => <Controlled {...args} />,
} satisfies Meta<typeof AnswerChips>
export default meta
type Story = StoryObj<typeof meta>

export const Unanswered: Story = {}
export const Answered: Story = { args: { value: '14' } }
export const OtherWithValue: Story = { args: { value: '21' } }
export const Disabled: Story = { args: { disabled: true, value: '7' } }
