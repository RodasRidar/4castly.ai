import { UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Placeholder } from '../Placeholder'

/** Placeholder: the profile form is F6. */
export function ProfilePage() {
  const { t } = useTranslation()
  return <Placeholder icon={UserRound} title={t('settings.profileTitle')} body={t('settings.profileBody')} />
}
