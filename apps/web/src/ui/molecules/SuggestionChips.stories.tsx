import type { Meta, StoryObj } from '@storybook/react-vite'
import { SuggestionChips } from './SuggestionChips'

const meta = {
  title: 'Molecules/SuggestionChips',
  component: SuggestionChips,
  args: {
    label: 'Preguntas sugeridas',
    suggestions: ['¿Qué productos están en riesgo?', '¿Cuánto ácido cítrico debo comprar?', '¿Cómo se calculó el pronóstico?'],
    onSelect: () => {},
  },
} satisfies Meta<typeof SuggestionChips>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Locked: Story = { args: { locked: true } }
