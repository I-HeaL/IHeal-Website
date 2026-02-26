import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                people: resolve(__dirname, 'people.html'),
                research: resolve(__dirname, 'research.html'),
                join: resolve(__dirname, 'join.html'),
            },
        },
    },
});
