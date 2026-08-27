/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 배포에서 API 서버 주소. 비어 있으면 같은 출처의 상대 경로를 쓴다. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
