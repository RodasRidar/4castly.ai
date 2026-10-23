import type { Meta, StoryObj } from '@storybook/react-vite'

import { DateValue } from './DateValue'

const meta = { title: 'Atoms/DateValue', component: DateValue, args: { date: new Date('2026-10-20T12:00:00Z'), now: new Date('2026-10-23T12:00:00Z'), locale: 'es', timeZone: 'UTC' } } satisfies Meta<typeof DateValue>
export default meta
type Story = StoryObj<typeof meta>

export const Absolute: Story = {}
export const Relative: Story = { args: { mode: 'relative' } }
export const English: Story = { args: { locale: 'en' } }
