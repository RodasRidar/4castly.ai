import type { Meta, StoryObj } from '@storybook/react-vite'
import { ColumnHeader } from './ColumnHeader'

const meta = {
  title: 'Molecules/ColumnHeader',
  component: ColumnHeader,
  args: { label: 'Riesgo' },
  decorators: [
    (Story) => (
      <table className="w-64">
        <thead>
          <tr>
            <Story />
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-3 py-2 text-body-md text-ink">Ácido cítrico 25 kg</td>
          </tr>
        </tbody>
      </table>
    ),
  ],
} satisfies Meta<typeof ColumnHeader>
export default meta
type Story = StoryObj<typeof meta>

export const NotSortable: Story = {}
export const SortNone: Story = { args: { sort: 'none', sortLabel: 'Ordenar por Riesgo', onSort: () => {} } }
export const SortAscending: Story = { args: { sort: 'asc', sortLabel: 'Ordenar por Riesgo', onSort: () => {} } }
export const SortDescending: Story = { args: { sort: 'desc', sortLabel: 'Ordenar por Riesgo', onSort: () => {} } }
export const Sticky: Story = { args: { sticky: true, sort: 'none', sortLabel: 'Ordenar por Riesgo', onSort: () => {} } }
