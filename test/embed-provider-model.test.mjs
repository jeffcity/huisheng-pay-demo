import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
for(const [name,path] of [['平台','src/embed.js'],['租户','surfaces/tenant/src/embed.js']])test(name+'内嵌模型保留美元字符和实际收费代码，可完整解析',async()=>{
 const source=fs.readFileSync(new URL(path,root),'utf8').replace(/^import (?:providerModel|settlementModel)[^\n]+\n/gm,'').replace(/export async function/g,'async function');
 for(const providerModel of ['window.probe = "$& $` '+"$'"+'";',fs.readFileSync(new URL('src/provider-model.js',root),'utf8')]){
  const window={__HS_EMBEDDED_SOURCES__:{channels:'<html><head></head><body>BODY_MARKER</body></html>',authGuard:''}};
  const ctx=vm.createContext({window,providerModel,settlementModel:"",Map,Set});vm.runInContext(source,ctx);const html=await ctx.prepareEmbeddedDocument('channels');assert(html.includes('<script>'+providerModel+'</script>'));const first=html.match(/<script>([\s\S]*?)<\/script>/)[1];assert.doesNotThrow(()=>new vm.Script(first));assert.equal(html.split('BODY_MARKER').length,2);
 }
});
