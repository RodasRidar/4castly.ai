import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { ViewTabs } from './ViewTabs'

const tabs = [
  { value: 'chat', label: 'Chat + resultados' },
  { value: 'portafolio', label: 'Portafolio' },
]

const meta = {
  title: 'Organisms/ViewTabs',
  component: ViewTabs,
  args: { tabs, value: 'chat', onValueChange: () => {}, 'aria-label': 'Vista de resultados' },
} satisfies Meta<typeof ViewTabs>
export default meta
type Story = StoryObj<typeof meta>

export const Chat: Story = {}
export const Portfolio: Story = { args: { value: 'portafolio' } }

function InteractiveTabs() {
  const [value, setValue] = useState('chat')
  return (
    <ViewTabs
      aria-label="Vista de resultados"
      tabs={tabs}
      value={value}
      onValueChange={setValue}
      panels={{ chat: <p className="text-body-md text-body">Conversación y resultados.</p>, portafolio: <p className="text-body-md text-body">Tabla de portafolio.</p> }}
    />
  )
}
export const Interactive: Story = { render: () => <InteractiveTabs /> }
