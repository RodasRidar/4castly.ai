import { useCallback, useEffect, useState } from 'react'

/** Whole seconds left until a deadline; `restart` begins a new run. Ticks from the clock, so it survives throttled timers. */
export function useCountdown(seconds: number) {
  const [deadline, setDeadline] = useState(() => Date.now() + seconds * 1000)
  const [left, setLeft] = useState(seconds)

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [deadline])

  const restart = useCallback(() => {
    setDeadline(Date.now() + seconds * 1000)
    setLeft(seconds)
  }, [seconds])

  return { left, restart }
}
