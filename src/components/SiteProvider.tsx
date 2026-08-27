import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSites } from '../api/sites'
import type { AdminSite } from '../api/types'

const SELECTED_SITE_KEY = 'babplanner.admin.selectedSiteId'

interface SiteContextValue {
  sites: AdminSite[]
  selectedSite: AdminSite | null
  selectSite: (siteId: number) => void
  isLoading: boolean
  error: unknown
}

const SiteContext = createContext<SiteContextValue | null>(null)

/**
 * 어느 급식소를 보고 있는지.
 *
 * 고른 식당 id는 비밀이 아니므로 브라우저에 남겨 새로고침해도 유지한다.
 * 다만 저장된 id가 더 이상 없는 식당이면 첫 번째 식당으로 되돌린다. 없는
 * 식당을 계속 조회하면 화면이 통째로 422가 된다.
 */
export function SiteProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'sites'],
    queryFn: fetchSites,
    staleTime: 5 * 60 * 1000,
  })

  const sites = useMemo(() => data ?? [], [data])
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const raw = localStorage.getItem(SELECTED_SITE_KEY)
    const parsed = raw === null ? Number.NaN : Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  })

  useEffect(() => {
    if (sites.length === 0) return
    const stillExists = sites.some((site) => site.id === selectedId)
    if (stillExists) return
    // 저장된 값이 쓸모없어졌다. 첫 식당으로 복구한다.
    setSelectedId(sites[0]!.id)
  }, [sites, selectedId])

  useEffect(() => {
    if (selectedId === null) return
    try {
      localStorage.setItem(SELECTED_SITE_KEY, String(selectedId))
    } catch {
      // 저장하지 못해도 이번 세션은 메모리 상태로 동작한다.
    }
  }, [selectedId])

  const selectSite = useCallback((siteId: number) => setSelectedId(siteId), [])

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedId) ?? null,
    [sites, selectedId],
  )

  const value = useMemo(
    () => ({ sites, selectedSite, selectSite, isLoading, error }),
    [sites, selectedSite, selectSite, isLoading, error],
  )

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>
}

export function useSites(): SiteContextValue {
  const context = useContext(SiteContext)
  if (!context) throw new Error('SiteProvider 안에서만 쓸 수 있습니다.')
  return context
}
