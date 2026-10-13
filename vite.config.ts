import adapter from '@sveltejs/adapter-cloudflare';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: { exclude: ['@jsquash/jpeg', 'wasm-webp'] },
  plugins: [
    tailwindcss(),
    sveltekit({
      adapter: adapter()
    })
  ]
});
