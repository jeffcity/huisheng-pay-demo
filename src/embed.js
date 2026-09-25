// 旧壳 prepareEmbeddedDocument 的忠实移植：fetch 真实源文件 → 内联 authGuard →
// 隐藏内页自带 sidebar/topbar → 注入统一壳补丁与路由同步脚本 → 交给 iframe.srcdoc。
// 与旧实现逐条对应，行为口径不变。
const sourceCache = new Map();

async function fetchSource(key) {
  if (window.__HS_EMBEDDED_SOURCES__) {
    const html = window.__HS_EMBEDDED_SOURCES__[key];
    if (typeof html !== 'string') throw new Error(`页面来源缺失：${key}`);
    return html;
  }
  if (sourceCache.has(key)) return sourceCache.get(key);
  const res = await fetch(`./legacy/sources/${key}.html`);
  if (!res.ok) throw new Error(`页面来源缺失：${key}`);
  const text = await res.text();
  sourceCache.set(key, text);
  return text;
}

const VISUAL_BASELINE_SOURCES = new Set(['tenants', 'system', 'wallets', 'funds', 'login']);

function visualBaselinePatch(sourceKey) {
  if (!VISUAL_BASELINE_SOURCES.has(sourceKey)) return '';
  return `
        <style id="hsCurrentPlatformVisualBaseline">
          :root {
            --primary: #3246d2 !important;
            --primary-hover: #697af1 !important;
            --primary-strong: #2838a8 !important;
            --primary-soft: #eef0ff !important;
            --primary-light: #eef0ff !important;
            --bg: #f2f3f5 !important;
            --bg-main: #f2f3f5 !important;
            --bg-page: #f2f3f5 !important;
            --bg-card: #ffffff !important;
            --bg-surface: #ffffff !important;
            --surface: #ffffff !important;
            --surface-soft: #fafafa !important;
            --bg-subtle: #f5f7fa !important;
            --bg-muted: #f5f7fa !important;
            --text: #303133 !important;
            --text-primary: #303133 !important;
            --text-strong: #303133 !important;
            --text-secondary: #606266 !important;
            --text-main: #606266 !important;
            --text-tertiary: #909399 !important;
            --text-muted: #909399 !important;
            --border: #dcdfe6 !important;
            --line: #dcdfe6 !important;
            --border-strong: #cdd0d6 !important;
            --line-strong: #cdd0d6 !important;
            --radius-sm: 4px !important;
            --radius-md: 6px !important;
            --radius-lg: 8px !important;
            --radius: 8px !important;
            --shadow: 0 1px 3px rgba(23, 23, 26, .06) !important;
            --shadow-panel: 0 1px 3px rgba(23, 23, 26, .06) !important;
            --shadow-pop: 0 12px 32px rgba(23, 23, 26, .12) !important;
            --shadow-popover: 0 12px 32px rgba(23, 23, 26, .12) !important;
            --font: Inter, "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
            --font-ui: Inter, "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
            --display-font: Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif !important;
          }

          html, body {
            color: #303133 !important;
            background: #f2f3f5 !important;
            font-family: var(--font-ui, var(--font)) !important;
            -webkit-font-smoothing: antialiased;
          }

          .content {
            box-sizing: border-box !important;
            padding: 20px 24px 28px !important;
            background: #f2f3f5 !important;
          }

          .page-head,
          .panel,
          .section-card,
          .card,
          .summary-card,
          .metric-card,
          .stat-card,
          .table-wrap,
          .table-card {
            border-color: #e4e7ed !important;
            border-radius: 8px !important;
            background: #ffffff !important;
            box-shadow: 0 1px 3px rgba(23, 23, 26, .05) !important;
          }

          .page-head {
            margin-bottom: 16px !important;
            padding: 18px 20px !important;
          }

          .page-title h1,
          .page-head h1,
          .page-head h2 {
            color: #303133 !important;
            font-size: 20px !important;
            font-weight: 600 !important;
            letter-spacing: 0 !important;
          }

          .page-title p,
          .page-desc,
          .page-subtitle,
          .muted,
          .subtle {
            color: #909399 !important;
          }

          .filters,
          .filter-bar,
          .toolbar,
          .panel-toolbar {
            border-color: #e4e7ed !important;
            border-radius: 8px !important;
            background: #ffffff !important;
          }

          .filters,
          .filter-bar,
          .toolbar {
            padding: 16px !important;
          }

          input,
          select,
          textarea,
          .input,
          .select,
          .field-control {
            border-color: #dcdfe6 !important;
            border-radius: 6px !important;
            background: #ffffff !important;
            color: #303133 !important;
            box-shadow: none !important;
            transition: border-color .18s ease, box-shadow .18s ease !important;
          }

          input:not([type="checkbox"]):not([type="radio"]),
          select,
          .input,
          .select {
            min-height: 32px !important;
          }

          input:hover,
          select:hover,
          textarea:hover {
            border-color: #a8abb2 !important;
          }

          input:focus,
          select:focus,
          textarea:focus,
          input:focus-visible,
          select:focus-visible,
          textarea:focus-visible {
            border-color: #3246d2 !important;
            box-shadow: 0 0 0 2px rgba(50, 70, 210, .14) !important;
            outline: none !important;
          }

          .btn {
            min-height: 32px;
            border-color: #dcdfe6 !important;
            border-radius: 6px !important;
            background: #ffffff !important;
            color: #606266 !important;
            font-weight: 500 !important;
            box-shadow: none !important;
            cursor: pointer;
            transition: color .18s ease, border-color .18s ease, background-color .18s ease !important;
          }

          .btn:hover {
            border-color: #9aa6f6 !important;
            background: #eef0ff !important;
            color: #3246d2 !important;
            transform: none !important;
          }

          .btn.primary,
          .primary.btn {
            border-color: #3246d2 !important;
            background: #3246d2 !important;
            color: #ffffff !important;
          }

          .btn.primary:hover,
          .primary.btn:hover {
            border-color: #697af1 !important;
            background: #697af1 !important;
            color: #ffffff !important;
          }

          .btn.danger {
            border-color: #f56c6c !important;
            background: #ffffff !important;
            color: #f56c6c !important;
          }

          .btn:disabled {
            border-color: #e4e7ed !important;
            background: #f5f7fa !important;
            color: #a8abb2 !important;
            cursor: not-allowed !important;
          }

          .btn:focus-visible,
          button:focus-visible,
          a:focus-visible,
          [role="button"]:focus-visible {
            outline: 2px solid #3246d2 !important;
            outline-offset: 2px !important;
          }

          .tabs {
            border-color: #e4e7ed !important;
            border-radius: 8px !important;
            background: #f5f7fa !important;
            padding: 4px !important;
          }

          .tab,
          .tab-btn,
          [role="tab"] {
            border-radius: 6px !important;
            color: #606266 !important;
            transition: color .18s ease, background-color .18s ease !important;
          }

          .tab.active,
          .tab-btn.active,
          [role="tab"][aria-selected="true"] {
            background: #ffffff !important;
            color: #3246d2 !important;
            box-shadow: 0 1px 3px rgba(23, 23, 26, .08) !important;
          }

          .table-wrap {
            overflow: auto !important;
          }

          table {
            border-color: #ebeef5 !important;
            background: #ffffff !important;
          }

          thead,
          thead tr,
          th {
            background: #fafafa !important;
          }

          th {
            border-color: #ebeef5 !important;
            color: #606266 !important;
            font-size: 13px !important;
            font-weight: 600 !important;
          }

          td {
            border-color: #ebeef5 !important;
            color: #303133 !important;
          }

          tbody tr:hover td {
            background: #f5f7fa !important;
          }

          .badge,
          .status,
          .status-badge,
          .tag,
          .pill {
            border-radius: 999px !important;
            font-weight: 500 !important;
          }

          .pagination,
          .table-pagination {
            border-color: #ebeef5 !important;
            background: #ffffff !important;
          }

          .modal-backdrop,
          .drawer-backdrop,
          .overlay {
            background: rgba(0, 0, 0, .42) !important;
            backdrop-filter: none !important;
          }

          .modal,
          .modal-card,
          .dialog,
          .drawer,
          .drawer-panel,
          .side-panel {
            border-color: #e4e7ed !important;
            border-radius: 8px !important;
            background: #ffffff !important;
            box-shadow: 0 16px 48px rgba(0, 0, 0, .14) !important;
          }

          @media (max-width: 900px) {
            .content { padding: 16px !important; }
            .page-head { padding: 16px !important; }
            .filters, .filter-bar, .toolbar { padding: 12px !important; }
            .btn { min-height: 40px; }
          }

          @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after {
              scroll-behavior: auto !important;
              transition-duration: .01ms !important;
              animation-duration: .01ms !important;
              animation-iteration-count: 1 !important;
            }
          }
        </style>`;
}

