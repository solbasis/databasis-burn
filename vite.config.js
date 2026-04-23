import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'crypto', 'stream', 'process'],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'solana-web3': ['@solana/web3.js'],
          'wallet-adapter': [
            '@solana/wallet-adapter-react',
            '@solana/wallet-adapter-react-ui',
            '@solana/wallet-adapter-wallets',
          ],
          'metaplex': [
            '@metaplex-foundation/umi-bundle-defaults',
            '@metaplex-foundation/mpl-core',
            '@metaplex-foundation/mpl-token-metadata',
          ],
        },
      },
    },
    target: 'esnext',
  },
  define: {
    'process.env': {},
  },
});
