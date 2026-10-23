import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Input } from '../atoms/Input'
import { FormField } from './FormField'

describe('FormField', () => {
  it('labels the control and wires the hint', () => {
    render(<FormField label="Correo" hint="Usa tu correo de trabajo">{(p) => <Input {...p} />}</FormField>)
    const input = screen.getByRole('textbox', { name: 'Correo' })
    expect(input).toHaveAccessibleDescription('Usa tu correo de trabajo')
    expect(input).not.toHaveAttribute('aria-invalid')
  })
  it('shows the optional tag', () => {
    render(<FormField label="Empresa" optionalText="(opcional)">{(p) => <Input {...p} />}</FormField>)
    expect(screen.getByText('(opcional)')).toBeInTheDocument()
  })
  it('error marks the control invalid and replaces the hint in the description', () => {
    render(
      <FormField label="Correo" hint="Pista" error="Correo no válido">
        {(p) => <Input {...p} />}
      </FormField>,
    )
    const input = screen.getByRole('textbox', { name: 'Correo' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(/Correo no válido/)
    expect(screen.getByRole('alert')).toHaveTextContent('Correo no válido')
  })
  it('passes an id and invalid flag to the render prop', () => {
    render(
      <FormField label="Nombre" id="nombre" error="x">
        {(p) => <Input id={p.id} invalid={p.invalid} aria-describedby={p['aria-describedby']} />}
      </FormField>,
    )
    expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveAttribute('id', 'nombre')
  })
})
