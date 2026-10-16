import { useCallback, useEffect, useRef, useState } from 'react';
import { mountFrameDocument } from '../../../src/frame-document.js';
import { Layout, Menu, Breadcrumb, Spin, Result, Tag, Button } from '@arco-design/web-react';
import { MODULES, NAV_GROUPS, UTILITY_ITEMS } from './modules.js';
import { prepareEmbeddedDocument } from './embed.js';

const Sider = Layout.Sider;
const Header = Layout.Header;
const Content = Layout.Content;
const MenuItem = Menu.Item;
const ItemGroup = Menu.ItemGroup;

const NAV_PATHS = [
  'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M17 4a4 4 0 0 1 0 8M23 21v-2a4 4 0 0 0-3-3.87M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  'm12 3 9 5-9 5-9-5 9-5Zm-9 5v9l9 5 9-5V8M12 13v9',
  'M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7l-9-4Zm-4 9 3 3 5-6',
  'M4 5h16v15H4zM4 9h16M8 13h3M8 16h7',
  'M5 3v18M5 6h15M5 12h15M5 18h15M9 4v4M16 10v4M11 16v4',
  'm9 3-1 3-3 1 1 4-2 2 2 3 3-1 3 2 3-2 3 1 2-3-2-2 1-4-3-1-1-3Zm6 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'
];
function NavIcon({ index = 0, small = false }) {
  return <span className={'tenant-nav-icon tone-' + index % 7 + (small ? ' is-small' : '')} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={NAV_PATHS[index % NAV_PATHS.length]} /></svg></span>;
}


// Retired report links resolve to the current merchant collection report.
const resolvePageId = id => id === 'reports' ? 'merchant-collect-daily' : id === 'reconciliation' ? 'home' : id;

export default function App() {
  const [activePage, setActivePage] = useState(() => {
    const fromHash = resolvePageId(window.location.hash.slice(1));
    return MODULES[fromHash] ? fromHash : 'home';
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const frameRef = useRef(null);
  const frameHostRef = useRef(null);
  const requestRef = useRef(0);
  const loadingRef = useRef(true);

  const openPage = useCallback(async (pageId, { updateHash = true } = {}) => {
    const request = ++requestRef.current;
    pageId = resolvePageId(pageId);
    const config = MODULES[pageId] || MODULES.home;
    const resolved = MODULES[pageId] ? pageId : 'home';
    setActivePage(resolved);
    setLoading(true);
    loadingRef.current = true;
    setError('');
    try {
      const doc = await prepareEmbeddedDocument(config.sourceKey, config.module);
      const host = frameHostRef.current;
      if (!host || request !== requestRef.current) return;
      mountFrameDocument(host, doc, { title: '汇盛支付租户端 · ' + config.label, frameRef, dataset: { initialHash: config.initialHash || '' }, onLoad: () => {
        if (request !== requestRef.current) return;
        if (loadingRef.current) { loadingRef.current = false; setLoading(false); }
      }});
      if (updateHash) {
        // 内页路由由 activePage 管理，不让内页改写外壳地址。
        try { window.history.replaceState(null, '', '#' + resolved); } catch {}
      }
    } catch (err) {
      if (request !== requestRef.current) return;
      setError(String(err?.message || err));
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => () => { requestRef.current++; }, []);

  useEffect(() => { openPage(activePage, { updateHash: false }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 旧壳对外的 postMessage API：内页跨页导航用 hs-unified-open-page（口径不变）
  useEffect(() => {
    const onMessage = (event) => {
      const data = event.data;
      if (data?.type === 'hs-unified-open-page' && MODULES[resolvePageId(data.pageId)]) openPage(data.pageId);
    };
    const onHashChange = () => openPage(window.location.hash.slice(1), { updateHash: false });
    window.addEventListener('message', onMessage);
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [openPage]);

  const config = MODULES[activePage] || MODULES.home;
  const isAuthenticationEntry = activePage === 'login';

  return (
    <Layout className={'tenant-shell' + (isAuthenticationEntry ? ' authentication-entry-shell' : '')} style={{ height: '100vh' }}>
      {!isAuthenticationEntry && <Sider className="tenant-sider" width={220} style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="tenant-brand">
          <Tag color="arcoblue" style={{ fontWeight: 600 }}>HS</Tag>
          <span><strong>汇盛支付</strong><br /><small style={{ color: 'var(--color-text-3)' }}>租户端控制台</small></span>
        </div>
        <Menu
          style={{ flex: 1, overflowY: 'auto' }}
          selectedKeys={[activePage]}
          onClickMenuItem={(key) => openPage(key)}
        >
          {NAV_GROUPS.map((group, groupIndex) => (
            <ItemGroup key={group.title} title={<span className="tenant-nav-group"><NavIcon index={groupIndex} />{group.title}</span>}>
              {group.items.map((item, itemIndex) => (
                <MenuItem key={item.id}><NavIcon index={groupIndex + itemIndex + 1} small /><span>{item.label}</span></MenuItem>
              ))}
            </ItemGroup>
          ))}
        </Menu>
        <div className="tenant-utilities">
          {UTILITY_ITEMS.map(item => (
            <Button
              key={item.id}
              type={activePage === item.id ? 'primary' : 'text'}
              size="small"
              style={{ display: 'block', width: '100%', textAlign: 'left' }}
              onClick={() => openPage(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </Sider>}
      <Layout>
        {!isAuthenticationEntry && <>
          <Header className="tenant-header">
            <h1>{config.label}</h1>
            <span className="tenant-header-brand">汇盛支付 · 租户端</span>
          </Header>
          <div className="tenant-pagebar">
            <Breadcrumb>
              <Breadcrumb.Item>租户端</Breadcrumb.Item>
              <Breadcrumb.Item>{config.group}</Breadcrumb.Item>
              <Breadcrumb.Item>{config.label}</Breadcrumb.Item>
            </Breadcrumb>
          </div>
        </>}
        <Content style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          {loading && !error && (
            <div className="frame-overlay"><Spin tip="正在加载专项页面" /></div>
          )}
          {error && (
            <div className="frame-overlay">
              <Result status="error" title="页面来源缺失" subTitle={error} />
            </div>
          )}
          <div ref={frameHostRef} className="embedded-frame-host" />
        </Content>
      </Layout>
    </Layout>
  );
}
