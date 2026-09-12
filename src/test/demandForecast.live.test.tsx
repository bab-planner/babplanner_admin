import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DemandForecastPanel, SYNTHETIC_NOTICE } from '../features/demandForecast/DemandForecastPanel'
import { login } from '../api/auth'
import { buildDemandForecastRequest, predictDemandForecast } from '../api/demandForecast'
import { DEMO_DEFAULT_CONDITIONS } from '../api/demandForecastPoc'
import { setAccessToken } from '../auth/session'
import { renderWithProviders } from './helpers'

/**
 * 실제로 떠 있는 서버를 향한 종단 확인. 환경 변수가 없으면 건너뛴다.
 *
 * 화면 코드(DemandForecastPanel → http.ts)가 그대로 돌고, 요청은 진짜로 나간다.
 *
 *   이 테스트 → ADMIN_LIVE_BASE_URL(보통 Vite 개발 서버 5173, /api 프록시)
 *            → Spring → FastAPI → 저장된 모델
 *
 * fetch를 가로채지 않고 지켜보기만 한다. 브라우저 개발자 도구의 네트워크 탭 대신
 * 화면이 부른 주소를 전부 기록해 FastAPI 내부 경로가 없는지 본다.
 *
 *   ADMIN_LIVE_BASE_URL=http://127.0.0.1:5173
 *   ADMIN_LIVE_PHONE=<관리자 휴대폰>  ADMIN_LIVE_PASSWORD=<관리자 비밀번호>
 *   (선택) ADMIN_LIVE_EXPECTED_COUNT=<FastAPI를 직접 불러 얻은 값>
 */
const LIVE_BASE = process.env.ADMIN_LIVE_BASE_URL

describe.skipIf(!LIVE_BASE)('식수 예측 실제 연결 (Admin Web → Spring → FastAPI)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    setAccessToken(null)
  })

  it('화면에서 예측한 값이 서버 응답과 같고, 내부 AI 경로를 부르지 않는다', async () => {
    vi.stubEnv('VITE_API_BASE_URL', LIVE_BASE!)
    const requested: string[] = []
    const realFetch = globalThis.fetch
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      requested.push(typeof input === 'string' ? input : input.toString())
      return realFetch(input, init)
    })

    const auth = await login(process.env.ADMIN_LIVE_PHONE!, process.env.ADMIN_LIVE_PASSWORD!)
    expect(auth.user.role).toBe('ADMIN')
    setAccessToken(auth.accessToken)

    renderWithProviders(<DemandForecastPanel />, { withSites: false })
    const button = await screen.findByRole('button', { name: '식수 예측' })
    await waitFor(() => expect(button).toBeEnabled(), { timeout: 10_000 })

    // 시연 흐름 그대로: 기본 조건을 건드리지 않고 "식수 예측"만 누른다.
    await userEvent.setup().click(button)

    const value = await waitFor(
      () => {
        const node = document.querySelector('.forecast-value')
        expect(node).not.toBeNull()
        return node!.textContent!
      },
      { timeout: 15_000 },
    )
    const shown = Number(value.replace(/[^0-9]/g, ''))

    // 같은 조건을 API로 다시 물은 값과 같아야 한다. 화면이 숫자를 만들지 않는다.
    const direct = await predictDemandForecast(buildDemandForecastRequest(DEMO_DEFAULT_CONDITIONS))
    expect(shown).toBe(direct.predictedMealCount)
    if (process.env.ADMIN_LIVE_EXPECTED_COUNT) {
      expect(shown).toBe(Number(process.env.ADMIN_LIVE_EXPECTED_COUNT))
    }
    // 합성데이터 모델이면 안내가 떠 있어야 한다.
    if (direct.model.syntheticData) {
      expect(screen.getByRole('note')).toHaveTextContent(SYNTHETIC_NOTICE)
    }

    expect(requested.length).toBeGreaterThan(0)
    for (const url of requested) {
      expect(url.startsWith(`${LIVE_BASE}/api/v1/`)).toBe(true)
      expect(url).not.toContain('/internal/')
    }

    console.info(
      `[live] 화면 표시 ${value} / Spring 응답 ${direct.predictedMealCount}명 / ` +
        `model ${direct.model.version} synthetic=${direct.model.syntheticData}\n` +
        `[live] 화면이 부른 주소:\n  ${requested.join('\n  ')}`,
    )
  }, 40_000)
})
