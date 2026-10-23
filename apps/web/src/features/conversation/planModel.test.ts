import { describe, expect, it } from 'vitest'
import type { ConversationDetail, PlanView } from '../../services/types'
import { applyMapping, buildDatePlan, inferDateFormat, inferDecimalSeparator, planRows } from './planModel'

type Profile = NonNullable<NonNullable<ConversationDetail['upload']>['profile']>
const profile: Profile = {
  source_kind: 'tabular',
  date_from: null,
  date_to: null,
  sheets: [
    {
      name: 'Ventas',
      row_count: 10,
      columns: [
        { name: 'Fecha Doc', inferred_type: 'date', samples: ['12/01/2026', '13/01/2026'] },
        { name: 'Cod Art', inferred_type: 'text', samples: ['QF-0001'] },
        { name: 'Cant', inferred_type: 'number', samples: ['1.850,5', '320'] },
      ],
    },
  ],
}

describe('inferDateFormat', () => {
  it.each([
    [['2026-01-12'], 'yyyy-mm-dd'],
    [['2026-01', '2026-02'], 'yyyy-mm'],
    [['12/01/2026', '20/01/2026'], 'dd/mm/yyyy'],
    [['01/13/2026'], 'mm/dd/yyyy'],
    [['03/04/2026'], 'dd/mm/yyyy'],
    [['12-01-2026'], 'dd-mm-yyyy'],
    [[], 'dd/mm/yyyy'],
  ])('%j -> %s', (samples, expected) => expect(inferDateFormat(samples)).toBe(expected))
})

describe('inferDecimalSeparator', () => {
  it.each([
    [['1.850,5', '320'], ','],
    [['1,850.5'], '.'],
    [['12,5'], ','],
    [['1,850'], '.'],
    [['320'], '.'],
  ] as const)('%j -> %s', (samples, expected) => expect(inferDecimalSeparator(samples)).toBe(expected))
})

describe('buildDatePlan', () => {
  const needsDate = {
    sheets: ['Ventas'],
    selected_sheet: 'Ventas',
    plan: null,
    date_column_candidates: [],
    mappings: [{ field: 'date', column: null, required: true, samples: [], detail: null }],
  } as unknown as PlanView

  it('completes a provisional plan around the chosen date column', () => {
    const plan = buildDatePlan(needsDate, profile, 'Fecha Doc')
    expect(plan).toMatchObject({
      version: 1,
      sheet: 'Ventas',
      header_row: 1,
      date: { column: 'Fecha Doc', format: 'dd/mm/yyyy' },
      product_code: { column: 'Cod Art' },
      quantity: { column: 'Cant', decimal_separator: ',' },
      unit: { column: null, default: 'u' },
    })
  })

  it('returns null when the file offers no product or quantity column to complete the plan', () => {
    expect(buildDatePlan(needsDate, null, 'Fecha Doc')).toBeNull()
  })
})

describe('planRows and applyMapping', () => {
  const view = {
    sheets: ['Ventas'],
    selected_sheet: 'Ventas',
    plan: {
      version: 1,
      sheet: 'Ventas',
      header_row: 1,
      date: { column: 'Fecha Doc', format: 'dd/mm/yyyy' },
      product_code: { column: 'Cod Art' },
      product_name: null,
      quantity: { column: 'Cant', decimal_separator: ',' },
      stock: null,
      unit: { column: null, default: 'u' },
    },
    mappings: [
      { field: 'date', column: 'Fecha Doc', required: true, samples: ['12/01/2026'], detail: null },
      { field: 'stock', column: null, required: false, samples: [], detail: null },
    ],
  } as unknown as PlanView

  it('keeps contract order and flags optional fields', () => {
    const rows = planRows(view, (f) => f)
    expect(rows.map((r) => [r.field, r.optional])).toEqual([
      ['date', false],
      ['stock', true],
    ])
  })

  it('applies edits, keeping the declared format when the date column does not change', () => {
    const plan = applyMapping(view, { date: 'Fecha Doc', product_code: 'Cod Art', quantity: 'Cant', stock: 'Cant' }, 'Ventas', profile)
    expect(plan?.date).toEqual({ column: 'Fecha Doc', format: 'dd/mm/yyyy' })
    expect(plan?.stock).toEqual({ column: 'Cant', decimal_separator: ',' })
    expect(plan?.product_name).toBeNull()
  })

  it('refuses a mapping that leaves a required field empty', () => {
    expect(applyMapping(view, { date: null, product_code: 'Cod Art', quantity: 'Cant' }, 'Ventas', profile)).toBeNull()
  })
})
