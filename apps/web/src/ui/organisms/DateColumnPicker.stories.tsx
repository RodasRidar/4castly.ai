import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { DateColumnPicker, type DateColumnPickerProps } from './DateColumnPicker'

const columns = [
  { id: 'c1', name: 'Fecha de emisión', samples: ['02/01/2024', '03/01/2024', '04/01/2024'] },
  { id: 'c2', name: 'Fecha de vencimiento', samples: ['31/01/2026', '28/02/2026'] },
  { id: 'c3', name: 'Periodo', samples: ['2024-01', '2024-02'] },
]

function Interactive(props: Partial<DateColumnPickerProps>) {
  const [value, setValue] = useState<string | null>(props.value ?? null)
  return (
    <DateColumnPicker
      label="Columnas que parecen fechas"
      columns={columns}
      noDatesLabel="Mi archivo no tiene fechas"
      onNoDates={() => {}}
      emptyText="No encontré columnas con fechas."
      {...props}
      value={value}
      onSelect={setValue}
    />
  )
}

const meta = { title: 'Organisms/DateColumnPicker', component: Interactive } satisfies Meta<typeof Interactive>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const WithSelection: Story = { args: { value: 'c1' } }
export const Empty: Story = { args: { columns: [] } }
export const Disabled: Story = { args: { disabled: true } }
