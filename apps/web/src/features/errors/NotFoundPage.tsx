import { Compass } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TextLink } from '../../ui/atoms/TextLink'
import { EmptyState } from '../../ui/molecules/EmptyState'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-[50dvh] items-center justify-center p-6">
      <EmptyState
        icon={Compass}
        title={t('pages.notFoundTitle')}
        body={t('pages.notFoundBody')}
        action={<TextLink href="/nuevo">{t('pages.notFoundAction')}</TextLink>}
      />
    </div>
  )
}
