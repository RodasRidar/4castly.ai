import { describe, expect, it } from 'vitest'
import { filterLinkHref, parseResultsParams, resultsSearch } from './resultsUrl'

describe('results URL state', () => {
  it('parses every param with safe defaults', () => {
    expect(parseResultsParams(new URLSearchParams(''))).toEqual({
      q: '',
      risk: [],
      abc: [],
      page: 1,
      sort: 'risk',
      order: 'asc',
      view: 'chat',
    })
  })

  it('reads filters, sort, page and the portfolio view', () => {
    const params = new URLSearchParams('q=acido&riesgo=critical,medium&abc=A&pagina=3&orden=coverage:desc&vista=portafolio')
    expect(parseResultsParams(params)).toEqual({
      q: 'acido',
      risk: ['critical', 'medium'],
      abc: ['A'],
      page: 3,
      sort: 'coverage',
      order: 'desc',
      view: 'portfolio',
    })
  })

  it('drops unknown values instead of passing them to the API', () => {
    const parsed = parseResultsParams(new URLSearchParams('riesgo=boom,critical&abc=Z&pagina=-4&orden=nope:up&vista=otra'))
    expect(parsed).toMatchObject({ risk: ['critical'], abc: [], page: 1, sort: 'risk', order: 'asc', view: 'chat' })
  })

  it('serializes only non-default values and resets the page when filters change', () => {
    expect(resultsSearch({ q: '', risk: [], abc: [], page: 1, sort: 'risk', order: 'asc', view: 'chat' })).toBe('')
    expect(
      resultsSearch({ q: 'acido', risk: ['critical'], abc: ['A', 'B'], page: 2, sort: 'name', order: 'desc', view: 'portfolio' }),
    ).toBe('?q=acido&riesgo=critical&abc=A%2CB&pagina=2&orden=name%3Adesc&vista=portafolio')
  })

  it('round-trips', () => {
    const state = { q: 'ácido', risk: ['medium' as const], abc: ['C' as const], page: 4, sort: 'lead_time' as const, order: 'desc' as const, view: 'portfolio' as const }
    expect(parseResultsParams(new URLSearchParams(resultsSearch(state)))).toEqual(state)
  })

  it('turns an assistant figure into a filter link for the conversation', () => {
    expect(filterLinkHref('abc-1', { risk: 'critical', abc: 'A', count: 3 })).toBe('/c/abc-1?riesgo=critical&abc=A')
    expect(filterLinkHref('abc-1', { q: 'acido', count: 1 })).toBe('/c/abc-1?q=acido')
  })
})
