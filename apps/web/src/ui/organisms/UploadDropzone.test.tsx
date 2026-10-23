import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UploadDropzone, type UploadDropzoneProps } from './UploadDropzone'

const copy = {
  prompt: 'Arrastra tu archivo Kardex aquí o elígelo',
  hint: 'Excel (.xlsx, .xls)',
  inputLabel: 'Archivo Kardex',
  changeLabel: 'Cambiar archivo',
  removeLabel: 'Quitar archivo',
  uploadingText: 'Subiendo archivo…',
  errorText: 'No se pudo subir el archivo',
  windowDropLabel: 'Suelta el archivo para subirlo',
}
const file = new File(['x'], 'kardex_enero.xlsx')
const files = (f: File[]) => ({ dataTransfer: { types: ['Files'], files: f } })

function setup(props: Partial<UploadDropzoneProps> = {}) {
  const onFile = vi.fn()
  const utils = render(<UploadDropzone state="empty" onFile={onFile} accept=".xlsx,.xls" {...copy} {...props} />)
  const input = utils.container.querySelector('input[type="file"]') as HTMLInputElement
  return { onFile, input, ...utils }
}

describe('UploadDropzone', () => {
  it('empty: shows the prompt and a keyboard-accessible button that opens the picker', async () => {
    const { input } = setup()
    expect(screen.getByText(copy.hint)).toBeInTheDocument()
    expect(input).toHaveAttribute('accept', '.xlsx,.xls')
    const click = vi.spyOn(input, 'click')
    const button = screen.getByRole('button', { name: new RegExp(copy.prompt) })
    await userEvent.tab()
    expect(button).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(click).toHaveBeenCalledTimes(1)
  })
  it('reports the file chosen in the picker', async () => {
    const { input, onFile } = setup()
    await userEvent.upload(input, file)
    expect(onFile).toHaveBeenCalledWith(file)
  })
  it('dragging over the zone shows the dragging state and dropping reports the file', () => {
    const { container, onFile } = setup()
    const zone = container.querySelector('[data-testid="dropzone"]') as HTMLElement
    expect(zone).toHaveAttribute('data-state', 'empty')
    fireEvent.dragEnter(zone, files([file]))
    expect(zone).toHaveAttribute('data-state', 'dragging')
    fireEvent.dragLeave(zone, files([file]))
    expect(zone).toHaveAttribute('data-state', 'empty')
    fireEvent.dragEnter(zone, files([file]))
    fireEvent.drop(zone, files([file]))
    expect(onFile).toHaveBeenCalledWith(file)
    expect(zone).toHaveAttribute('data-state', 'empty')
  })
  it('can be forced into the dragging state', () => {
    setup({ state: 'dragging' })
    expect(screen.getByTestId('dropzone')).toHaveAttribute('data-state', 'dragging')
  })
  it('attached: shows the file chip with change and remove', async () => {
    const onRemove = vi.fn()
    const { input } = setup({ state: 'attached', file: { name: 'kardex_enero.xlsx', size: '1,2 MB' }, onRemove })
    expect(screen.getByTestId('file-chip')).toHaveAttribute('data-state', 'idle')
    expect(screen.getByText('1,2 MB')).toBeInTheDocument()
    const click = vi.spyOn(input, 'click')
    await userEvent.click(screen.getByRole('button', { name: copy.changeLabel }))
    expect(click).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: copy.removeLabel }))
    expect(onRemove).toHaveBeenCalled()
  })
  it('uploading: shows progress text and is busy', () => {
    setup({ state: 'uploading', file: { name: 'kardex_enero.xlsx' } })
    expect(screen.getByTestId('file-chip')).toHaveAttribute('data-state', 'uploading')
    expect(screen.getByText(copy.uploadingText)).toBeInTheDocument()
  })
  it('does not accept drops while uploading', () => {
    const { onFile } = setup({ state: 'uploading', file: { name: 'kardex_enero.xlsx' } })
    fireEvent.drop(screen.getByTestId('dropzone'), files([file]))
    expect(onFile).not.toHaveBeenCalled()
  })
  it('upload_error without file: announces the error and keeps the picker', () => {
    setup({ state: 'upload_error' })
    expect(screen.getByRole('alert')).toHaveTextContent(copy.errorText)
    expect(screen.getByRole('button', { name: new RegExp(copy.prompt) })).toBeInTheDocument()
  })
  it('upload_error with file: the chip carries the error', () => {
    setup({ state: 'upload_error', file: { name: 'kardex_enero.xlsx' } })
    expect(screen.getByTestId('file-chip')).toHaveAttribute('data-state', 'error')
    expect(screen.getByRole('alert')).toHaveTextContent(copy.errorText)
  })
  it('renders the status line slot', () => {
    setup({ state: 'attached', file: { name: 'a.xlsx' }, statusLine: <span>Listo para continuar</span> })
    expect(screen.getByText('Listo para continuar')).toBeInTheDocument()
  })
  describe('windowDrop', () => {
    it('shows an overlay while a file is dragged over the window and hides it on leave', () => {
      setup({ windowDrop: true })
      expect(screen.queryByText(copy.windowDropLabel)).toBeNull()
      fireEvent.dragEnter(window, files([file]))
      expect(screen.getByText(copy.windowDropLabel)).toBeInTheDocument()
      fireEvent.dragLeave(window, files([file]))
      expect(screen.queryByText(copy.windowDropLabel)).toBeNull()
    })
    it('reports a file dropped anywhere and hides the overlay', () => {
      const { onFile } = setup({ windowDrop: true })
      fireEvent.dragEnter(window, files([file]))
      fireEvent.drop(window, files([file]))
      expect(onFile).toHaveBeenCalledWith(file)
      expect(screen.queryByText(copy.windowDropLabel)).toBeNull()
    })
    it('ignores non-file drags', () => {
      setup({ windowDrop: true })
      fireEvent.dragEnter(window, { dataTransfer: { types: ['text/plain'], files: [] } })
      expect(screen.queryByText(copy.windowDropLabel)).toBeNull()
    })
    it('does not report twice when dropping on the zone', () => {
      const { onFile } = setup({ windowDrop: true })
      const zone = screen.getByTestId('dropzone')
      fireEvent.dragEnter(zone, files([file]))
      fireEvent.drop(zone, files([file]))
      expect(onFile).toHaveBeenCalledTimes(1)
    })
    it('does nothing when windowDrop is off', () => {
      setup()
      fireEvent.dragEnter(window, files([file]))
      expect(screen.queryByText(copy.windowDropLabel)).toBeNull()
    })
    it('removes listeners on unmount', () => {
      const { unmount, onFile } = setup({ windowDrop: true })
      unmount()
      fireEvent.drop(window, files([file]))
      expect(onFile).not.toHaveBeenCalled()
    })
  })
})
