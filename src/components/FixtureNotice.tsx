/**
 * 개발용 fixture가 낸 값이라는 경고.
 *
 * fixture는 입력을 보지 않고 정해진 값을 돌려준다. 그 숫자가 아무 표시 없이
 * 화면에 뜨면 관리자는 그것을 예측으로 읽고 식재료를 주문한다. 값을 보여
 * 주되 무엇인지도 같이 보여 준다.
 */
export function FixtureNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="fixture-notice" role="note">
      {children}
    </p>
  )
}

export function FixtureBadge() {
  return (
    <span className="fixture-badge" title="개발용 fixture — 실제 AI 예측이 아닙니다">
      개발용 fixture — 실제 AI 예측이 아닙니다
    </span>
  )
}
