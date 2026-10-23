import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ViewTabs } from './ViewTabs'

const tabs = [
  { value: 'chat', label: 'Chat + resultados' },
  { value: 'portafolio', label: 'Portafolio' },
]

describe('ViewTabs', () => {
  it('does not reference a missing panel when no panels are given', () => {
    render(<ViewTabs tabs={tabs} value="chat" onValueChange={() => {}} aria-label="Vista" />)
    for (const tab of screen.getAllByRole('tab')) expect(tab).not.toHaveAttribute('aria-controls')
  })

  it('marks the controlled value as selected', () => {
    render(<ViewTabs aria-label="Vista" tabs={tabs} value="portafolio" onValueChange={() => {}} />)
    expect(screen.getByRole('tab', { name: 'Portafolio' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Chat + resultados' })).toHaveAttribute('aria-selected', 'false')
  })
  it('calls onValueChange when another tab is clicked', async () => {
    const onValueChange = vi.fn()
    render(<ViewTabs aria-label="Vista" tabs={tabs} value="chat" onValueChange={onValueChange} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Portafolio' }))
    expect(onValueChange).toHaveBeenCalledWith('portafolio')
  })
  it('moves selection with the keyboard', async () => {
    function Harness() {
      const [v, setV] = useState('chat')
      return <ViewTabs aria-label="Vista" tabs={tabs} value={v} onValueChange={setV} />
    }
    render(<Harness />)
    screen.getByRole('tab', { name: 'Chat + resultados' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Portafolio' })).toHaveAttribute('aria-selected', 'true'))
  })
  it('renders only the active panel when panels are given', () => {
    render(<ViewTabs aria-label="Vista" tabs={tabs} value="chat" onValueChange={() => {}} panels={{ chat: <p>Panel chat</p>, portafolio: <p>Panel portafolio</p> }} />)
    expect(screen.getByText('Panel chat')).toBeInTheDocument()
    expect(screen.queryByText('Panel portafolio')).toBeNull()
  })
})
