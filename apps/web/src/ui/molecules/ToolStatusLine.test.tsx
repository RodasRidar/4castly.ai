import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ToolStatusLine } from './ToolStatusLine'

describe('ToolStatusLine', () => {
  it('is a status region with the human text', () => {
    render(<ToolStatusLine text="Consultando el stock de Glicerina…" />)
    expect(screen.getByRole('status')).toHaveTextContent('Consultando el stock de Glicerina…')
  })
  it('has a single status role (spinner is decorative)', () => {
    render(<ToolStatusLine text="Buscando…" />)
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })
})
