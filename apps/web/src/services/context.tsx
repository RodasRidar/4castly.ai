import type { ReactNode } from 'react'
import type { Services } from './ports'
import { ServicesContext } from './servicesContext'

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext value={services}>{children}</ServicesContext>
}