function shellPatch(normalizedHash, sourceKey) {
  return `
        <style id="hsUnifiedEmbeddedShell">
          html, body { width: 100% !important; min-height: 100% !important; height: auto !important; overflow: auto !important; }
          body > .app, body > .app-shell { width: 100% !important; min-height: 100vh !important; display: block !important; }
          body > .app > .workspace, body > .app-shell > .main {
            width: 100% !important; min-width: 0 !important; min-height: 100vh !important;
            display: block !important; grid-template-columns: minmax(0, 1fr) !important;
            grid-template-rows: minmax(0, 1fr) !important;
          }
          body > .app > .workspace > .content, body > .app-shell > .main > .content,
          body > .app-shell > .main > .workspace { min-width: 0 !important; width: 100% !important; }
        </style>
        ${visualBaselinePatch(sourceKey)}
        <script>
          const hsNativeReplaceState = window.history.replaceState.bind(window.history);
          window.history.replaceState = (...args) => {
            try { return hsNativeReplaceState(...args); } catch (_) { return undefined; }
          };
          window.__UNIFIED_DEMO_HASH = ${JSON.stringify(normalizedHash)};
          if (window.__UNIFIED_DEMO_HASH) {
            try { window.history.replaceState(null, "", "#" + window.__UNIFIED_DEMO_HASH); } catch (_) {}
          }
        </script>
      `;
}

