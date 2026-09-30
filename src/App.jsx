import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Layout, Menu, Breadcrumb, Input, Tag, Spin, Result } from '@arco-design/web-react';
import {
  IconHome, IconUser, IconApps, IconStorage, IconCalendarClock, IconBranch,
  IconCalendar, IconBook, IconList, IconSafe, IconCommon, IconSettings
} from '@arco-design/web-react/icon';
import { MODULES, NAV_GROUPS } from './modules.js';
import { prepareEmbeddedDocument } from './embed.js';

const Sider = Layout.Sider;
const Header = Layout.Header;
const Content = Layout.Content;
const MenuItem = Menu.Item;
const SubMenu = Menu.SubMenu;
const ItemGroup = Menu.ItemGroup;

const MODULE_ICON = {
  home: <IconHome />, 'tenant-list': <IconUser />, business: <IconApps />,
  'tenant-create': <IconUser />,
  wallets: <IconStorage />, funds: <IconCalendarClock />, 'channel-vendors': <IconBranch />,
  'tenant-daily-report': <IconCalendar />, 'channel-daily-report': <IconCalendar />,
  ledger: <IconBook />, orders: <IconList />, audit: <IconSafe />,
  'system-accounts': <IconSettings />, 'system-roles': <IconSettings />,
  'system-security': <IconSafe />, 'system-menus': <IconList />,
  'login-form': <IconSafe />, 'login-bind': <IconSafe />, 'login-exception': <IconSafe />,
};

export default function App() {
  const [activeModule, setActiveModule] = useState('home');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const frameRef = useRef(null);
  const searchRef = useRef('');

  const openModule = useCallback(async (moduleId, hash) => {
    const target = MODULES[moduleId] || MODULES.home;
    setActiveModule(MODULES[moduleId] ? moduleId : 'home');
    setLoading(true);
    setError('');
    try {
      const doc = await prepareEmbeddedDocument(target.sourceKey, hash ?? target.initialHash);
      const frame = frameRef.current;
      if (!frame) return;
      frame.title = '汇盛支付平台端 · ' + target.label;
      frame.srcdoc = doc;
    } catch (err) {
      setError(String(err?.message || err));
      setLoading(false);
    }
  }, []);

  useEffect(() => { openModule(activeModule); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 旧壳对外的 postMessage API 与全局对象，供内页跨模块导航复用（口径不变）
  useEffect(() => {
    const onMessage = (event) => {
      const data = event.data;
      if (!data || data.type !== 'hs-demo-open-module') return;
      openModule(data.module, typeof data.hash === 'string' ? data.hash : undefined);
    };
    window.addEventListener('message', onMessage);
    window.__HSPlatformTotalDemo = Object.freeze({
      openModule,
      getActiveModule: () => activeModule,
      getSourceKey: moduleId => MODULES[moduleId]?.sourceKey || null,
      getModuleIds: () => Object.keys(MODULES)
    });
    return () => window.removeEventListener('message', onMessage);
  }, [openModule, activeModule]);

  const onShellSearch = (value) => {
    const childDocument = frameRef.current?.contentDocument;
    const target = childDocument?.querySelector(
      "#globalSearch, #keywordFilter, [data-page-filter='0'], input[type='search']"
    );
    if (!target) return;
    target.value = value;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    target.focus();
  };

  const activeTarget = MODULES[activeModule] || MODULES.home;
  const navLabel = (id) => {
    const item = NAV_GROUPS.flatMap(g => [...(g.items || []), ...(g.subgroups || []).flatMap(s => s.items)])
      .find(i => i.module === id);
    return item?.label || MODULES[id]?.label || '';
  };

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider width={220} style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="platform-brand">
          <Tag color="arcoblue" style={{ fontWeight: 600 }}>HS</Tag>
          <span><strong>汇盛支付</strong><br /><small style={{ color: 'var(--color-text-3)' }}>平台端控制台</small></span>
        </div>
        <Menu
          style={{ flex: 1, overflowY: 'auto' }}
          selectedKeys={[activeTarget.navId || activeModule]}
          defaultOpenKeys={['report']}
          onClickMenuItem={(key) => openModule(key)}
        >
          {NAV_GROUPS.map(group => (
            <ItemGroup key={group.title} title={group.title}>
              {group.subgroups?.map(sub => (
                <SubMenu key={sub.title === '日终统计' ? 'report' : sub.title} title={sub.title} icon={<IconCalendar />}>
                  {sub.items.map(item => (
                    <MenuItem key={item.module}>{item.label}</MenuItem>
                  ))}
                </SubMenu>
              ))}
              {group.items?.map(item => (
                <MenuItem key={item.module}>{MODULE_ICON[item.module]}{item.label}</MenuItem>
              ))}
            </ItemGroup>
          ))}
        </Menu>
      </Sider>
      <Layout>
        <Header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}>
          <Breadcrumb>
            <Breadcrumb.Item>平台端</Breadcrumb.Item>
            <Breadcrumb.Item>{navLabel(activeTarget.navId || activeModule)}</Breadcrumb.Item>
          </Breadcrumb>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Input.Search
              style={{ width: 280 }}
              placeholder="搜索租户、订单、通道、审计单号"
              onChange={v => { searchRef.current = v; }}
              onSearch={onShellSearch}
            />
            <Tag color="green">生产只读</Tag>
            <Tag color="arcoblue">平台超管</Tag>
          </div>
        </Header>
        <Content style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          {loading && !error && (
            <div className="frame-overlay"><Spin tip="正在载入审查页面" /></div>
          )}
          {error && (
            <div className="frame-overlay">
              <Result status="error" title="页面来源缺失" subTitle={error} />
            </div>
          )}
          <iframe
            ref={frameRef}
            title="汇盛支付平台端页面"
            referrerPolicy="no-referrer"
            onLoad={() => setLoading(false)}
          />
        </Content>
      </Layout>
    </Layout>
  );
}
