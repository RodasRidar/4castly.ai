import type { Meta, StoryObj } from '@storybook/react-vite'
import { Database, FileSpreadsheet, Sheet } from 'lucide-react'
import { Button } from '../atoms/Button'
import { SourceCard } from './SourceCard'

const meta = {
  title: 'Organisms/SourceCard',
  component: SourceCard,
  args: { variant: 'upload', title: 'Subir un archivo', description: 'Sube el Kardex exportado de tu sistema.', icon: FileSpreadsheet },
} satisfies Meta<typeof SourceCard>
export default meta
type Story = StoryObj<typeof meta>

export const Upload: Story = { args: { children: <Button>Elegir archivo</Button> } }
export const SoonSheets: Story = { args: { variant: 'soon', title: 'Google Sheets', description: 'Conecta una hoja de cálculo.', icon: Sheet, soonLabel: 'Próximamente' } }
export const SoonDatabase: Story = { args: { variant: 'soon', title: 'Base de datos', description: 'Conecta tu ERP o base de datos.', icon: Database, soonLabel: 'Próximamente' } }
