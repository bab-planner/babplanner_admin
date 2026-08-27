import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { NotAnAdminError, useAuth } from '../../auth/AuthProvider'
import { messageOf } from '../../components/StatusBlock'

/**
 * 관리자 로그인.
 *
 * 사용자 앱과 같은 인증 API를 쓴다. 휴대폰 번호와 비밀번호로 들어가며,
 * 이메일 로그인은 없다.
 */
export function LoginPage() {
  const { status, login } = useAuth()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (status === 'authenticated') {
    return <Navigate to="/" replace />
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return

    setError(null)
    setSubmitting(true)
    try {
      await login(phone.trim(), password)
    } catch (caught) {
      // 관리자가 아닌 계정은 로그인 자체는 성공한다. 그 사실을 그대로 알려
      // 준다. "비밀번호가 틀렸습니다"로 뭉뚱그리면 계정을 계속 다시 친다.
      setError(caught instanceof NotAnAdminError ? caught.message : messageOf(caught))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <h1 className="login-title">밥플래너 관리자</h1>
        <p className="login-subtitle">관리자 계정으로 로그인하세요.</p>

        <label className="field">
          <span className="field-label">휴대폰 번호</span>
          <input
            name="phone"
            type="tel"
            autoComplete="username"
            inputMode="numeric"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
          />
        </label>

        <label className="field">
          <span className="field-label">비밀번호</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        {error ? (
          <p className="status status-error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="button button-primary" disabled={submitting}>
          {submitting ? '로그인 중…' : '로그인'}
        </button>
      </form>
    </div>
  )
}
