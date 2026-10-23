import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VisuallyHidden } from './VisuallyHidden'

describe('VisuallyHidden', () => {
  it('keeps text in the accessibility tree', () => {
    render(<button><VisuallyHidden>Cerrar</VisuallyHidden></button>)
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument()
  })
})
