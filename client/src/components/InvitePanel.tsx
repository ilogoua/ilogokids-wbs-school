import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Translations } from '../i18n/translations'

type InvitePanelProps = {
  parentLabel: string
  onInvite: () => void
  copy: Translations
}

export function InvitePanel({ parentLabel, onInvite, copy }: InvitePanelProps) {
  const [email, setEmail] = useState('')
  const [previewAdded, setPreviewAdded] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // This checkpoint changes local presentation only, with no request or storage.
    onInvite()
    setEmail('')
    setPreviewAdded(true)
  }

  return (
    <section className="invite-panel" aria-labelledby="invite-title">
      <p className="invite-eyebrow">{copy.circle}<span aria-hidden="true"> · </span><strong>{parentLabel}</strong></p>
      <h2 id="invite-title">{copy.inviteTitle}</h2>
      <p className="invite-context">{copy.inviteQuestion}</p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="invite-email">{copy.email}</label>
        <input
          id="invite-email"
          type="email"
          autoComplete="off"
          placeholder={copy.emailPlaceholder}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            setPreviewAdded(false)
          }}
          required
        />
        <button className="send-invite" type="submit">{copy.inviteAction}</button>
        <p className="invite-status" role="status">{previewAdded ? copy.inviteSuccess : ''}</p>
      </form>
    </section>
  )
}
