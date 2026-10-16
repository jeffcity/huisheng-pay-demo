# iframe 装载与标注生命周期

用户于2026-10-14将本次兼容方式确认为长期 Demo 制作规则。UGame SaaS 曾出现初始平台端可标注、关闭标注切到租户后全页失效、返回平台仍失效，且报 MutationObserver.observe Node 参数异常。新窗口同步装载后用户确认两端都能标注；精确的浏览器注入调用栈未取得。

## 实现要点

- HTML壳：创建新 iframe → 安装load监听及必要属性 → 接入宿主 → 更新当前frame引用 → 同步写入完整文档。重复write到同一个窗口会留下全局const，导致再次装载脚本报错。
- React壳：React拥有稳定div宿主；函数拥有其iframe子节点。request序号/取消机制拒绝旧加载结果，load回调仅服务已完成写入、document已complete且仍接入的当前frame，并只交付一次；插入阶段的about:blank load不能消费业务上下文。
- 内页脚本运行前设置路由/context/dataset。保留既有源fetch/includes、相对资源解析与明确的存储/window.name协议；旧frame的消息需继续被来源检查拒绝。
- 同时检查嵌套VIP返水、客户端预览、商户包装页；按原有仓库入口/构建契约维护，不新建平行Demo。安全隔离限制存在时先验证适用性，不为标注改变安全约束。

## 最小装载示意

以下html必须来自项目原有prepare/build管线，项目特有引用与路由需在write前设置：

```js
function mountDocument(host, html, { title, frameRef, onLoad, dataset = {} } = {}) {
  const previous = host.querySelector('iframe');
  const windowName = previous?.contentWindow?.name || '';
  const frame = host.ownerDocument.createElement('iframe');
  frame.title = title || 'Demo';
  frame.referrerPolicy = 'no-referrer';
  Object.assign(frame.dataset, dataset);
  let written = false, notified = false;
  frame.addEventListener('load', event => {
    if (!written || notified || frame.parentElement !== host || !frame.isConnected || frame.contentDocument?.readyState !== 'complete') return;
    notified = true;
    onLoad?.(event);
  });
  host.replaceChildren(frame);
  if (frameRef) frameRef.current = frame;
  frame.contentWindow.name = windowName;
  const document = frame.contentDocument;
  document.open();
  document.write(html);
  written = true;
  document.close();
  return frame;
}
```

## 验收与证据

- 开标注→关标注→切端→再开标注→返回；顶部和业务内容分别选中。补验菜单、重新载入、前进后退、快速切页与上下文传递。
- 结束Agent浏览器操作后由人工操作标注；服务正常、重启成功、构建或控制台检查均不能单独作为恢复证据。
- 三套迁移代码/导航检查通过与各自人工标注确认分别记录，不沿用其他项目的验收结论。
- 本文是项目可复用的制作规范；无需读取旧日志或依赖特定本机服务器端口。
