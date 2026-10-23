import { useTranslation } from 'react-i18next'
import { useSession } from '../../app/session'
import type { User } from '../../services/types'
import { Button } from '../../ui/atoms/Button'
import { Dialog } from '../../ui/organisms/Dialog'
import { ProfileForm } from '../../ui/organisms/ProfileForm'
import { useProfileForm } from './useProfileForm'

/** Name and job title are editable; email and company are read-only (contract: `PATCH /me`). */
export function ProfilePage() {
  const { data: user } = useSession()
  // RequireAuth guarantees a user before this route renders.
  return user ? <ProfileEditor user={user} /> : null
}

function ProfileEditor({ user }: { user: User }) {
  const { t } = useTranslation()
  const form = useProfileForm(user)
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-heading-lg font-semibold text-ink">{t('settings.profileTitle')}</h1>
      <ProfileForm
        label={t('settings.profileForm')}
        values={{ ...form.values, email: user.email, company: user.company.name }}
        fieldLabels={{
          name: t('settings.profileFields.name'),
          role: t('settings.profileFields.role'),
          email: t('settings.profileFields.email'),
          company: t('settings.profileFields.company'),
        }}
        errors={form.errors}
        status={form.status}
        saveLabel={t('settings.save')}
        discardLabel={t('settings.discard')}
        savedText={t('settings.profileSaved')}
        onChange={form.change}
        onSubmit={form.submit}
        onDiscard={form.discard}
      />
      <Dialog
        open={form.leave.open}
        onOpenChange={(open) => !open && form.leave.stay()}
        title={t('settings.leaveTitle')}
        description={t('settings.leaveBody')}
        closeLabel={t('common.close')}
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={form.leave.stay}>
            {t('settings.leaveStay')}
          </Button>
          <Button variant="danger-text" onClick={form.leave.confirm}>
            {t('settings.leaveConfirm')}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