const routeSync = `
        <script>
          (() => {
            const applyUnifiedRoute = () => {
              const route = window.__UNIFIED_DEMO_HASH || "";
              if (window.channelDemo?.setActiveModule && ["vendors", "collectionChannels", "payoutChannels", "collectionProducts", "payoutProducts"].includes(route)) {
                window.channelDemo.setActiveModule(route);
              }
              if (["login", "bind", "exception"].includes(route)) {
                if (!window.__HSPlatformLoginPrototype?.openView?.(route)) {
                  document.body.dataset.loginView = route;
                  document.querySelectorAll("[data-view]").forEach(panel => {
                    panel.hidden = panel.dataset.view !== route;
                  });
                }
              }
            };
            if (document.readyState === "complete") applyUnifiedRoute();
            else window.addEventListener("load", () => window.setTimeout(applyUnifiedRoute, 0), { once: true });
          })();
        </script>
      `;

export async function prepareEmbeddedDocument(sourceKey, initialHash = '') {
  let html = await fetchSource(sourceKey);
  const guardCode = sourceKey === 'authGuard' ? '' : await fetchSource('authGuard');
  const normalizedHash = String(initialHash || '').replace(/^#/, '');
  html = html.replace(
    /<script\s+src=(["'])\.\.\/platform-auth-route-guard\.js\1([^>]*)><\/script>/gi,
    (_match, _quote, attributes) => `<script${attributes}>${guardCode}</script>`
  );
  html = html.replace(
    /<aside\b[^>]*class=["'][^"']*\bsidebar\b[^"']*["'][^>]*>[\s\S]*?<\/aside>/i,
    match => match.replace(/<aside\b/i, '<aside hidden aria-hidden="true" style="display:none!important"')
  );
  html = html.replace(
    /<header\b[^>]*class=["'][^"']*\btopbar\b[^"']*["'][^>]*>[\s\S]*?<\/header>/i,
    match => match.replace(/<header\b/i, '<header hidden aria-hidden="true" style="display:none!important"')
  );
  html = html.replace(/<\/head>/i, `${shellPatch(normalizedHash, sourceKey)}</head>`);
  html = html.replace(/<\/body>/i, `${routeSync}</body>`);
  return html;
}
