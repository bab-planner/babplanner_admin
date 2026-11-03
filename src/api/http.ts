import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from '../auth/session'
import { ApiConfigError, currentBaseUrl } from './baseUrl'

/**
 * 서버가 쓰는 응답 봉투. 성공이든 실패든 모양이 같다.
 */
export interface ApiEnvelope<T> {
  success: boolean
  data: T | null
  error: { code: string; message: string; details?: unknown } | null
}

/**
 * 요청이 실패했다.
 *
 * 원인을 상태 코드와 서버가 준 코드로만 들고 다닌다. 스택이나 서버 예외
 * 본문을 화면까지 실어 나르지 않는다.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** 서버가 준 코드인지. 화면이 특정 상황만 다르게 안내할 때 쓴다. */
  is(code: string): boolean {
    return this.code === code
  }
}

/** 인증이 끊겼다. 화면은 이걸 보고 로그인으로 보낸다. */
export class SessionExpiredError extends ApiError {
  constructor() {
    super(401, 'UNAUTHORIZED', '로그인이 필요합니다.')
    this.name = 'SessionExpiredError'
  }
}

type SessionListener = () => void

const sessionListeners = new Set<SessionListener>()

/** 세션이 끊겼을 때 알림받는다. AuthProvider가 화면을 정리하는 데 쓴다. */
export function onSessionExpired(listener: SessionListener): () => void {
  sessionListeners.add(listener)
  return () => sessionListeners.delete(listener)
}

function notifySessionExpired(): void {
  clearSession()
  sessionListeners.forEach((listener) => listener())
}

function urlOf(path: string): string {
  return `${currentBaseUrl()}${path}`
}

async function readEnvelope<T>(response: Response): Promise<ApiEnvelope<T> | null> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as ApiEnvelope<T>
  } catch {
    // 서버가 봉투가 아닌 것을 돌려줬다. 본문을 그대로 화면에 흘리지 않는다.
    return null
  }
}

/**
 * 성공 응답 본문 검사. 비어 있으면 null, JSON 봉투가 아니면 오류.
 * SPA fallback 이나 프록시의 HTML 페이지를 정상 응답으로 취급하지 않는다.
 */
async function readSuccessEnvelope<T>(response: Response): Promise<ApiEnvelope<T> | null> {
  const text = await response.text()
  if (!text) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw invalidResponse(response.status)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw invalidResponse(response.status)
  }
  return parsed as ApiEnvelope<T>
}

function invalidResponse(status: number): ApiError {
  return new ApiError(
    status,
    'INVALID_RESPONSE',
    '서버 응답 형식이 올바르지 않습니다. API 주소(VITE_API_BASE_URL) 설정을 확인해 주세요.',
  )
}

