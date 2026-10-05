import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** 주석을 뗀 소스. 제거한 기능을 설명하는 문장이 위반으로 잡히지 않게 한다. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')
    })
    .join('\n')
}

const FILES = [
  'src/app/router.tsx',
  'src/layout/AdminLayout.tsx',
  ...readdirSync('src/api')
    .filter((name) => name.endsWith('.ts'))
    .map((name) => `src/api/${name}`),
]

describe('AI 범위', () => {
  it('제거한 발주·끼니별 예측 경로가 라우터, 사이드바, API 모듈에 없다', () => {
    for (const path of FILES) {
      const text = code(path).toLowerCase()
      expect(text, path).not.toContain('/demand-predictions')
      expect(text, path).not.toContain('procurement')
      expect(text, path).not.toContain('demand/predict')
    }
  })

  it('식수 예측 API(demand-forecasts)는 남아 있다', () => {
    expect(code('src/api/demandForecast.ts')).toContain('/demand-forecasts')
  })
})
