import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FocusChip } from './FocusChip'

describe('FocusChip', () => {
  it('shows the count text and a reset button', async () => {
    const onReset = vi.fn()
    render(<FocusChip countText="12 de 142 en foco" resetLabel="Restablecer" onReset={onReset} />)
    expect(screen.getByText('12 de 142 en foco')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Restablecer' }))
    expect(onReset).toHaveBeenCalledOnce()
  })
  it('announces count changes politely', () => {
    render(<FocusChip countText="12 de 142 en foco" resetLabel="Restablecer" onReset={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('12 de 142 en foco')
  })
})
