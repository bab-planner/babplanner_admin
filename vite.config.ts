import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * 개발 중에는 프록시로 붙는다.
 *
 * 브라우저가 8080을 직접 부르면 다른 출처가 되어 백엔드에 CORS 설정이
 * 필요해진다. 배포 방식이 정해지지 않은 상태에서 CORS를 먼저 열면, 나중에
 * 어떤 출처를 허용해야 하는지 모른 채 넓게 열어 둔 설정만 남는다.
 *
 * 그래서 개발 서버가 같은 출처인 척 중계한다. 백엔드는 손대지 않는다.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const target = env.VITE_DEV_API_TARGET || 'http://127.0.0.1:8080'

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          // 차트 라이브러리가 번들의 절반을 넘는다. 대부분의 화면은 차트를
          // 쓰지 않으므로 따로 떼어 첫 로딩에서 빠지게 한다.
          manualChunks: {
            charts: ['recharts'],
            vendor: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
          },
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: true },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  }
})
