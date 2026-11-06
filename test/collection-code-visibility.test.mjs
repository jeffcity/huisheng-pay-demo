import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../surfaces/tenant/public/legacy/sources/channels.html',import.meta.url),'utf8');
const ctx=vm.createContext({});
vm.runInContext(source.slice(source.indexOf(' function parseCollectionSearch('),source.indexOf(' function renderCollectionRate(')),ctx);
const codes=[{id:'a',code:'A1',name:'银行',todayAmount:'2'},{id:'b',code:'B1',name:'扫码',todayAmount:'1,200'},{id:'c',code:'C1',name:'备用',todayAmount:'0'},{id:'d',code:'D1',name:'备用2',todayAmount:'0'},{id:'e',code:'E1',name:'备用3',todayAmount:'0'}];
const parent={id:'CH1',name:'云通道',vendor:'Cloud',thirdCode:'A1',collectionTypes:codes};
const view=(terms=[],favorites=[],expanded=false)=>ctx.collectionCodeView(parent,terms,new Set(favorites),expanded);
const ids=v=>Array.from(v.codes,c=>c.id);
test('默认3条，常用优先、成交数值降序，同值保留原顺序且不修改源数组',()=>{
 assert.deepEqual(ids(view()),['b','a','c']);assert.deepEqual(ids(view([],['e'])),['e','b','a']);assert.equal(view().canFold,true);assert.equal(view().total,5);assert.deepEqual(ids(view([],[],true)),['b','a','c','d','e']);assert.deepEqual(codes.map(c=>c.id),['a','b','c','d','e']);
});
test('批量关键词去空去重，支持中英文逗号、分号和换行，保留名称中的空格',()=>{
 assert.deepEqual(Array.from(ctx.parseCollectionSearch(' A1，B1;A1； C1\r\nCloud Pay,\n')),['a1','b1','c1','cloud pay']);
});
test('搜索命中的折叠编码直接显示，父子名称编码使用任一项匹配，不匹配为空',()=>{
 assert.equal(ctx.collectionMatches(parent,['e1']),true);assert.deepEqual(ids(view(['e1'])),['e']);assert.deepEqual(ids(view(['备用'])),['c','d','e']);assert.deepEqual(ids(view(['a1','e1'])),['a','e']);assert.equal(ctx.collectionMatches(parent,['missing']),false);assert.deepEqual(ids(view(['missing'])),[]);assert.equal(view(['cloud']).codes.length,5);assert.equal(view(['cloud']).canFold,false);
});

test('历史超限按原展示顺序保留每通道3个常用，其他通道独立且移除无效编号',()=>{
 const r={...parent,direction:'代收'},other={id:'CH2',direction:'代收',collectionTypes:[{id:'x'},{id:'y'},{id:'z'}]};
 const favorites=new Set(['a','b','c','d','e','x','y','z','deleted']);
 const clean=ctx.limitCollectionFavorites([r,other],favorites);
 assert.deepEqual(Array.from(clean),['b','a','c','x','y','z']);assert.equal(favorites.size,9);
 assert.deepEqual(ids(ctx.collectionCodeView(r,[],clean,false)),['b','a','c']);
});
