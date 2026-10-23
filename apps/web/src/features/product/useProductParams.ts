import { useSearchParams } from 'react-router'

/** `?compra=sugerida` picks the scenario and `?preguntar=1` opens the product chat; other params are left alone. */
export function useProductParams() {
  const [params, setParams] = useSearchParams()
  const withPurchase = params.get('compra') === 'sugerida'
  const asking = params.get('preguntar') === '1'

  const update = (change: (next: URLSearchParams) => void) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        change(next)
        return next
      },
      { replace: true },
    )

  return {
    withPurchase,
    asking,
    setWithPurchase: (value: boolean) => update((p) => (value ? p.set('compra', 'sugerida') : p.delete('compra'))),
    setAsking: (value: boolean) => update((p) => (value ? p.set('preguntar', '1') : p.delete('preguntar'))),
  }
}
