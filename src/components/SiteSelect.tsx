import { useSites } from './SiteProvider'

/**
 * 급식소 선택.
 *
 * 목록이 비어 있으면 고를 수 있는 척하지 않는다. 이 상태에서 siteId를
 * 지어내면 모든 조회가 422로 떨어진다.
 */
export function SiteSelect() {
  const { sites, selectedSite, selectSite, isLoading, error } = useSites()

  if (isLoading) {
    return (
      <span className="site-select-status" role="status">
        급식소 불러오는 중…
      </span>
    )
  }

  if (error) {
    return (
      <span className="site-select-status" role="alert">
        급식소 목록을 불러오지 못했습니다.
      </span>
    )
  }

  if (sites.length === 0) {
    return (
      <span className="site-select-status" role="status">
        등록된 급식소가 없습니다
      </span>
    )
  }

  return (
    <label className="site-select">
      <span className="site-select-label">급식소</span>
      <select
        value={selectedSite?.id ?? ''}
        onChange={(event) => selectSite(Number(event.target.value))}
      >
        {sites.map((site) => (
          <option key={site.id} value={site.id}>
            {site.name}
          </option>
        ))}
      </select>
    </label>
  )
}
