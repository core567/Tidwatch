// 严格 WXSS tokenizer：不依赖第三方，模拟微信 WXSS 编译器的关键 token 规则。
// 覆盖此前真实白屏根因：通配子选择 `> *`、裸 -apple-system、SCSS 变量 $、#{} 插值等。
// 用法：node scripts/wxss-check.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'dist-test') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.wxss')) out.push(p);
  }
  return out;
}

const errors = [];

function parse(file, src) {
  // 去 BOM
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  let i = 0;
  const n = src.length;
  let depth = 0;

  const fail = (msg) => {
    const before = src.slice(0, i).split('\n');
    const line = before.length;
    const col = before[before.length - 1].length + 1;
    errors.push(`${relative(ROOT, file)}:${line}:${col} ${msg}`);
  };

  while (i < n) {
    const c = src[i];
    // 注释
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end === -1) return fail('未闭合注释');
      i = end + 2;
      continue;
    }
    // 空白
    if (/\s/.test(c)) { i++; continue; }
    // @规则（@import / @media / @keyframes 等）
    if (c === '@') {
      let j = i + 1;
      while (j < n && src[j] !== '{' && src[j] !== ';') j++;
      if (j >= n) return fail('@规则未结束');
      const atHead = src.slice(i, j);
      if (src[j] === ';') { i = j + 1; continue; }
      if (/^@(keyframes|-webkit-keyframes)/.test(atHead.trim())) {
        // @keyframes 名 { 0% {...} 100% {...} }：按花括号配平，
        // 内部关键帧选择器 + 声明合法，只做花括号配对与禁用项检查。
        let k = j + 1;
        let d2 = 1;
        while (k < n && d2 > 0) {
          if (src[k] === '{') d2++;
          else if (src[k] === '}') d2--;
          k++;
        }
        const body = src.slice(j + 1, k - 1);
        if (/\$[A-Za-z]|#\{/.test(body)) fail('@keyframes 内含 SCSS 变量/插值');
        // 关键帧内部声明仍必须是  prop:value; 结构（粗校验括号配对）
        if ((body.match(/\{/g) || []).length !== (body.match(/\}/g) || []).length)
          fail('@keyframes 花括号不配对');
        i = k;
        continue;
      }
      // 普通 @media：进入块后继续按普通规则解析（允许其包裹规则）
      depth++;
      i = j + 1;
      continue;
    }
    // 选择器 -> {
    if (c === '}') {
      depth--;
      if (depth < 0) return fail("多余的 '}'");
      i++;
      continue;
    }
    // 读取到 { 之前为选择器
    let selector = '';
    let brace = -1;
    let paren = 0;
    while (i < n) {
      const ch = src[i];
      if (ch === '(') paren++;
      if (ch === ')') paren--;
      if (ch === '{' && paren === 0) { brace = i; break; }
      if (ch === '}') break;
      selector += ch;
      i++;
    }
    if (brace === -1) return fail('选择器后缺少 {');
    const sel = selector.trim();

    // 选择器兼容规则
    for (const part of sel.split(',')) {
      const p = part.trim();
      if (!p) continue;
      if (/(^|[\s>+,~])\*(?=[\s>+.~:{]|$)/.test(p))
        fail(`不支持通配选择器: "${p}"`);
      if (/\$[A-Za-z]/.test(p) || /#\{/.test(p))
        fail(`疑似 SCSS 变量/插值: "${p}"`);
      if (/:(is|where|has)\s*\(/i.test(p))
        fail(`不支持的伪类: "${p}"`);
    }

    // 解析声明块
    depth++;
    i = brace + 1;
    let decl = '';
    paren = 0;
    while (i < n) {
      const ch = src[i];
      if (ch === '/' && src[i + 1] === '*') {
        const end = src.indexOf('*/', i + 2);
        if (end === -1) return fail('块内未闭合注释');
        i = end + 2;
        continue;
      }
      if (ch === '(') paren++;
      if (ch === ')') paren--;
      if (ch === '{' && paren === 0) {
        // 嵌套规则（WXSS 不支持嵌套选择器）
        fail('检测到嵌套 {（WXSS 不支持嵌套规则）');
        // 容错继续
        depth++;
        i++;
        continue;
      }
      if (ch === '}' && paren === 0) { depth--; i++; decl = ''; break; }
      if (ch === ';' && paren === 0) {
        // 一条声明结束
        const d = decl.trim();
        if (d) {
          const ci = d.indexOf(':');
          if (ci === -1) fail(`声明缺少冒号: "${d}"`);
          else {
            const prop = d.slice(0, ci).trim();
            const val = d.slice(ci + 1).trim();
            if (!/^-?-?[a-zA-Z][a-zA-Z0-9-]*$/.test(prop))
              fail(`非法属性名: "${prop}"`);
            if (/\$[A-Za-z]/.test(val) || /#\{/.test(val))
              fail(`值含 SCSS 变量/插值: "${d}"`);
            // font-family 裸连字符开头字体名（-apple-system 类）
            if (/^font-family/i.test(prop)) {
              // 取出未加引号的字体 token
              const toks = val.split(',').map((s) => s.trim());
              for (const t of toks) {
                if (/^-apple-system$/i.test(t) || /^BlinkMacSystemFont$/i.test(t))
                  fail(`font-family 不支持裸字体名 "${t}"（需去掉或加引号）`);
              }
            }
            if (/(?<![-\w])inset\s*:/.test(d))
              fail('inset 简写在部分基础库不支持');
            if (!val) fail(`属性 "${prop}" 缺少值`);
          }
        }
        decl = '';
        i++;
        continue;
      }
      decl += ch;
      i++;
    }
  }
  if (depth !== 0) fail(`花括号不配对（残余深度 ${depth}）`);
}

const files = walk(ROOT);
for (const f of files) {
  parse(f, readFileSync(f, 'utf8'));
}

// 自检：用【内存字符串】验证检查器确实能捕获已知非法写法，
// 绝不在项目目录创建任何 .wxss 负例文件（会被微信编译器扫描导致白屏）。
const badSamples = [
  '.a > * { color: red; }',
  '.b { font-family: -apple-system, sans-serif; }',
  '.c { inset: 0; }',
  '.d { color: $x; }',
];
const selfErrors = [];
for (const sample of badSamples) {
  const before = errors.length;
  parse('<self-test>', sample);
  if (errors.length === before) selfErrors.push(sample);
  errors.length = before; // 内存自检结果不落最终错误列表
}
if (selfErrors.length) {
  console.error('WXSS 检查器自检失败，未捕获：', selfErrors);
  process.exit(1);
}

if (errors.length) {
  console.error(`WXSS 检查失败（${errors.length}）：`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log(`WXSS 检查通过：${files.length} 个文件，0 错误（自检 ${badSamples.length} 项已通过）`);
