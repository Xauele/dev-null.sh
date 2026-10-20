import { defineConfig } from 'vite';

export default defineConfig({
    assetsInclude: [/\.dat$/, /\.so$/, /\.la$/],
    optimizeDeps: { exclude: ['@php-wasm/web'] },
    build: { outDir: 'dist', emptyOutDir: true },
});