/** 상태 코드별 기본 안내. 서버가 준 문구가 있으면 그쪽을 쓴다. */
function fallbackMessage(status: number): string {
  switch (status) {
    case 400:
    case 422:
      return '입력한 내용을 다시 확인해 주세요.'
    case 401:
      return '로그인이 필요합니다.'
    case 403:
      return '이 작업에 대한 관리자 권한이 없습니다.'
    case 404:
      return '요청한 정보를 찾을 수 없습니다.'
    case 409:
      return '지금은 이 작업을 처리할 수 없습니다.'
    case 503:
      return '서비스를 일시적으로 사용할 수 없습니다.'
    default:
      return status >= 500
        ? '서버에서 요청을 처리하지 못했습니다.'
        : '요청을 처리하지 못했습니다.'
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  const envelope = await readEnvelope<unknown>(response)
  const code = envelope?.error?.code ?? `HTTP_${response.status}`
  const message = envelope?.error?.message ?? fallbackMessage(response.status)
  return new ApiError(response.status, code, message)
}

interface RequestOptions {
  method?: string
  body?: unknown
  /** 인증 헤더를 붙이지 않는다. 로그인과 갱신에만 쓴다. */
  anonymous?: boolean
  signal?: AbortSignal
  /** 기본은 JSON. 이미지처럼 본문이 바이트인 응답만 바꾼다. */
  accept?: string
}

function headersFor(options: RequestOptions): HeadersInit {
  const headers: Record<string, string> = { Accept: options.accept ?? 'application/json' }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (!options.anonymous) {
    const token = getAccessToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  return headers
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  let url: string
  try {
    url = urlOf(path)
  } catch (error) {
    // 배포 구성 오류. 화면이 ApiError 로 같은 방식으로 안내할 수 있게 바꾼다.
    if (error instanceof ApiConfigError) throw new ApiError(0, 'API_NOT_CONFIGURED', error.message)
    throw error
  }
  try {
    return await fetch(url, {
      method: options.method ?? 'GET',
      headers: headersFor(options),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    // HTTP 응답 자체를 못 받았다. 서버 404 와는 다른 상황이다.
    // (서버 다운, DNS, 인증서, CORS 거부, 혼합 콘텐츠 차단)
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      '서버에 연결할 수 없습니다. 네트워크 상태, API 서버 주소(HTTPS), 서버의 CORS 허용 설정을 확인해 주세요.',
    )
  }
}

/**
 * 동시에 도는 갱신 요청.
 *
 * 화면 하나에 조회가 여러 개 걸려 있으면 토큰이 만료된 순간 그 모두가 401을
 * 받는다. 각자 갱신하면 같은 refresh token으로 여러 번 요청이 나가고,
 * 서버가 토큰을 회전시키므로 먼저 도착한 것 말고는 전부 무효가 된다. 그러면
 * 멀쩡한 세션이 끊긴다.
 *
 * 그래서 진행 중인 갱신이 있으면 그 약속을 같이 기다린다.
 */
let refreshInFlight: Promise<boolean> | null = null

interface RefreshData {
  accessToken: string
  refreshToken: string
}

async function performRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false

  const response = await send('/api/v1/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
    anonymous: true,
  })

  if (!response.ok) return false

  const envelope = await readEnvelope<RefreshData>(response)
  const data = envelope?.data
  if (!data?.accessToken || !data?.refreshToken) return false

  setAccessToken(data.accessToken)
  // 서버가 새 refresh token을 준다. 갈아 끼우지 않으면 다음 갱신이 실패한다.
  setRefreshToken(data.refreshToken)
  return true
}

export function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = performRefresh()
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

/**
 * 요청 하나.
 *
 * 401이면 갱신을 한 번 시도하고 원 요청을 한 번만 다시 보낸다. 갱신까지
 * 실패하면 세션을 정리한다. 다시 보내는 것은 정확히 한 번뿐이라 실패가
 * 반복돼도 요청이 쌓이지 않는다.
 *
 * 403은 갱신하지 않는다. 인증은 멀쩡하고 권한이 없는 것이라, 갱신해도 결과가
 * 같고 매번 로그아웃시키면 화면을 쓸 수 없게 된다.
 */
async function sendAuthenticated(path: string, options: RequestOptions): Promise<Response> {
  let response = await send(path, options)

  if (response.status === 401 && !options.anonymous) {
    const refreshed = await refreshSession()
    if (!refreshed) {
      notifySessionExpired()
      throw new SessionExpiredError()
    }
    response = await send(path, options)
    if (response.status === 401) {
      notifySessionExpired()
      throw new SessionExpiredError()
    }
  }

  return response
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await sendAuthenticated(path, options)

  if (!response.ok) {
    throw await toApiError(response)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const envelope = await readSuccessEnvelope<T>(response)
  return (envelope?.data ?? null) as T
}

/**
 * 바이트 응답 하나. 인증이 필요한 이미지를 Blob으로 받는다.
 *
 * <img src> 는 Authorization 헤더를 붙일 수 없다. 401 갱신 규칙은 request 와
 * 같다. 실패하면 서버 본문을 그대로 쓰지 않고 ApiError 로 바꾼다.
 */
export async function requestBlob(
  path: string,
  options: { signal?: AbortSignal } = {},
): Promise<Blob> {
  const response = await sendAuthenticated(path, { accept: 'image/*', signal: options.signal })
  if (!response.ok) {
    throw await toApiError(response)
  }
  return response.blob()
}

/** 서버가 세션을 끊었다고 알린다. 로그인 화면이 직접 부른다. */
export function expireSession(): void {
  notifySessionExpired()
}
