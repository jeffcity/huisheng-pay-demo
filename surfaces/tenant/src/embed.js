import providerModel from '../../../src/provider-model.js?raw';
import channelRecordsModel from './channel-records-model.js?raw';
import notificationBotModel from './notification-bot-model.js?raw';
// 旧壳 prepareEmbeddedModule 的忠实移植：fetch 真实源文件 → 注入统一壳补丁
// （隐藏内页自带 sidebar/topbar + __UNIFIED_DEMO_HASH 引导）→ 注入路由应用脚本 → 交给 iframe.srcdoc。
// 与旧实现逐条对应，行为口径不变。
const sourceCache = new Map();

async function fetchSource(key) {
  if (window.__HS_EMBEDDED_SOURCES__) {
    const html = window.__HS_EMBEDDED_SOURCES__[key];
    if (typeof html !== 'string') throw new Error(`页面来源缺失：${key}`);
    return html;
  }
  if (sourceCache.has(key)) return sourceCache.get(key);
  const res = await fetch(`./legacy/sources/${key}.html`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`页面来源缺失：${key}`);
  const text = await res.text();
  sourceCache.set(key, text);
  return text;
}

const headBridge = `
        <style id="hs-unified-content-bridge">
          /* 仅统一主题色，不改变业务页面结构、字号、尺寸或交互。 */
          :root {
            --primary:#3246d2; --color-primary:#3246d2;
            --primary-hover:#2939b7; --color-primary-hover:#2939b7;
            --primary-soft:#eef0ff; --soft:#eef0ff; --color-primary-light:#eef0ff;
            --color-primary-line:#a7b1f3;
            --bg:#f0f2f5; --color-bg-page:#f0f2f5; --color-bg-2:#f0f2f5;
            --border:#e3e8ef; --color-border:#e3e8ef;
          }
          html, body { min-width: 0 !important; }
          body { overflow: auto !important; background:#f0f2f5 !important; }
          .sidebar, [data-astryx="SidebarNav"] { display: none !important; }
          header.topbar, [data-astryx="TopBar"] { display: none !important; }
          .app, .app-shell { grid-template-columns: minmax(0, 1fr) !important; }
          main, .main, .workspace { min-width: 0 !important; }
          @media (max-width: 900px) {
            .app, .app-shell { grid-template-columns: minmax(0, 1fr) !important; }
          }
        </style>
        <script id="hs-unified-route-bridge">
          (() => {
            const requestedHash = window.frameElement?.dataset.initialHash || "";
            window.__UNIFIED_DEMO_HASH = requestedHash;
            document.documentElement.dataset.unifiedTenantContent = "true";
          })();
        </script>
      `;

function routeBridge(moduleName) {
  return `
        <script id="hs-unified-route-apply">
          (() => {
            const requestedHash = window.frameElement?.dataset.initialHash || "";
            const moduleName = ${JSON.stringify(moduleName)};
            if (!requestedHash) return;
            if (moduleName === "system") {
              document.querySelector('[data-view="' + requestedHash + '"]')?.click();
            } else if (moduleName === "merchants") {
              document.querySelector('.nav-button[data-page="' + requestedHash + '"]')?.click();
            }
          })();
        </script>
      `;
}

function prepareEmbeddedModule(html, moduleName) {
  if (moduleName === 'login') return html;
  const models = providerModel + (moduleName === 'channel-records' ? '\n' + channelRecordsModel : '') + (moduleName === 'notifications' ? '\n' + notificationBotModel : '');
  const modelBridge = '<script>' + models.replace(/<\/script/gi, '<\\/script') + '</script>';
  const withHead = html.includes('</head>') ? html.replace('</head>', () => modelBridge + headBridge + '</head>') : modelBridge + headBridge + html;
  return withHead.includes('</body>') ? withHead.replace('</body>', routeBridge(moduleName) + '</body>') : withHead + routeBridge(moduleName);
}

export async function prepareEmbeddedDocument(sourceKey, moduleName) {
  const html = await fetchSource(sourceKey);
  return prepareEmbeddedModule(html, moduleName);
}
