import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(path.join(root, 'dist/index.html'), 'utf8');
assert.deepEqual(await readdir(path.join(root, 'dist')), ['index.html'], '发布目录必须只有一个 HTML 文件');
assert.equal(html, await readFile(path.join(root, 'index.html'), 'utf8'));
assert.match(html, /<title>汇盛支付统一 Demo<\/title>/);
assert.doesNotMatch(html, /\/Users\/|file:\/\//i, '不能包含本机绝对路径');
assert.doesNotMatch(html, /<(?:script|link)\b[^>]+(?:src|href)=["'](?:https?:|\/|\.\/assets)/i, '统一壳不能请求外部构建资源');
for (const id of ['platform', 'tenant', 'merchant']) {
  const payload = html.match(new RegExp('<script id="surface-' + id + '" type="application/json">([\\s\\S]*?)<\\/script>'));
  assert.ok(payload, '缺少 ' + id);
  const document = JSON.parse(payload[1]);
  assert.match(document, /<!doctype html>/i);
  assert.doesNotMatch(document, /<(?:script|link)\b[^>]+(?:src|href)=["']\.\//i, id + ' 遗留本地资源依赖');
  if (id !== 'merchant') {
    const sources = JSON.parse(document.match(/window\.__HS_EMBEDDED_SOURCES__=([\s\S]*?);<\/script>/)[1]);
    const base = id === 'platform' ? root : path.join(root, 'surfaces/tenant');
    const modules = JSON.parse(await readFile(path.join(base, 'src/legacy/modules.json'), 'utf8'));
    for (const module of Object.values(modules)) assert.equal(typeof sources[module.sourceKey], 'string');
    for (const [key, source] of Object.entries(sources)) {
      assert.equal(source, await readFile(path.join(base, 'public/legacy/sources', key + '.html'), 'utf8'), id + '/' + key + ' 不应偏离源码');
      const legacy = id === 'platform' ? ['channels', 'login', 'system', 'tenants'] : ['system'];
      if (!legacy.includes(key)) assert.doesNotMatch(source, /<(?:script|link)\b[^>]+(?:src|href)=["']https?:/i);
    }
  } else {
    assert.equal(document, await readFile(path.join(root, 'surfaces/merchant/demo.html'), 'utf8'), '商户端打包内容必须与当前源码完全一致');
  }
}
assert.ok(Buffer.byteLength(html) < 50 * 1024 * 1024, '单文件超过项目大小门禁');
console.log('检查通过：发布目录只有 index.html，三端源完整内联，无本机路径或跨项目构建依赖。');
