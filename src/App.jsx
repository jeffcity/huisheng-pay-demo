import React, { useCallback, useEffect, useRef, useState } from 'react';
import AccountMenu from './AccountMenu.jsx';
import { createOwnAccountSession } from './own-account-session.js';
import { mountFrameDocument } from './frame-document.js';
import { Layout, Menu, Breadcrumb, Input, Tag, Spin, Result } from '@arco-design/web-react';
import {
  IconHome, IconUser, IconApps, IconStorage, IconCalendarClock, IconBranch,
  IconCalendar, IconBook, IconList, IconSafe, IconCommon, IconSettings
} from '@arco-design/web-react/icon';
import { MODULES, NAV_GROUPS } from './modules.js';
import { prepareEmbeddedDocument } from './embed.js';

const accountSession = createOwnAccountSession({ account: 'platform.ops.demo', baselinePassword: 'DemoPass2026', otp: '246810' });
window.__HSOwnAccountDemo = accountSession;

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
  const initialModule = new URLSearchParams(window.location.search).get('platformPage');
  const [activeModule, setActiveModule] = useState(MODULES[initialModule] ? initialModule : 'home');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openGroups, setOpenGroups] = useState(['日终']);
  const frameRef = useRef(null);
  const frameHostRef = useRef(null);
  const requestRef = useRef(0);
  const searchRef = useRef('');

  const openModule = useCallback(async (moduleId, hash) => {
    const request = ++requestRef.current;
    const aliases = { report: 'platform-collect-daily', 'tenant-daily-report': 'platform-collect-daily', 'channel-daily-report': 'collect-channel-daily', ledger: 'channel-pay-change' };
    if (aliases[moduleId]) { moduleId = aliases[moduleId]; hash = MODULES[moduleId]?.initialHash; }
    const target = MODULES[moduleId] || MODULES.home;
    const sourceGuard = frameRef.current?.contentWindow?.HSPlatformAuthRouteGuard;
    if (target.subgroup && sourceGuard?.isAuthRouteMode()) {
      const navigation = sourceGuard.createAuthorizedNavigation({ href: window.location.pathname + '?platformPage=' + encodeURIComponent(moduleId) + '#' + moduleId, pagePermission: 'platform.report.' + moduleId + '.view' });
      if (!navigation.ok) { setError('当前账号无目标报表权限或登录状态已变化'); return; }
      window.top.location.assign(navigation.href);
      return;
    }

    if (target.subgroup) setOpenGroups(keys => keys.includes(target.subgroup) ? keys : [...keys, target.subgroup]);
    setActiveModule(MODULES[moduleId] ? moduleId : 'home');
    setLoading(true);
    setError('');
    try {
      const doc = await prepareEmbeddedDocument(target.sourceKey, hash ?? target.initialHash);
      const host = frameHostRef.current;
      if (!host || request !== requestRef.current) return;
      mountFrameDocument(host, doc, { title: '汇盛支付平台端 · ' + target.label, frameRef, onLoad: () => {
        if (request === requestRef.current) setLoading(false);
      }});
    } catch (err) {
      if (request !== requestRef.current) return;
      setError(String(err?.message || err));
      setLoading(false);
    }
  }, []);

  useEffect(() => () => { requestRef.current++; }, []);

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
      "#globalSearch, #keywordFilter, #keyword, [data-page-filter='0'], input[type='search']"
    );
    if (!target) return;
    target.value = value;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    target.focus();
  };

  const logout = () => {
    try {
      const storage = window.sessionStorage;
      for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i);
        if (key === 'hs.platform.auth-route.current-fact' || key?.startsWith('hs.platform.auth-route.ticket.')) storage.removeItem(key);
      }
    } catch {}
    openModule('login-form');
  };

  const isAuthenticationEntry = activeModule === 'login-form';
  const activeTarget = MODULES[activeModule] || MODULES.home;
  const navLabel = (id) => {
    const item = NAV_GROUPS.flatMap(g => [...(g.items || []), ...(g.subgroups || []).flatMap(s => s.items)])
      .find(i => i.module === id);
    return item?.label || MODULES[id]?.label || '';
  };

  return (
    <Layout className="platform-shell" style={{ height: '100vh' }}>
      {!isAuthenticationEntry && <Sider className="platform-sider" width={220} style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="platform-brand">
          <Tag color="arcoblue" style={{ fontWeight: 600 }}>HS</Tag>
          <span><strong>汇盛支付</strong><br /><small style={{ color: 'var(--color-text-3)' }}>平台端控制台</small></span>
        </div>
        <Menu
          style={{ flex: 1, overflowY: 'auto' }}
          selectedKeys={[activeTarget.navId || activeModule]}
          openKeys={openGroups}
          onClickSubMenu={(_, keys) => setOpenGroups(keys)}
          onClickMenuItem={(key) => openModule(key)}
        >
          {NAV_GROUPS.map((group, groupIndex) => (
            <ItemGroup key={group.title} title={<span className="platform-nav-group">{group.title}</span>}>
              {group.subgroups?.map(sub => (
                <SubMenu key={sub.title} title={<span className="platform-submenu-title"><span className="platform-nav-icon is-small" aria-hidden="true">{sub.title === '账户记录' ? <IconBook /> : <IconCalendar />}</span><span>{sub.title}</span></span>}>
                  {sub.items.map(item => (
                    <MenuItem key={item.module}><span className={'platform-nav-icon is-small tone-' + (groupIndex + 2) % 7} aria-hidden="true">{MODULE_ICON[item.module] || (sub.title === '账户记录' ? <IconBook /> : <IconCalendar />)}</span><span>{item.label}</span></MenuItem>
                  ))}
                </SubMenu>
              ))}
              {group.items?.map((item, itemIndex) => (
                <MenuItem key={item.module}><span className={'platform-nav-icon is-small tone-' + (groupIndex + itemIndex + 1) % 7} aria-hidden="true">{MODULE_ICON[item.module] || <IconCommon />}</span><span>{item.label}</span></MenuItem>
              ))}
            </ItemGroup>
          ))}
        </Menu>
      </Sider>}
      <Layout>
        {!isAuthenticationEntry && <>
        <Header className="platform-header">
          <h1>{navLabel(activeTarget.navId || activeModule)}</h1>
          <div className="platform-header-actions">
            <Input.Search
              style={{ width: 280 }}
              placeholder="搜索租户、订单、通道、审计单号"
              onChange={v => { searchRef.current = v; }}
              onSearch={onShellSearch}
            />
            <Tag color="green">生产只读</Tag>
            <Tag color="arcoblue">平台超管</Tag>
            <AccountMenu session={accountSession} onLogout={logout} />
          </div>
        </Header>
        <div className="platform-pagebar">
          <Breadcrumb>
            <Breadcrumb.Item>平台端</Breadcrumb.Item>
            {activeTarget.subgroup && <Breadcrumb.Item>报表模块</Breadcrumb.Item>}
            {activeTarget.subgroup && <Breadcrumb.Item>{activeTarget.subgroup}</Breadcrumb.Item>}
            <Breadcrumb.Item>{navLabel(activeTarget.navId || activeModule)}</Breadcrumb.Item>
          </Breadcrumb>
        </div>
        </>}
        <Content style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          {loading && !error && (
            <div className="frame-overlay"><Spin tip="正在载入审查页面" /></div>
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
