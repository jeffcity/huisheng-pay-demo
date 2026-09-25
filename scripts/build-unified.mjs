import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const script = value => value.replace(/<\/script/gi, '<\\/script');

async function bundleSurface(directory, title) {
  const result = await build({
    root: directory,
    configFile: false,
    publicDir: false,
    plugins: [react()],
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      write: false,
      cssCodeSplit: false,
      minify: true,
      lib: { entry: path.join(directory, 'src/main.jsx'), name: 'HuishengDemo', formats: ['iife'] }
    }
  });
  const output = (Array.isArray(result) ? result : [result]).flatMap(bundle => bundle.output);
  const chunks = output.filter(item => item.type === 'chunk');
  if (chunks.length !== 1 || chunks[0].imports.length || chunks[0].dynamicImports.length) {
    throw new Error(`${title} 存在未内联的脚本依赖`);
  }
  const assets = output.filter(item => item.type === 'asset');
  if (assets.some(item => !item.fileName.endsWith('.css'))) throw new Error(`${title} 存在未内联的资源`);
  const sourceDirectory = path.join(directory, 'public/legacy/sources');
  const sources = {};
  for (const file of (await readdir(sourceDirectory)).filter(file => file.endsWith('.html')).sort()) {
    sources[file.slice(0, -5)] = await readFile(path.join(sourceDirectory, file), 'utf8');
  }
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${assets.map(item => item.source).join('\n')}</style></head><body><div id="root"></div><script>window.__HS_EMBEDDED_SOURCES__=${json(sources)};</script><script>${script(chunks[0].code)}</script></body></html>`;
}

const documents = {
  platform: await bundleSurface(root, '汇盛支付平台端'),
  tenant: await bundleSurface(path.join(root, 'surfaces/tenant'), '汇盛支付租户端'),
  merchant: await readFile(path.join(root, 'surfaces/merchant/demo.html'), 'utf8')
};
const template = await readFile(path.join(root, 'src/unified.html'), 'utf8');
const payload = Object.entries(documents).map(([id, html]) =>
  `<script id="surface-${id}" type="application/json">${json(html)}</script>`).join('\n');
const html = template.replace('<!-- SURFACE_DOCUMENTS -->', () => payload);
// dist 只保存生成物，清理旧多文件构建资源。
await rm(path.join(root, 'dist'), { recursive: true, force: true });
await mkdir(path.join(root, 'dist'), { recursive: true });
await writeFile(path.join(root, 'index.html'), html);
await writeFile(path.join(root, 'dist/index.html'), html);
console.log(`统一 Demo：三端已打包到一个 index.html（${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MB），运行时仅挂载当前端。`);
