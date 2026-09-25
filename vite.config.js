import { defineConfig } from 'vite';
import { spawn } from 'node:child_process';
import path from 'node:path';

// base './'：GitHub Pages 部署在仓库子路径下，全部资源走相对路径
export default defineConfig({
  base: './',
  publicDir: false,
  server: { host: '127.0.0.1', port: 4174, strictPort: true },
  plugins: [{
    name: 'rebuild-unified-demo',
    configureServer(server) {
      let timer, running = false, pending = false;
      const root = server.config.root;
      const watched = ['src', 'public/legacy/sources', 'surfaces', 'scripts/build-unified.mjs'];
      const rebuild = () => {
        if (running) { pending = true; return; }
        running = true;
        const child = spawn(process.execPath, ['scripts/build-unified.mjs'], { cwd: root, stdio: 'inherit' });
        child.on('exit', () => {
          running = false;
          if (pending) { pending = false; rebuild(); }
        });
      };
      const changed = file => {
        const relative = path.relative(root, file).split(path.sep).join('/');
        if (!watched.some(item => relative === item || relative.startsWith(item + '/'))) return;
        clearTimeout(timer);
        timer = setTimeout(rebuild, 250);
      };
      server.watcher.on('change', changed).on('add', changed).on('unlink', changed);
      server.httpServer?.once('close', () => clearTimeout(timer));
    }
  }]
});
