import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    // Permite acesso via ngrok e qualquer host externo
    allowedHosts: true,
    proxy: {
      '/analisar':     'http://localhost:5000',
      '/buscar':       'http://localhost:5000',
      '/barcode':      'http://localhost:5000',
      '/historico':    'http://localhost:5000',
      '/stats':        'http://localhost:5000',
      '/health':       'http://localhost:5000',
      '/limpar-cache': 'http://localhost:5000',
    }
  }
})
