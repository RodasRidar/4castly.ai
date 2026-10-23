import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AnswerChips } from './AnswerChips'

const options = [
  { value: '7', label: '7 días' },
  { value: '14', label: '14 días' },
  { value: '30', label: '30 días' },
]
const other = { label: 'Otro', inputLabel: 'Días de reposición', placeholder: 'Ej. 21' }

function Harness({ onChange = () => {} }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState<string | null>(null)
  return (
    <AnswerChips
      label="Tiempo de reposición"
      options={options}
      other={other}
      value={value}
      onChange={(v) => {
        setValue(v)
        onChange(v)
      }}
    />
  )
}

describe('AnswerChips', () => {
  it('renders a labelled group with unselected chips', () => {
    render(<AnswerChips label="Tiempo de reposición" options={options} value={null} onChange={() => {}} />)
    expect(screen.getByRole('group', { name: 'Tiempo de reposición' })).toBeInTheDocument()
    for (const o of options) expect(screen.getByRole('button', { name: o.label })).toHaveAttribute('aria-pressed', 'false')
  })
  it('is single-select and reports the value', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '14 días' }))
    expect(onChange).toHaveBeenLastCalledWith('14')
    expect(screen.getByRole('button', { name: '14 días' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: '30 días' }))
    expect(screen.getByRole('button', { name: '14 días' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '30 días' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('does not show the input until Otro is chosen', async () => {
    render(<Harness />)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Otro' }))
    expect(screen.getByRole('textbox', { name: 'Días de reposición' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Otro' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('reports typed text for Otro', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Otro' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Días de reposición' }), '21')
    expect(onChange).toHaveBeenLastCalledWith('21')
  })
  it('hides the input again when a preset is chosen', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Otro' }))
    await userEvent.click(screen.getByRole('button', { name: '7 días' }))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
  it('disables everything when disabled', () => {
    render(<AnswerChips label="x" options={options} value={null} disabled onChange={() => {}} />)
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled()
  })
})
