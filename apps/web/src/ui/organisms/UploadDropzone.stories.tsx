import type { Meta, StoryObj } from '@storybook/react-vite'
import { UploadDropzone } from './UploadDropzone'

const meta = {
  title: 'Organisms/UploadDropzone',
  component: UploadDropzone,
  args: {
    state: 'empty',
    onFile: () => {},
    accept: '.xlsx,.xls',
    prompt: 'Arrastra tu Kardex aquí o elige un archivo',
    hint: 'Excel (.xlsx, .xls)',
    inputLabel: 'Archivo Kardex',
    changeLabel: 'Cambiar archivo',
    removeLabel: 'Quitar archivo',
    uploadingText: 'Subiendo archivo…',
    errorText: 'No se pudo subir el archivo. Inténtalo de nuevo.',
    windowDropLabel: 'Suelta el archivo para subirlo',
    onRemove: () => {},
  },
} satisfies Meta<typeof UploadDropzone>
export default meta
type Story = StoryObj<typeof meta>

const file = { name: 'kardex_enero_2026_importaciones.xlsx', size: '1,2 MB' }

export const Empty: Story = {}
export const Dragging: Story = { args: { state: 'dragging' } }
export const Attached: Story = { args: { state: 'attached', file, statusLine: 'Archivo listo para continuar' } }
export const Uploading: Story = { args: { state: 'uploading', file } }
export const UploadError: Story = { args: { state: 'upload_error' } }
export const UploadErrorWithFile: Story = { args: { state: 'upload_error', file } }
export const WithWindowDrop: Story = { args: { windowDrop: true } }
