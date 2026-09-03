import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { NotAnAdminError, useAuth } from '../../auth/AuthProvider'
import { messageOf } from '../../components/StatusBlock'

/**
 * 관리자 로그인.
 *
 * 화면 구성은 Figma 관리자 웹 로그인(147:5335)을 따른다. 로고를 카드 위에
 * 올리고, 카드 안에 입력 두 개와 버튼을 둔다.
 *
 * Figma의 첫 필드는 "아이디"지만 서버는 아이디 로그인을 받지 않는다. 사용자
 * 앱과 같은 인증 API를 쓰고 휴대폰 번호와 비밀번호로 들어간다. 화면 문구를
 * 맞추자고 인증 방식을 되돌리지 않는다.
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
      {/*
        실패 안내. Figma는 화면 위쪽 가운데에 띄운다. 문구는 서버가 준 것을
        그대로 쓴다. Figma에 적힌 "아이디 또는 비밀번호가 일치하지 않습니다"로
        덮어쓰지 않는다. 무엇이 틀렸는지는 서버만 안다.
      */}
      {error ? (
        <p className="login-alert" role="alert">
          {error}
        </p>
      ) : null}

      <div className="login-inner">
        <div className="login-logo">호서 : 밥플래너</div>

        <form className="login-card" onSubmit={onSubmit}>
          <div className="login-fields">
            <label className="field">
              <span className="field-label">휴대폰 번호</span>
              <input
                name="phone"
                type="tel"
                autoComplete="username"
                inputMode="numeric"
                placeholder="휴대폰 번호 입력"
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
                placeholder="비밀번호 입력"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
          </div>

          <button type="submit" className="login-submit" disabled={submitting}>
            {submitting ? '로그인 중…' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
