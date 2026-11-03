/**
 * API Origin 해석.
 *
 * 개발: VITE_API_BASE_URL 이 비어 있으면 상대 경로를 쓴다. Vite 프록시가 /api 를 중계한다.
 * 배포(production): 반드시 필요하다. 비어 있으면 조용히 현재 Origin(Vercel)으로 요청을
 * 보내지 않고 구성 오류를 낸다. 그러면 SPA fallback(index.html)이 API 응답처럼 보이는
 * 일을 막을 수 있다.
 *
 * 값은 Origin만 받는다. 경로(/api/v1)는 각 API 함수가 붙이므로, 실수로 들어온
 * 끝 슬래시와 /api, /api/v1 접미사는 제거해 중복을 막는다.
 */

export class ApiConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApiConfigError'
  }
}

export interface BaseUrlInput {
  value: string | undefined
  production: boolean
  /** 현재 페이지의 프로토콜. 혼합 콘텐츠 검사에 쓴다. */
  pageProtocol?: string
}

export function normalizeBaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '')
  url = url.replace(/\/api(\/v1)?$/i, '')
  return url.replace(/\/+$/, '')
}

export function resolveBaseUrl({ value, production, pageProtocol }: BaseUrlInput): string {
  const raw = (value ?? '').trim()

  if (!raw) {
    if (production) {
      throw new ApiConfigError(
        'API 주소가 설정되지 않았습니다. 배포 환경변수 VITE_API_BASE_URL 에 API Origin(예: https://api.example.com)을 등록하고 다시 배포해 주세요.',
      )
    }
    return ''
  }

  const normalized = normalizeBaseUrl(raw)

  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    throw new ApiConfigError(
      'VITE_API_BASE_URL 형식이 올바르지 않습니다. https://api.example.com 처럼 http(s):// 로 시작하는 Origin이어야 합니다.',
    )
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ApiConfigError('VITE_API_BASE_URL 은 http(s):// 로 시작해야 합니다.')
  }
  if (production && parsed.protocol === 'http:') {
    throw new ApiConfigError(
      '배포 환경에서는 HTTPS API 주소가 필요합니다. HTTPS 페이지에서 HTTP API를 부르면 브라우저가 차단합니다.',
    )
  }
  if (pageProtocol === 'https:' && parsed.protocol === 'http:') {
    throw new ApiConfigError('HTTPS 페이지에서는 HTTP API 주소를 쓸 수 없습니다.')
  }

  return normalized
}

export function currentBaseUrl(): string {
  return resolveBaseUrl({
    value: import.meta.env?.VITE_API_BASE_URL,
    production: Boolean(import.meta.env?.PROD),
    pageProtocol: typeof window === 'undefined' ? undefined : window.location.protocol,
  })
}
