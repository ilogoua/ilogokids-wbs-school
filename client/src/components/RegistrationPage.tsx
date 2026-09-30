import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Translations } from '../i18n/translations'

type RegistrationPageProps = {
  token: string
  copy: Translations
}

type RegistrationError = 'required' | 'invalidLoginName' | 'loginNameTaken' | 'nameLength' | 'passwordLength' | 'passwordMismatch' | 'invalidInvitation' | 'accountExists' | 'failed'

export function RegistrationPage({ token, copy }: RegistrationPageProps) {
  const [publicName, setPublicName] = useState('')
  const [loginName, setLoginName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<RegistrationError | null>(null)
  const text = copy.registration

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || success || !token) return
    setError(null)

    if (!loginName.trim() || !publicName.trim() || !password || !confirmPassword) {
      setError('required')
      return
    }
    const normalizedLoginName = loginName.trim().toLowerCase()
    if (!/^[a-z][a-z0-9_-]{2,23}$/.test(normalizedLoginName)) {
      setError('invalidLoginName')
      return
    }
    if (publicName.trim().length > 50) {
      setError('nameLength')
      return
    }
    if (password.length < 8 || password.length > 128) {
      setError('passwordLength')
      return
    }
    if (password !== confirmPassword) {
      setError('passwordMismatch')
      return
    }

    setPending(true)
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, loginName: normalizedLoginName, password, publicName: publicName.trim() }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        if (body?.code === 'login_name_taken') setError('loginNameTaken')
        else if (body?.code === 'invalid_login_name') setError('invalidLoginName')
        else setError(response.status === 400 ? 'invalidInvitation' : response.status === 409 ? 'accountExists' : 'failed')
        return
      }

      setPassword('')
      setConfirmPassword('')
      setSuccess(true)
    } catch {
      setError('failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="invite-panel registration-panel" aria-labelledby="registration-title">
      <h2 id="registration-title">{text.title}</h2>
      {success ? (
        <>
          <p className="invite-status" role="status">{text.success}</p>
          <a className="login-link" href="/login">{copy.auth.login}</a>
        </>
      ) : !token ? (
        <p className="registration-error" role="alert">{text.missingToken}</p>
      ) : (
        <>
          <p className="invite-context">{text.intro}</p>
          <form onSubmit={handleSubmit} noValidate aria-busy={pending}>
            <div className="registration-field">
              <label htmlFor="registration-nick">{copy.loginName}</label>
              <input id="registration-nick" autoComplete="username" autoCapitalize="none" spellCheck={false} value={loginName} onChange={(event) => setLoginName(event.target.value)} maxLength={24} aria-describedby="registration-nick-hint" required disabled={pending} />
              <p className="registration-hint" id="registration-nick-hint">{text.loginNameHint}</p>
            </div>
            <div className="registration-field">
              <label htmlFor="registration-name">{text.publicName}</label>
              <input id="registration-name" autoComplete="nickname" value={publicName} onChange={(event) => setPublicName(event.target.value)} maxLength={50} required disabled={pending} />
            </div>
            <div className="registration-field">
              <label htmlFor="registration-password">{text.password}</label>
              <input id="registration-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={128} aria-describedby="registration-password-hint" required disabled={pending} />
              <p className="registration-hint" id="registration-password-hint">{text.passwordHint}</p>
            </div>
            <div className="registration-field">
              <label htmlFor="registration-confirm">{text.confirmPassword}</label>
              <input id="registration-confirm" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} maxLength={128} required disabled={pending} />
            </div>
            {error && <p className="registration-error" role="alert">{text[error]}</p>}
            <button className="send-invite" type="submit" disabled={pending}>{pending ? text.submitting : text.submit}</button>
          </form>
        </>
      )}
    </section>
  )
}
