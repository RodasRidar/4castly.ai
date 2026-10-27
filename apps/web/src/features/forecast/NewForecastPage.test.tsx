import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../app/testing'

const xlsx = (name = 'ventas_2026.xlsx', size = 2048) => {
  const file = new File(['x'.repeat(size)], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  return file
}

async function attach(user: ReturnType<typeof renderApp>['user'], file: File) {
  await user.upload(await screen.findByLabelText('Seleccionar archivo'), file)
}

const dropOn = (target: Element | Window, files: File[]) =>
  fireEvent.drop(target, { dataTransfer: { types: ['Files'], files } })

describe('NewForecastPage', () => {
  it('empty: shows the upload card, two coming-soon sources and the template link', async () => {
    renderApp({ path: '/nuevo' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Nuevo pronóstico' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Subir un archivo' })).toBeInTheDocument()
    expect(screen.getByText('Google Sheets')).toBeInTheDocument()
    expect(screen.getByText('Base de datos')).toBeInTheDocument()
    expect(screen.getAllByText('Próximamente')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Descargar plantilla' })).toBeEnabled()
    expect(screen.getByText(/Solo tu empresa puede ver tus archivos/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
  })

  it('does not promise limits that are not decided', async () => {
    renderApp({ path: '/nuevo' })
    await screen.findByRole('heading', { level: 1, name: 'Nuevo pronóstico' })
    expect(document.body.textContent).not.toMatch(/3 años|parquet|hasta \d+ ?MB/i)
  })

  it('attached: shows the chip with the size in mono, a status line and enables Continuar', async () => {
    const { user } = renderApp({ path: '/nuevo' })
    await attach(user, xlsx('ventas_2026.xlsx', 2048))
    const chip = await screen.findByTestId('file-chip')
    expect(chip).toHaveTextContent('ventas_2026.xlsx')
    expect(within(chip).getByText(/2 KB/)).toHaveClass('font-mono')
    expect(screen.getByText('Listo para continuar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled()
  })

  it('removes the attached file', async () => {
    const { user } = renderApp({ path: '/nuevo' })
    await attach(user, xlsx())
    await user.click(await screen.findByRole('button', { name: 'Quitar archivo' }))
    expect(screen.queryByTestId('file-chip')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
  })

  it('changes the attached file', async () => {
    const { user } = renderApp({ path: '/nuevo' })
    await attach(user, xlsx('uno.xlsx'))
    await attach(user, xlsx('dos.xlsx'))
    await waitFor(() => expect(screen.getByTestId('file-chip')).toHaveTextContent('dos.xlsx'))
    expect(screen.getByTestId('file-chip')).not.toHaveTextContent('uno.xlsx')
    expect(screen.getByRole('button', { name: 'Cambiar archivo' })).toBeInTheDocument()
  })

  it('accepts a file dropped on the zone', async () => {
    renderApp({ path: '/nuevo' })
    dropOn(await screen.findByTestId('dropzone'), [xlsx('arrastrado.xlsx')])
    expect(await screen.findByTestId('file-chip')).toHaveTextContent('arrastrado.xlsx')
  })

  it('dragging: the whole window is the drop target, without moving the layout', async () => {
    renderApp({ path: '/nuevo' })
    await screen.findByTestId('dropzone')
    const before = screen.getByRole('heading', { level: 1 }).getBoundingClientRect().top
    fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'], files: [] } })
    expect(await screen.findByText('Suelta tu archivo para subirlo')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 }).getBoundingClientRect().top).toBe(before)
    dropOn(document.body, [xlsx('desde-la-ventana.xlsx')])
    expect(await screen.findByTestId('file-chip')).toHaveTextContent('desde-la-ventana.xlsx')
    expect(screen.queryByText('Suelta tu archivo para subirlo')).not.toBeInTheDocument()
  })

  it('upload_error: rejects an unsupported extension with a human message', async () => {
    renderApp({ path: '/nuevo' })
    dropOn(await screen.findByTestId('dropzone'), [new File(['x'], 'foto.png', { type: 'image/png' })])
    expect(await screen.findByRole('alert')).toHaveTextContent('Ese formato no es compatible. Sube un archivo .xlsx, .xls o .csv.')
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
  })

  it('uploading: shows progress and locks the controls, then opens the new digesting conversation', async () => {
    const { user, services, router } = renderApp({ path: '/nuevo' })
    let release: () => void = () => {}
    vi.spyOn(services.uploads, 'put').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    await attach(user, xlsx('ventas_nuevas.xlsx'))
    await user.click(await screen.findByRole('button', { name: 'Continuar' }))
    expect(await screen.findByText('Subiendo tu archivo…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Quitar archivo' })).not.toBeInTheDocument()
    release()
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/c\/[0-9a-f-]{36}$/))
    const id = router.state.location.pathname.split('/')[2]
    expect((await services.conversations.get(id)).stage).toBe('digesting')
    expect(await screen.findByRole('link', { name: /ventas_nuevas/ })).toBeInTheDocument()
  })

  it('upload_error: shows the support reference on a service failure and allows retrying', async () => {
    const { user, services, router } = renderApp({ path: '/nuevo' })
    services.failUpload = true
    await attach(user, xlsx())
    await user.click(await screen.findByRole('button', { name: 'Continuar' }))
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.some((a) => /No pudimos subir tu archivo/.test(a.textContent ?? '') && /K7Q2WX/.test(a.textContent ?? ''))).toBe(true)
    expect(document.body.textContent).not.toMatch(/internal_error/)
    expect(screen.getByTestId('file-chip')).toHaveAttribute('data-state', 'error')

    services.failUpload = false
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/c\//))
  })

  it('speaks English when the language is en', async () => {
    renderApp({ path: '/nuevo', language: 'en', preferences: { locale: 'en' } })
    expect(await screen.findByRole('heading', { level: 1, name: 'New forecast' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download template' })).toBeInTheDocument()
  })

  it('downloads the template through the service, so the request carries the session token', async () => {
    const created = vi.fn(() => 'blob:template')
    URL.createObjectURL = created
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { services, user } = renderApp({ path: '/nuevo' })
    const spy = vi.spyOn(services.uploads, 'downloadTemplate')
    await user.click(await screen.findByRole('button', { name: 'Descargar plantilla' }))
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(created).toHaveBeenCalledTimes(1)
    click.mockRestore()
  })

  it('says so when the template cannot be downloaded', async () => {
    const { services, user } = renderApp({ path: '/nuevo' })
    vi.spyOn(services.uploads, 'downloadTemplate').mockRejectedValue(new Error('boom'))
    await user.click(await screen.findByRole('button', { name: 'Descargar plantilla' }))
    expect(await screen.findByText('No pudimos descargar la plantilla')).toBeInTheDocument()
  })
})
