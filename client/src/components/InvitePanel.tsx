import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Translations } from '../i18n/translations'

type InvitePanelProps = {
  parentLabel: string
  copy: Translations
}

export function InvitePanel({ parentLabel, copy }: InvitePanelProps) {
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [link, setLink] = useState('')
  const [error, setError] = useState<'failed' | 'auth' | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    setLink('')
    try {
      const response = await fetch('/api/invitations', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (response.status === 401) {
        setError('auth')
        return
      }
      if (!response.ok) throw new Error('Invitation request failed')
      const result: { token: string } = await response.json()
      if (typeof result.token !== 'string' || !/^[a-f0-9]{64}$/.test(result.token)) {
        throw new Error('Invalid invitation response')
      }
      const registrationUrl = new URL('/register', window.location.origin)
      registrationUrl.searchParams.set('token', result.token)
      setLink(registrationUrl.href)
    } catch {
      setError('failed')
    } finally {
      setPending(false)
    }
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
          disabled={pending}
          onChange={(event) => {
            setEmail(event.target.value)
            setLink('')
            setError(null)
          }}
          required
        />
        <button className="send-invite" type="submit" disabled={pending}>{pending ? copy.inviteSubmitting : copy.inviteAction}</button>
        <p className="invite-status" role="status">{link ? copy.inviteSuccess : ''}</p>
        {error && <p className="registration-error" role="alert">{error === 'auth' ? copy.inviteAuthRequired : copy.inviteFailed}</p>}
        {link && (
          <>
            <label htmlFor="invite-link">{copy.inviteLink}</label>
            <input id="invite-link" type="text" readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
          </>
        )}
      </form>
    </section>
  )
}
