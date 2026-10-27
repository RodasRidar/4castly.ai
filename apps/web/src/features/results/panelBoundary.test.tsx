import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../app/testing'

const flags = vi.hoisted(() => ({ chart: false, table: false }))

vi.mock('./ChartSection', async () => {
  const actual = await vi.importActual<typeof import('./ChartSection')>('./ChartSection')
  return {
    ChartSection: (props: Parameters<typeof actual.ChartSection>[0]) => {
      if (flags.chart) throw new Error('chart exploded')
      return actual.ChartSection(props)
    },
  }
})
vi.mock('./ProductsSection', async () => {
  const actual = await vi.importActual<typeof import('./ProductsSection')>('./ProductsSection')
  return {
    ProductsSection: (props: Parameters<typeof actual.ProductsSection>[0]) => {
      if (flags.table) throw new Error('table exploded')
      return actual.ProductsSection(props)
    },
  }
})

const READY = '/c/c5d30c23-398a-5d64-a690-c2086b0def35'

beforeEach(() => {
  flags.chart = false
  flags.table = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('results panels fail on their own', () => {
  it('a broken chart shows a panel error while KPIs and the table keep working', async () => {
    flags.chart = true
    renderApp({ path: READY })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No pudimos mostrar este panel')
    expect(await screen.findByRole('group', { name: 'Indicadores del pronóstico' })).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Productos y su riesgo de quiebre' })).toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('a broken table shows a panel error while the chart and KPIs keep working', async () => {
    flags.table = true
    renderApp({ path: READY })
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos mostrar este panel')
    expect(await screen.findByRole('group', { name: 'Indicadores del pronóstico' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Productos y su riesgo de quiebre' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByRole('navigation', { name: 'Ruta de navegación' })).toBeInTheDocument()
  })
})
