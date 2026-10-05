import { afterEach, describe, expect, it, vi } from 'vitest'
import { login } from '../api/auth'
import {
  approveWasteSubmission,
  fetchWasteSubmissionImage,
  fetchWasteSubmissions,
  rejectWasteSubmission,
} from '../api/wasteSubmissions'
import { setAccessToken } from '../auth/session'

/**
 * 실제로 떠 있는 서버를 향한 확인. 환경 변수가 없으면 건너뛴다.
 *
 * 관리자 화면이 쓰는 API 모듈(wasteSubmissions.ts)이 실제 Backend 계약과 맞는지 본다.
 * 사용자 제출은 이 테스트가 임시 계정으로 직접 만들고, 마지막에 계정을 지운다.
 *
 *   ADMIN_LIVE_BASE_URL=http://localhost:5173   (Vite 개발 서버의 /api 프록시)
 *   ADMIN_LIVE_PHONE=<관리자 휴대폰>  ADMIN_LIVE_PASSWORD=<관리자 비밀번호>
 */
const LIVE_BASE = process.env.ADMIN_LIVE_BASE_URL

// 1x1 PNG.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function api<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${LIVE_BASE}${path}`, {
    ...init,
    headers: {
      ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((init.headers as Record<string, string> | undefined) ?? {}),
    },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${path} -> ${response.status} ${text}`)
  const json = text ? JSON.parse(text) : null
  return (json && 'data' in json ? json.data : json) as T
}

const CRLF = '\r\n'

/** jsdom의 FormData/Blob은 Node fetch가 직렬화하지 못한다. 멀티파트 본문을 직접 만든다. */
function multipartBody(fields: Record<string, string>, file: { name: string; type: string; bytes: Uint8Array }) {
  const boundary = `----live${Math.random().toString(16).slice(2)}`
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      encoder.encode(`--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`),
    )
  }
  parts.push(
    encoder.encode(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="image"; filename="${file.name}"${CRLF}` +
        `Content-Type: ${file.type}${CRLF}${CRLF}`,
    ),
  )
  parts.push(file.bytes)
  parts.push(encoder.encode(`${CRLF}--${boundary}--${CRLF}`))
  const body = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    body.set(part, offset)
    offset += part.length
  }
  return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}

describe.skipIf(!LIVE_BASE)('잔반 인증 관리 실제 연결 (Admin Web API → Spring)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    setAccessToken(null)
  })

  it(
    '제출 -> PENDING -> 사진 확인 -> 승인(+100) / 거절이 실제 계약대로 동작한다',
    async () => {
      vi.stubEnv('VITE_API_BASE_URL', LIVE_BASE!)

      // --- 임시 사용자 만들기
      const phone = `010${30000000 + Math.floor(Math.random() * 60000000)}`
      const password = 'AdminLive1234!x'
      const sent = await api<{ developmentCode: string }>('/api/v1/auth/phone/send-code', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      })
      const verified = await api<{ verificationToken: string }>('/api/v1/auth/phone/verify', {
        method: 'POST',
        body: JSON.stringify({ phone, code: sent.developmentCode }),
      })
      const signup = await api<{ accessToken: string }>('/api/v1/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          name: '관리자라이브',
          phone,
          studentId: String(20100000 + Math.floor(Math.random() * 900000)),
          password,
          agreements: { serviceTerms: true, privacyPolicy: true },
          verificationToken: verified.verificationToken,
        }),
      })
      const userToken = signup.accessToken

      try {
        const menus = await api<{ id: number }[]>('/api/v1/menus?date=2026-08-26')
        const menuId = menus[0]?.id
        expect(menuId, '식단이 있어야 잔반 인증을 제출할 수 있다').toBeDefined()
        const png = Uint8Array.from(atob(PNG_BASE64), (c) => c.charCodeAt(0))
        const submit = () => {
          const { body, contentType } = multipartBody(
            { menuId: String(menuId), capturedAt: new Date().toISOString() },
            { name: 'plate.png', type: 'image/png', bytes: png },
          )
          return api<{ id: number; status: string }>(
            '/api/v1/waste-submissions',
            { method: 'POST', body, headers: { 'Content-Type': contentType } },
            userToken,
          )
        }
        const first = await submit()
        expect(first.status).toBe('PENDING')

        // --- 관리자 화면이 쓰는 모듈로 처리
        const auth = await login(process.env.ADMIN_LIVE_PHONE!, process.env.ADMIN_LIVE_PASSWORD!)
        expect(auth.user.role).toBe('ADMIN')
        setAccessToken(auth.accessToken)

        const pending = await fetchWasteSubmissions('PENDING')
        const item = pending.find((entry) => entry.id === first.id)
        expect(item, '대기 목록에 방금 제출한 건이 있어야 한다').toBeDefined()
        expect(Object.keys(item!).sort()).toEqual(
          [
            'capturedAt',
            'couponIssued',
            'createdAt',
            'earnedPoints',
            'id',
            'menuId',
            'menuName',
            'reviewedAt',
            'serviceDate',
            'status',
            'userName',
            'userPhoneMasked',
          ].sort(),
        )
        expect(item!.userPhoneMasked).toContain('****')
        expect(JSON.stringify(item)).not.toContain(phone)

        const image = await fetchWasteSubmissionImage(first.id)
        expect(image.type).toBe('image/png')
        expect(image.size).toBeGreaterThan(0)

        const approved = await approveWasteSubmission(first.id)
        expect(approved.status).toBe('APPROVED')
        expect(approved.earnedPoints).toBe(100)
        // 다시 승인해도 그대로(멱등), 승인 후 거절은 막힌다.
        expect((await approveWasteSubmission(first.id)).earnedPoints).toBe(100)
        await expect(rejectWasteSubmission(first.id)).rejects.toMatchObject({ status: 409 })

        const summary = await api<{ points: number }>('/api/v1/rewards/summary', {}, userToken)
        expect(summary.points).toBe(100)

        const second = await submit()
        const rejected = await rejectWasteSubmission(second.id)
        expect(rejected.status).toBe('REJECTED')
        expect((await api<{ points: number }>('/api/v1/rewards/summary', {}, userToken)).points).toBe(100)
        const rejectedList = await fetchWasteSubmissions('REJECTED')
        expect(rejectedList.some((entry) => entry.id === second.id)).toBe(true)
      } finally {
        await api('/api/v1/users/me/deletion', { method: 'POST', body: JSON.stringify({ password }) }, userToken)
      }
    },
    120_000,
  )
})
