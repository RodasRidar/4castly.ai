import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { ClarificationCard, type ClarificationCardProps } from './ClarificationCard'

const base: Omit<ClarificationCardProps, 'leadTimeValue' | 'stockoutValue' | 'onLeadTimeChange' | 'onStockoutChange'> = {
  title: 'Dos preguntas rápidas',
  leadTime: {
    label: '¿Cuántos días tarda en llegar un pedido de importación?',
    options: [
      { value: '7', label: '7 días' },
      { value: '14', label: '14 días' },
      { value: '30', label: '30 días' },
    ],
    other: { label: 'Otro', inputLabel: 'Días de reposición' },
  },
  stockout: {
    label: '¿Hubo meses en que te quedaste sin stock?',
    options: [
      { value: 'yes', label: 'Sí' },
      { value: 'no', label: 'No' },
      { value: 'unknown', label: 'No lo sé' },
    ],
  },
  calculateLabel: 'Calcular pronóstico',
  skipLabel: 'Omitir y pronosticar ahora',
  onCalculate: () => {},
  onSkip: () => {},
}

function Interactive(props: Partial<ClarificationCardProps>) {
  const [lead, setLead] = useState<string | null>(props.leadTimeValue ?? null)
  const [stock, setStock] = useState<string | null>(props.stockoutValue ?? null)
  return <ClarificationCard {...base} {...props} leadTimeValue={lead} onLeadTimeChange={setLead} stockoutValue={stock} onStockoutChange={setStock} />
}

const meta = { title: 'Organisms/ClarificationCard', component: Interactive } satisfies Meta<typeof Interactive>
export default meta
type Story = StoryObj<typeof meta>

export const LeadTimeOnly: Story = {}
export const WithStockoutQuestion: Story = { args: { showStockoutQuestion: true } }
export const Ready: Story = { args: { showStockoutQuestion: true, leadTimeValue: '14', stockoutValue: 'no' } }
export const Submitting: Story = { args: { leadTimeValue: '14', submitting: true } }
