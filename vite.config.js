import { defineConfig, normalizePath } from 'vite';
import vue from '@vitejs/plugin-vue';
import {viteStaticCopy} from 'vite-plugin-static-copy';
import path from 'node:path';
export default defineConfig({plugins:[vue(),viteStaticCopy({targets:['cmaps','standard_fonts','wasm'].map(name=>({src:normalizePath(path.resolve('node_modules/pdfjs-dist',name)),dest:'pdfjs'}))})],worker:{format:'es'},optimizeDeps:{exclude:['@jsquash/avif']}});
