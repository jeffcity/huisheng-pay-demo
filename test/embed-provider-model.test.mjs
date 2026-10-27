import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
for(const [name,path] of [['平台','src/embed.js'],['租户','surfaces/tenant/src/embed.js']])test(name+'内嵌模型保留美元字符和实际收费代码，可完整解析',async()=>{
 const source=fs.readFileSync(new URL(path,root),'utf8').replace(/^import [^\n]+\n/gm,'').replace(/export async function/g,'async function');
 for(const providerModel of ['window.probe = "$& $` '+"$'"+'";',fs.readFileSync(new URL('src/provider-model.js',root),'utf8')]){
  const window={__HS_EMBEDDED_SOURCES__:{channels:'<html><head></head><body>BODY_MARKER</body></html>',authGuard:''}};
  const ctx=vm.createContext({window,providerModel,settlementModel:"",channelRecordsModel:"",Map,Set});vm.runInContext(source,ctx);const html=await ctx.prepareEmbeddedDocument('channels');assert(html.includes('<script>'+providerModel+'</script>'));const first=html.match(/<script>([\s\S]*?)<\/script>/)[1];assert.doesNotThrow(()=>new vm.Script(first));assert.equal(html.split('BODY_MARKER').length,2);
 }
});

test('租户流水模型仅注入流水页面且完整语法可解析',async()=>{
 const source=fs.readFileSync(new URL('surfaces/tenant/src/embed.js',root),'utf8').replace(/^import [^\n]+\n/gm,'').replace(/export async function/g,'async function');
 const providerModel=fs.readFileSync(new URL('src/provider-model.js',root),'utf8'),channelRecordsModel=fs.readFileSync(new URL('surfaces/tenant/src/channel-records-model.js',root),'utf8');
 const page='<html><head></head><body>RECORD_MARKER</body></html>',window={__HS_EMBEDDED_SOURCES__:{'channel-records':page,channels:page}},ctx=vm.createContext({window,providerModel,channelRecordsModel,Map,Set});vm.runInContext(source,ctx);
 const record=await ctx.prepareEmbeddedDocument('channel-records','channel-records'),other=await ctx.prepareEmbeddedDocument('channels','channels');
 assert(record.includes(channelRecordsModel));assert(!other.includes(channelRecordsModel));for(const match of record.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new vm.Script(match[1]));
});

 test('通知机器人模型只注入通知中心，配置数据与模板美元字符完整保留',async()=>{
 const source=fs.readFileSync(new URL('surfaces/tenant/src/embed.js',root),'utf8').replace(/^import [^\n]+\n/gm,'').replace(/export async function/g,'async function');
 const providerModel=fs.readFileSync(new URL('src/provider-model.js',root),'utf8'),notificationBotModel=fs.readFileSync(new URL('surfaces/tenant/src/notification-bot-model.js',root),'utf8');
 const page='<html><head></head><body>NOTIFY_MARKER</body></html>',window={__HS_EMBEDDED_SOURCES__:{notifications:page,channels:page}},ctx=vm.createContext({window,providerModel,notificationBotModel,channelRecordsModel:'',Map,Set});vm.runInContext(source,ctx);
 const target=await ctx.prepareEmbeddedDocument('notifications','notifications'),other=await ctx.prepareEmbeddedDocument('channels','channels');assert(target.includes(notificationBotModel));assert(!other.includes(notificationBotModel));assert.equal(target.split('NOTIFY_MARKER').length,2);for(const match of target.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new vm.Script(match[1]));
 });

test('日终模型仅注入日终页面，原始模型与页面脚本可完整解析',async()=>{
 const source=fs.readFileSync(new URL('surfaces/tenant/src/embed.js',root),'utf8').replace(/^import [^\n]+\n/gm,'').replace(/export async function/g,'async function');
 const providerModel=fs.readFileSync(new URL('src/provider-model.js',root),'utf8'),dailyReportsModel=fs.readFileSync(new URL('surfaces/tenant/src/daily-reports-model.js',root),'utf8');
 const page=fs.readFileSync(new URL('surfaces/tenant/public/legacy/sources/reports.html',root),'utf8'),window={__HS_EMBEDDED_SOURCES__:{reports:page,channels:'<html><head></head><body>OTHER_PAGE</body></html>'}},ctx=vm.createContext({window,providerModel,dailyReportsModel,channelRecordsModel:'',notificationBotModel:'',Map,Set});vm.runInContext(source,ctx);
 const target=await ctx.prepareEmbeddedDocument('reports','reports'),other=await ctx.prepareEmbeddedDocument('channels','channels');assert(target.includes(dailyReportsModel));assert(!other.includes(dailyReportsModel));for(const match of target.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new vm.Script(match[1]));
});
