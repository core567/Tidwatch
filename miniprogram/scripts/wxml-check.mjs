// 严格 WXML 嵌套栈校验（不能只数标签数量，必须按开/闭顺序配对）。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/,'$1');
function walk(d){const o=[];for(const n of readdirSync(d)){if(n==='node_modules'||n==='dist-test'||n==='dist')continue;const p=join(d,n);if(statSync(p).isDirectory())o.push(...walk(p));else if(n.endsWith('.wxml'))o.push(p);}return o;}
const VOID=new Set([]);
const errs=[];
for(const f of walk(ROOT)){
  let s=readFileSync(f,'utf8');
  s=s.replace(/<!--.*?-->/gs,'');
  const stack=[];
  const re=/<(\/?)([a-zA-Z][\w.-]*)([^>]*?)(\/?)>/gs;
  let m,ok=true;
  while((m=re.exec(s))){
    const [,close,name,attrs,self]=m;
    const line=s.slice(0,m.index).split('\n').length;
    if(close){
      if(!stack.length){errs.push(`${relative(ROOT,f)}:${line} extra </${name}>`);ok=false;break;}
      const top=stack.pop();
      if(top.name!==name){errs.push(`${relative(ROOT,f)}:${line} expect </${top.name}> (opened line ${top.line}) got </${name}>`);ok=false;break;}
    } else if(!self && !VOID.has(name)){
      stack.push({name,line});
    }
  }
  if(ok&&stack.length) errs.push(`${relative(ROOT,f)} unclosed: ${stack.map(x=>x.name+'@'+x.line).join(', ')}`);
}
if(errs.length){console.error('WXML CHECK FAILED:\n'+errs.map(e=>'  '+e).join('\n'));process.exit(1);}
console.log('WXML balanced OK');
