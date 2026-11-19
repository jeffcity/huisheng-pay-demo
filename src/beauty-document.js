// Thin embedding adapter: business handlers and source fixtures remain those of Bluepay.
export function prepareBeautyDocument(source, { surface = 'ADMIN', boot = '', pageId = '', tenantId = 'HS-TEN-001' } = {}) {
  if (!/^HS-TEN-[A-Z0-9-]+$/.test(tenantId)) throw Error('租户上下文无效');
  const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
  let html = source.replaceAll('蓝盛支付', '汇盛支付');
  // Each mounted document captures one tenant. Business handlers retain their existing flow.
  html = html.replace(/(['"])bluepay\./g, '$1huisheng.' + tenantId + '.');
  html = html.replace(/\blocalStorage\.(getItem|setItem|removeItem)\(/g, 'window.HSBeautyStorage.$1(');
  const scope = `(() => {
    const tenantId=${json(tenantId)},prefix='huisheng.'+tenantId+'.';
    document.documentElement.dataset.beautyTenant=tenantId;
    function check(key){
      const model=window.top.__HSBeautyDemo;
      if(!model || model.currentTenantId!==tenantId || !model.enabled(tenantId))throw Error('租户上下文或美人桥授权已变化，请重新打开页面');
      if(typeof key!=='string'||!key.startsWith(prefix))throw Error('不能访问其他租户的美人桥数据');
    }
    window.HSBeautyStorage={
      getItem(key){check(key);return localStorage.getItem(key)},
      setItem(key,value){check(key);localStorage.setItem(key,value)},
      removeItem(key){check(key);localStorage.removeItem(key)}
    };
  })();`;
  const bridge = `<script>${scope}window.__BP_EMBED__=true;window.__BP_SURFACE__=${json(surface)};window.__BP_BOOT__=${json(boot)};window.__BP_PAGE_ID__=${json(pageId)};<\/script>
<style id="hs-beauty-embed">
:root{--primary:#245665;--primary-hover:#193f4b;--primary-soft:#edf3f5;--blue:#245665;--bg:#f3f6f7;--text:#172a32;--line:#e5ecef;--border:#e5ecef}
html,body{min-width:0!important;margin:0!important}body{overflow:auto!important;background:#f3f6f7!important}
.sidebar,aside.rail,.rail,#sideMenu,.sys-badge,#sysBadge,#brandBar,.sidebar-brand,.topbar,header.top,.tabs-shell,.tabs:not(.curr-tabs){display:none!important}
.app,.app-shell{display:block!important;min-width:0!important}.workspace,main,.main{margin-left:0!important;min-width:0!important;width:100%!important}.workspace{padding-top:0!important}
button:focus-visible,a:focus-visible{outline:2px solid #245665;outline-offset:2px}
</style>`;
  html = html.replace(/<html(\s|>)/i, '<html class="bp-embed"$1');
  // Boot globals must precede the original business scripts (some are inside the head).
  const split = bridge.indexOf('<style');
  return html.replace(/<head[^>]*>/i, match => match + bridge.slice(0, split)).replace('</head>', bridge.slice(split) + '</head>');
}
