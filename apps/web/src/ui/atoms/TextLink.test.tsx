import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TextLink } from './TextLink'

describe('TextLink', () => {
  it('is a link with an underline and no blue', () => {
    render(<TextLink href="/x">Términos</TextLink>)
    const a = screen.getByRole('link', { name: 'Términos' })
    expect(a).toHaveAttribute('href', '/x')
    expect(a.className).toContain('underline')
  })
  it('opens external links safely in a new tab', () => {
    render(<TextLink href="https://example.com" external>Soporte</TextLink>)
    const a = screen.getByRole('link', { name: /Soporte/ })
    expect(a).toHaveAttribute('target', '_blank')
    expect(a).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })
})
