import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Build vai para construbox/erp/ — servido via GitHub Pages em /construbox/erp/
  base: '/construbox/erp/',
  build: {
    outDir: '../erp',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/antd') || id.includes('node_modules/@ant-design')) return 'antd';
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'vendor';
          if (id.includes('node_modules/')) return 'deps';
        },
      },
    },
  },
});
