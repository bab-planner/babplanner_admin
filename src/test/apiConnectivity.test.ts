import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeBaseUrl, resolveBaseUrl } from '../api/baseUrl'
import { ApiError, request } from '../api/http'

describe('resolveBaseUrl', () => {
  it('끝 슬래시와 /api/v1 중복을 제거한다', () => {
    expect(normalizeBaseUrl('https://api.example.com/')).toBe('https://api.example.com')
    expect(normalizeBaseUrl('https://api.example.com/api/v1/')).toBe('https://api.example.com')
  })

  it('production 에서 누락되면 구성 오류', () => {
    expect(() => resolveBaseUrl({ value: '', production: true })).toThrow(/VITE_API_BASE_URL/)
    expect(() => resolveBaseUrl({ value: undefined, production: true })).toThrow()
  })

  it('개발에서는 비어 있으면 상대 경로', () => {
    expect(resolveBaseUrl({ value: '', production: false })).toBe('')
  })

  it('production 에서 HTTP 와 잘못된 형식을 거부한다', () => {
    expect(() => resolveBaseUrl({ value: 'http://api.example.com', production: true })).toThrow()
    expect(() => resolveBaseUrl({ value: 'api.example.com', production: true })).toThrow()
  })
})

describe('request', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('API Origin 과 경로를 중복 없이 결합한다', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { ok: 1 }, error: null })),
    )
    vi.stubGlobal('fetch', fetchMock)
    await request('/api/v1/admin/dashboard')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example.com/api/v1/admin/dashboard')
  })

  it('로그인 경로를 유지한다', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com')
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"success":true,"data":null,"error":null}'))
    vi.stubGlobal('fetch', fetchMock)
    const { login } = await import('../api/auth')
    await login('010', 'pw')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example.com/api/v1/auth/login')
  })

  it('HTML 응답은 정상 JSON 으로 취급하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<!doctype html><html></html>')))
    await expect(request('/api/v1/admin/dashboard')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('네트워크 실패와 HTTP 404 를 구분한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const net = (await request('/x').catch((e: unknown) => e)) as ApiError
    expect(net).toBeInstanceOf(ApiError)
    expect(net.code).toBe('NETWORK_ERROR')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>nf</html>', { status: 404 })))
    const nf = (await request('/x').catch((e: unknown) => e)) as ApiError
    expect(nf.status).toBe(404)
    expect(nf.code).toBe('HTTP_404')
  })
})

describe('vercel.json', () => {
  it('SPA fallback 을 index.html 로 두고 API 프록시는 없다', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8'))
    expect(config.rewrites).toEqual([{ source: '/(.*)', path: '/index.html' }])
    expect(JSON.stringify(config)).not.toContain('/api')
  })
})
