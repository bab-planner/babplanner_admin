import type { ReactNode } from 'react'
import { ApiError } from '../api/http'

/**
 * 조회 상태를 한 자리에서 그린다.
 *
 * 화면마다 로딩·비어 있음·오류를 따로 만들면 어느 하나를 빠뜨리게 되고,
 * 그 자리는 대개 "아무것도 안 보임"이 된다. 관리자는 그걸 보고 데이터가
 * 없다고 판단한다.
 */
interface StatusBlockProps<T> {
  isLoading: boolean
  error: unknown
  data: T | undefined
  /** 데이터는 왔지만 보여 줄 것이 없는 경우. */
  isEmpty?: (data: T) => boolean
  emptyMessage?: string
  children: (data: T) => ReactNode
}

export function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return '요청을 처리하지 못했습니다.'
}

export function StatusBlock<T>({
  isLoading,
  error,
  data,
  isEmpty,
  emptyMessage = '표시할 자료가 없습니다.',
  children,
}: StatusBlockProps<T>) {
  if (isLoading) {
    return (
      <p className="status status-loading" role="status">
        불러오는 중…
      </p>
    )
  }

  if (error) {
    return (
      <p className="status status-error" role="alert">
        {messageOf(error)}
      </p>
    )
  }

  if (data === undefined || data === null) {
    return (
      <p className="status status-empty" role="status">
        {emptyMessage}
      </p>
    )
  }

  if (isEmpty?.(data)) {
    return (
      <p className="status status-empty" role="status">
        {emptyMessage}
      </p>
    )
  }

  return <>{children(data)}</>
}
