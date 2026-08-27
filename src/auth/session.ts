/**
 * 세션 토큰 보관.
 *
 * accessToken은 메모리에만 둔다. 탭을 닫으면 사라지고, 어떤 스토리지에도
 * 남지 않는다.
 *
 * refreshToken은 sessionStorage에 둔다. 새로고침으로 세션이 끊기면 관리자가
 * 매번 다시 로그인해야 하기 때문이다.
 *
 * ## 알고 있는 한계
 *
 * sessionStorage는 JavaScript가 읽을 수 있다. XSS가 나면 refreshToken이
 * 함께 나간다. 제대로 된 방법은 HttpOnly 쿠키인데, 지금 백엔드 인증은 응답
 * 본문으로 토큰을 돌려주는 방식이라 그럴 수 없다.
 *
 * 이건 인증 프로토콜을 바꿔야 닫히는 문제이고, 관리자 웹을 만드는 김에
 * 건드릴 일이 아니다. localStorage 대신 sessionStorage를 쓰는 것은 탭을
 * 닫으면 사라지게 해서 노출 시간을 줄이는 정도의 완화일 뿐이다.
 */

const REFRESH_TOKEN_KEY = 'babplanner.admin.refreshToken'

/** 메모리 전용. 모듈 스코프라 새로고침하면 사라진다. */
let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function getRefreshToken(): string | null {
  try {
    return sessionStorage.getItem(REFRESH_TOKEN_KEY)
  } catch {
    // 브라우저가 스토리지를 막아 둔 경우. 세션이 없는 것과 같게 다룬다.
    return null
  }
}

export function setRefreshToken(token: string | null): void {
  try {
    if (token === null) {
      sessionStorage.removeItem(REFRESH_TOKEN_KEY)
      return
    }
    sessionStorage.setItem(REFRESH_TOKEN_KEY, token)
  } catch {
    // 저장하지 못해도 이번 세션은 메모리의 accessToken으로 계속 쓸 수 있다.
  }
}

export function clearSession(): void {
  setAccessToken(null)
  setRefreshToken(null)
}
