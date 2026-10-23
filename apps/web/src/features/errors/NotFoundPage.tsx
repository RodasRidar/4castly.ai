import { Compass } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TextLink } from '../../ui/atoms/TextLink'
import { EmptyState } from '../../ui/molecules/EmptyState'

/**
 * `standalone` is for routes outside every layout: it brings its own main landmark. Inside AppLayout the
 * layout already provides `main`, so only the content is rendered.
 */
export function NotFoundPage({ standalone = false }: { standalone?: boolean }) {
  const { t } = useTranslation()
  const content = (
    <EmptyState
      icon={Compass}
      headingLevel={1}
      title={t('pages.notFoundTitle')}
      body={t('pages.notFoundBody')}
      action={<TextLink href="/nuevo">{t('pages.notFoundAction')}</TextLink>}
    />
  )
  const className = 'flex min-h-[50dvh] items-center justify-center p-6'
  return standalone ? (
    <main id="main" className={className}>
      {content}
    </main>
  ) : (
    <div className={className}>{content}</div>
  )
}
