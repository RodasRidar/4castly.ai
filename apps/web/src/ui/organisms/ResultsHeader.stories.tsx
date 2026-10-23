import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from '../atoms/Button'
import { ResultsHeader } from './ResultsHeader'

const meta = {
  title: 'Organisms/ResultsHeader',
  component: ResultsHeader,
  args: {
    navLabel: 'Ruta de navegación',
    breadcrumb: [{ label: 'Proyecciones', href: '/proyecciones' }, { label: 'Insumos químicos 2026', href: '/c/1' }, { label: 'Resultados' }],
    shareLabel: 'Compartir enlace',
    onShare: () => {},
  },
} satisfies Meta<typeof ResultsHeader>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const WithExportMenu: Story = { args: { exportMenu: <Button variant="secondary">Exportar</Button> } }
