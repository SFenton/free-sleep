import { sentryVitePlugin } from '@sentry/vite-plugin';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import info from '../server/src/serverInfo.json';

const isDemoMode = process.env.VITE_ENV === 'demo';
const isProdMode = process.env.VITE_ENV === 'prod';

const plugins = [react(), tsconfigPaths()];

if (isProdMode) {
  plugins.push(sentryVitePlugin({
    org: 'free-sleep',
    project: 'app',
    release: {
      name: info.version,
    }
  }));
}

export default defineConfig({
  plugins,
  server: {
    host: '0.0.0.0', // This makes the server accessible to other devices on the network
    port: 5173, // Optional: specify a port if you want something other than the default
  },
  build: {
    sourcemap: !isDemoMode,
    outDir: isDemoMode ? './dist/' : '../server/public/',
    rollupOptions: {
      output: {
        entryFileNames: 'index.js', // Set the name for the JS entry file
        chunkFileNames: '[name]-[hash].js', // Names for dynamic imports
        assetFileNames: ({ name }) => {
          if (name?.endsWith('.css')) {
            return 'index.css';
          }
          return '[name]-[hash].[ext]';
        },
      },
    },
  },
});
