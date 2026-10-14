import test from 'node:test';
import assert from 'node:assert/strict';
import { mountFrameDocument } from '../src/frame-document.js';
function host({insertionLoad=false}={}){
 let current=null;const callbacks=new Map();
 const h={ownerDocument:{createElement(){
  const frame={dataset:{},contentWindow:{name:''},isConnected:true,addEventListener(type,handler){callbacks.set(this,handler);}};
  frame.contentDocument={readyState:'complete',html:'',documentElement:null,open(){this.html='';this.readyState='loading';},write(html){assert.equal(frame.parentElement,h);this.html=html;this.documentElement={};this.hashAtWrite=frame.dataset.initialHash;},close(){this.readyState='complete';}};
  return frame;
 }},querySelector:()=>current,replaceChildren(next){if(current){current.parentElement=null;current.isConnected=false;}current=next;next.parentElement=h;if(insertionLoad)callbacks.get(next)({type:'load'});}};
 return {h,callbacks,get frame(){return current;}};
}
test('内嵌文档完整挂载，新窗口隔离脚本，预设路由和当前引用先于内页脚本生效',()=>{
 const state=host(),ref={current:null};
 const first=mountFrameDocument(state.h,'<html><body>first</body></html>',{frameRef:ref,title:'页面一',dataset:{initialHash:'login'}});
 assert.equal(ref.current,first);assert.ok(first.contentDocument.documentElement);assert.equal(first.contentDocument.hashAtWrite,'login');assert.equal(first.title,'页面一');
 first.contentWindow.name='one-use-context';
 const second=mountFrameDocument(state.h,'<html><body>second</body></html>',{frameRef:ref});
 assert.notEqual(first.contentWindow,second.contentWindow);assert.equal(ref.current,second);assert.equal(second.contentWindow.name,'one-use-context');
 assert.ok(second.contentDocument.documentElement);assert.equal(state.h.querySelector('iframe'),second);assert.equal(first.isConnected,false);
});
test('已卸载 iframe 的 load 不再清除当前加载状态或发送当前页上下文',()=>{
 const state=host();let firstCalls=0,secondCalls=0;
 const first=mountFrameDocument(state.h,'first',{onLoad:()=>firstCalls++});
 const second=mountFrameDocument(state.h,'second',{onLoad:()=>secondCalls++});
 state.callbacks.get(first)({});state.callbacks.get(second)({});
 assert.equal(firstCalls,0);assert.equal(secondCalls,1);
});

 test('插入空白页load不能消费上下文，完整内页就绪后仅交付一次',()=>{
 const state=host({insertionLoad:true}),ref={current:null};let pending={page:'member-detail'},calls=0;
 const frame=mountFrameDocument(state.h,'<html><body>ready</body></html>',{frameRef:ref,onLoad:()=>{assert.equal(ref.current,state.frame);assert.equal(ref.current.contentDocument.html,'<html><body>ready</body></html>');calls++;pending=null;}});
 assert.ok(pending);assert.equal(calls,0);
 state.callbacks.get(frame)({});state.callbacks.get(frame)({});
 assert.equal(calls,1);assert.equal(pending,null);
});
