// Local review state only. New passwords are held as digests in memory, never persisted.
export function createOwnAccountSession(initial, cryptoApi = globalThis.crypto) {
  let identity = { ...initial }, revision = 0;
  const changed = new Map();
  const digest = async value => Array.from(new Uint8Array(await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(n => n.toString(16).padStart(2, '0')).join('');
  async function verifyLogin(account, password, baseline = null) {
    const saved = changed.get(account);
    return saved ? saved === await digest(password) : baseline === null || password === baseline;
  }
  return Object.freeze({
    getAccount: () => identity.account,
    setCurrent(account, baselinePassword, otp) { identity = { account, baselinePassword, otp }; revision++; },
    verifyLogin,
    async changePassword(fields) {
      const snapshot = identity, version = revision;
      for (const field of ['oldPassword', 'newPassword', 'confirmPassword', 'otp']) if (!fields[field]) return { field, message: '请填写此项' };
      if (fields.newPassword === fields.oldPassword) return { field: 'newPassword', message: '新密码不能与原密码相同' };
      if (fields.newPassword !== fields.confirmPassword) return { field: 'confirmPassword', message: '两次输入的新密码不一致' };
      if (!/^\d{6}$/.test(fields.otp)) return { field: 'otp', message: '请输入6位Google验证码' };
      if (fields.otp !== snapshot.otp) return { field: 'otp', message: 'Google验证码不正确或已过期' };
      if (!await verifyLogin(snapshot.account, fields.oldPassword, snapshot.baselinePassword)) return { field: 'oldPassword', message: '原密码不正确' };
      const next = await digest(fields.newPassword);
      if (version !== revision) return { field: 'oldPassword', message: '当前登录账号已变化，请重新打开' };
      changed.set(snapshot.account, next);
      return { ok: true };
    }
  });
}
