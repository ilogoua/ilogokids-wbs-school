import { useEffect, useState } from 'react'
import type { Translations } from '../i18n/translations'

type Visibility = 'visible' | 'anonymous'
type Props = { copy: Translations; onChanged: () => void; onSessionExpired: () => void }

export function VisibilityControl({ copy, onChanged, onSessionExpired }: Props) {
  const [visibility, setVisibility] = useState<Visibility | null>(null)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch('/api/profile', { credentials: 'same-origin', signal: controller.signal })
        if (!response.ok) throw new Error('Profile request failed')
        const profile: { visibility: Visibility } = await response.json()
        if (profile.visibility !== 'visible' && profile.visibility !== 'anonymous') throw new Error('Invalid visibility')
        if (!controller.signal.aborted) {
          setVisibility(profile.visibility)
          setFailed(false)
        }
      } catch {
        if (!controller.signal.aborted) setFailed(true)
      }
    }
    void load()
    return () => controller.abort()
  }, [retry])

  async function change(checked: boolean) {
    if (pending || visibility === null) return
    setPending(true)
    setFailed(false)
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: checked ? 'visible' : 'anonymous' }),
      })
      if (response.status === 401) { onSessionExpired(); return }
      if (!response.ok) throw new Error('Profile update failed')
      const profile: { visibility: Visibility } = await response.json()
      if (profile.visibility !== 'visible' && profile.visibility !== 'anonymous') throw new Error('Invalid visibility')
      setVisibility(profile.visibility)
      onChanged()
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="visibility-control">
      <label>
        <input type="checkbox" checked={visibility === 'visible'} disabled={pending || visibility === null} onChange={(event) => void change(event.target.checked)} />
        {copy.profile.visible}
      </label>
      {pending && <span role="status">{copy.profile.saving}</span>}
      {failed && <p role="alert">{copy.profile.failed} {visibility === null && <button type="button" onClick={() => setRetry((value) => value + 1)}>{copy.auth.retry}</button>}</p>}
    </div>
  )
}
