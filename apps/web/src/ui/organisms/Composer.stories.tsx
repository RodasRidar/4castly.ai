import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Composer, type ComposerProps } from './Composer'

const base = {
  label: 'Mensaje',
  placeholder: 'Pregunta sobre tu pronóstico',
  sendLabel: 'Enviar',
  stopLabel: 'Detener',
  hint: { send: 'para enviar', newline: 'para nueva línea' },
}

function Stateful(props: Partial<ComposerProps> & { initial?: string }) {
  const [value, setValue] = useState(props.initial ?? '')
  return <Composer {...base} onSend={() => setValue('')} {...props} value={value} onChange={setValue} />
}

const meta = {
  title: 'Organisms/Composer',
  component: Composer,
  args: { ...base, value: '', onChange: () => {}, onSend: () => {} },
  decorators: [(Story) => <div className="max-w-xl"><Story /></div>],
} satisfies Meta<typeof Composer>
export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = { render: () => <Stateful /> }
export const WithText: Story = { render: () => <Stateful initial="¿Cuánto debo comprar de glicerina?" /> }
export const Generating: Story = { render: () => <Stateful initial="Texto pendiente" generating onStop={() => {}} /> }
export const Locked: Story = { render: () => <Stateful locked lockedReason="Confirma tus datos para empezar a hacer preguntas." /> }
