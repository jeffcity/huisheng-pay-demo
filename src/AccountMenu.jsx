import { useState } from 'react';
import { Button, Dropdown, Menu, Modal, Form, Input, Message } from '@arco-design/web-react';
import { IconUser, IconLock, IconExport } from '@arco-design/web-react/icon';
import './account-menu.css';

const empty = () => ({ oldPassword: '', newPassword: '', confirmPassword: '', otp: '' });
export default function AccountMenu({ session, onLogout }) {
  const [visible, setVisible] = useState(false), [values, setValues] = useState(empty), [error, setError] = useState(null), [saving, setSaving] = useState(false);
  const close = () => { if (saving) return; setVisible(false); setValues(empty()); setError(null); };
  const choose = key => { if (key === 'logout') onLogout(); else { setValues(empty()); setError(null); setVisible(true); } };
  const save = async () => {
    if (saving) return;
    setSaving(true); setError(null);
    try {
      const result = await session.changePassword(values);
      if (!result.ok) { setError(result); setValues(v => ({ ...v, otp: '' })); return; }
      setValues(empty()); setVisible(false); Message.success('密码修改成功，请重新登录'); onLogout();
    } catch { setError({ field: 'oldPassword', message: '修改失败，请重试' }); }
    finally { setSaving(false); }
  };
  const field = (name, label, password = true) => <Form.Item label={label} required validateStatus={error?.field === name ? 'error' : undefined} help={error?.field === name ? error.message : undefined}>
    {password ? <Input.Password aria-label={label} autoComplete={name === 'oldPassword' ? 'current-password' : 'new-password'} value={values[name]} disabled={saving} placeholder={'请输入' + label} onChange={value => setValues(v => ({ ...v, [name]: value }))} /> : <Input aria-label={label} autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={values.otp} disabled={saving} placeholder="请输入6位Google验证码" onChange={value => setValues(v => ({ ...v, otp: value.replace(/\D/g, '') }))} />}
  </Form.Item>;
  return <>
    <Dropdown trigger="click" position="br" droplist={<Menu onClickMenuItem={choose}><Menu.Item key="password"><IconLock /> 修改密码</Menu.Item><Menu.Item key="logout"><IconExport /> 登出</Menu.Item></Menu>}>
      <Button className="shell-account-button" shape="circle" aria-label="账户菜单" title="账户菜单" icon={<IconUser />} />
    </Dropdown>
    <Modal title="修改密码" visible={visible} maskClosable={false} closable={!saving} onCancel={close} onOk={save} confirmLoading={saving} cancelButtonProps={{ disabled: saving }} okText="确定" cancelText="取消" style={{ width: 420, maxWidth: 'calc(100vw - 32px)' }} className="shell-password-modal" unmountOnExit>
      <div className="shell-current-account">当前账号：{session.getAccount()}</div>
      <Form layout="vertical" onSubmit={save}>
        {field('oldPassword', '原密码')}
        {field('newPassword', '新密码')}
        {field('confirmPassword', '确认新密码')}
        {field('otp', 'Google验证码', false)}
      </Form>
    </Modal>
  </>;
}
