import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * jsdom에는 ResizeObserver가 없다.
 *
 * 차트가 컨테이너 크기를 재려고 이걸 쓴다. 없으면 렌더가 통째로 터져서
 * 차트와 무관한 표까지 사라진다. 브라우저에는 있는 API이므로 테스트 환경만
 * 채워 준다.
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!('ResizeObserver' in globalThis)) {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
}

beforeEach(() => {
  // 테스트가 서로의 세션을 물려받지 않게 한다.
  sessionStorage.clear()
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
