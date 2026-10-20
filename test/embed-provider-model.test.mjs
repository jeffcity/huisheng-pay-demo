import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
for(const [name,path] of [['平台','src/embed.js'],['租户','surfaces/tenant/src/embed.js']])test(name+'内嵌模型保留美元字符和实际收费代码，可完整解析',async()=>{
 const source=fs.readFileSync(new URL(path,root),'utf8').replace(/^import (?:providerModel|settlementModel|channelRecordsModel)[^\n]+\n/gm,'').replace(/export async function/g,'async function');
 for(const providerModel of ['window.probe = "$& $` '+"$'"+'";',fs.readFileSync(new URL('src/provider-model.js',root),'utf8')]){
  const window={__HS_EMBEDDED_SOURCES__:{channels:'<html><head></head><body>BODY_MARKER</body></html>',authGuard:''}};
  const ctx=vm.createContext({window,providerModel,settlementModel:"",channelRecordsModel:"",Map,Set});vm.runInContext(source,ctx);const html=await ctx.prepareEmbeddedDocument('channels');assert(html.includes('<script>'+providerModel+'</script>'));const first=html.match(/<script>([\s\S]*?)<\/script>/)[1];assert.doesNotThrow(()=>new vm.Script(first));assert.equal(html.split('BODY_MARKER').length,2);
 }
});

test('租户流水模型仅注入流水页面且完整语法可解析',async()=>{
 const source=fs.readFileSync(new URL('surfaces/tenant/src/embed.js',root),'utf8').replace(/^import (?:providerModel|channelRecordsModel)[^\n]+\n/gm,'').replace(/export async function/g,'async function');
 const providerModel=fs.readFileSync(new URL('src/provider-model.js',root),'utf8'),channelRecordsModel=fs.readFileSync(new URL('surfaces/tenant/src/channel-records-model.js',root),'utf8');
 const page='<html><head></head><body>RECORD_MARKER</body></html>',window={__HS_EMBEDDED_SOURCES__:{'channel-records':page,channels:page}},ctx=vm.createContext({window,providerModel,channelRecordsModel,Map,Set});vm.runInContext(source,ctx);
 const record=await ctx.prepareEmbeddedDocument('channel-records','channel-records'),other=await ctx.prepareEmbeddedDocument('channels','channels');
 assert(record.includes(channelRecordsModel));assert(!other.includes(channelRecordsModel));for(const match of record.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new vm.Script(match[1]));
});
