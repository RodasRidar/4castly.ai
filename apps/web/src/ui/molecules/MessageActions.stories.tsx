import type { Meta, StoryObj } from '@storybook/react-vite'
import { MessageActions } from './MessageActions'

const meta = {
  title: 'Molecules/MessageActions',
  component: MessageActions,
  args: {
    label: 'Acciones del mensaje',
    copyLabel: 'Copiar respuesta',
    retryLabel: 'Reintentar respuesta',
    likeLabel: 'Respuesta útil',
    dislikeLabel: 'Respuesta no útil',
    onCopy: () => {},
    onRetry: () => {},
    onLike: () => {},
    onDislike: () => {},
  },
} satisfies Meta<typeof MessageActions>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Liked: Story = { args: { liked: true } }
export const Disliked: Story = { args: { disliked: true } }
export const WithoutRetry: Story = { args: { onRetry: undefined } }
