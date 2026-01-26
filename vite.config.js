import { defineConfig } from 'vite';

export default defineConfig({
    // Prevent Vite from obscuring Rust errors
    clearScreen: false,
    // Tauri expects a fixed port
    server: {
        port: 5173,
        strictPort: true,
        host: '0.0.0.0',
    },
    // Env prefix for Tauri
    envPrefix: ['VITE_', 'TAURI_'],
    build: {
        // Tauri supports ES2021
        target: ['es2021', 'chrome100', 'safari14'],
        // Don't minify for debug builds
        minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
        // Produce sourcemaps for debug builds
        sourcemap: !!process.env.TAURI_DEBUG,
    },
});
