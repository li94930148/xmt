import { defineConfig } from 'vite';import react from '@vitejs/plugin-react';import path from 'node:path';
export default defineConfig({base:'./',root:path.resolve('desktop/renderer'),plugins:[react()],css:{postcss:{plugins:[]}},server:{host:'127.0.0.1',port:5178,strictPort:true},build:{outDir:path.resolve('dist-desktop/renderer'),emptyOutDir:true}});
