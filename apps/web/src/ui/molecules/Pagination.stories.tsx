import type { Meta, StoryObj } from '@storybook/react-vite'
import { Pagination } from './Pagination'

const meta = {
  title: 'Molecules/Pagination',
  component: Pagination,
  args: {
    page: 2,
    total: 8,
    pageText: 'Página 2 de 8',
    label: 'Paginación de productos',
    prevLabel: 'Página anterior',
    nextLabel: 'Página siguiente',
    onPageChange: () => {},
  },
} satisfies Meta<typeof Pagination>
export default meta
type Story = StoryObj<typeof meta>

export const Middle: Story = {}
export const FirstPage: Story = { args: { page: 1, pageText: 'Página 1 de 8' } }
export const LastPage: Story = { args: { page: 8, pageText: 'Página 8 de 8' } }
