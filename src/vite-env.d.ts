/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API Origin(예: https://api.example.com). production 에서는 필수, 개발에서는 비우면 프록시. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
