import type { Meta, StoryObj } from '@storybook/react-vite'

import { VisuallyHidden } from './VisuallyHidden'

const meta = { title: 'Atoms/VisuallyHidden', component: VisuallyHidden } satisfies Meta<typeof VisuallyHidden>
export default meta
type Story = StoryObj<typeof meta>

export const HiddenLabel: Story = { render: () => <button type="button" className="rounded-md border border-hairline px-3 py-1 text-ink">★<VisuallyHidden>Marcar como favorito</VisuallyHidden></button> }
