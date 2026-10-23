import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { ProductSummaryCards, type ProductSummaryCardsProps } from './ProductSummaryCards'

const args: ProductSummaryCardsProps = {
  state: 'populated',
  loadingLabel: 'Cargando resumen del producto',
  stockout: {
    title: 'El stock se acaba el',
    date: new Date('2026-11-10T00:00:00Z'),
    description: 'Si la demanda sigue como se espera, el stock actual no alcanza para más semanas.',
    noRiskTitle: 'Sin riesgo de quiebre',
    noRiskBody: 'El stock alcanza durante todo el horizonte calculado.',
  },
  purchase: {
    title: 'Compra recomendada',
    quantityLabel: 'Cantidad sugerida',
    quantity: 400,
    quantityUnit: 'u',
    buyBeforeLabel: 'Comprar antes de',
    buyBefore: new Date('2026-10-20T00:00:00Z'),
    leadTime: { label: 'Tiempo de reposición', value: 21, unit: 'días', min: 1, max: 120, onChange: () => {}, decrementLabel: 'Reducir tiempo de reposición', incrementLabel: 'Aumentar tiempo de reposición' },
    coverage: { label: 'Cobertura objetivo', value: 8, unit: 'sem', min: 1, max: 52, onChange: () => {}, decrementLabel: 'Reducir cobertura objetivo', incrementLabel: 'Aumentar cobertura objetivo' },
    noPurchaseText: 'No hace falta comprar por ahora.',
  },
  reliability: {
    title: 'Confiabilidad',
    level: 'medium',
    badgeLabel: 'Media',
    explanation: 'Hay historial suficiente, pero la demanda de este producto varía bastante de una semana a otra.',
    detailToggleLabel: 'Ver detalle técnico',
    detail: <p>Modelo usado y errores de validación del producto.</p>,
  },
}

const meta = { title: 'Organisms/ProductSummaryCards', component: ProductSummaryCards, args } satisfies Meta<typeof ProductSummaryCards>
export default meta
type Story = StoryObj<typeof meta>

export const Populated: Story = {}
export const NoRiskInHorizon: Story = { args: { state: 'no-risk' } }
export const Loading: Story = { args: { state: 'loading' } }
export const Mobile390: Story = { render: (a) => <div className="w-[390px]"><ProductSummaryCards {...a} /></div> }

function EditableCards() {
  const [lead, setLead] = useState(21)
  const [cov, setCov] = useState(8)
  return (
    <ProductSummaryCards
      {...args}
      purchase={{ ...args.purchase, leadTime: { ...args.purchase.leadTime, value: lead, onChange: setLead }, coverage: { ...args.purchase.coverage, value: cov, onChange: setCov } }}
    />
  )
}
export const Interactive: Story = { render: () => <EditableCards /> }
