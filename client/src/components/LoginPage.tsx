import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Translations } from '../i18n/translations'

type LoginPageProps = { copy: Translations; onLogin: () => void }

export function LoginPage({ copy, onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<'required' | 'invalid' | 'failed' | null>(null)
  const text = copy.auth

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setError(null)
    if (!email.trim() || !password) { setError('required'); return }
    setPending(true)
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      if (!response.ok) {
        setError(response.status === 401 ? 'invalid' : 'failed')
        return
      }
      setPassword('')
      onLogin()
    } catch {
      setError('failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="invite-panel registration-panel" aria-labelledby="login-title">
      <h2 id="login-title">{text.title}</h2>
      <p className="invite-context">{text.intro}</p>
      <form onSubmit={handleSubmit} aria-busy={pending}>
        <div className="registration-field">
          <label htmlFor="login-email">{copy.email}</label>
          <input id="login-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={pending} />
        </div>
        <div className="registration-field">
          <label htmlFor="login-password">{copy.registration.password}</label>
          <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={128} required disabled={pending} />
        </div>
        {error && <p className="registration-error" role="alert">{text[error]}</p>}
        <button className="send-invite" type="submit" disabled={pending}>{pending ? text.submitting : text.login}</button>
      </form>
    </section>
  )
}
