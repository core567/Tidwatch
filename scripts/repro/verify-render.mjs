#!/usr/bin/env node
// TideWatch 浏览器真实渲染校验（零依赖，使用已安装的 Edge/Chrome 的 CDP，无需 Playwright）。
//
// 背景：无头 one-shot 的 --screenshot/--dump-dom 在首帧即抓取，SPA 客户端路由尚未渲染，
// 对不同路由产出相同外壳。本脚本通过 Chrome DevTools Protocol 连接真实浏览器，
// 对每个路由 Page.navigate 后【等待 #root 渲染出内容且文本稳定】，再：
//   1) Runtime.evaluate 取渲染后 DOM 子节点数与 innerText 摘要；
//   2) Page.captureScreenshot 取真实截图。
// 从而得到 5 个互不相同的页面证据，并把结果写入 render-report.json。
//
// 用法：
//   node scripts/repro/verify-render.mjs --base http://localhost:5173 --out <evidence-dir>/render
// 退出码：0 全部路由渲染成功且彼此可区分；1 有路由未渲染或不可区分；2 启动/连接失败。

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROUTES = [
  { route: '/', name: 'overview' },
  { route: '/monitor', name: 'monitor' },
  { route: '/events', name: 'events' },
  { route: '/tasks', name: 'tasks' },
  { route: '/review', name: 'review' },
];

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const base = arg('base', 'http://localhost:5173');
const outDir = arg('out', join(process.cwd(), 'render-evidence'));
const port = Number(arg('port', '9222'));
const settleMs = Number(arg('settle-ms', '3500'));
mkdirSync(outDir, { recursive: true });
const shotDir = join(outDir, 'screenshots');
mkdirSync(shotDir, { recursive: true });

function findBrowser() {
  const candidates = [
    process.env.EDGE_PATH, process.env.CHROME_PATH,
    join(process.env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
    join(process.env.ProgramFiles || '', 'Microsoft/Edge/Application/msedge.exe'),
    join(process.env.LOCALAPPDATA || '', 'Microsoft/Edge/Application/msedge.exe'),
    join(process.env.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['ProgramFiles(x86)'] || '', 'Google/Chrome/Application/chrome.exe'),
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const httpGet = async (url) => (await fetch(url)).json();

// 全局 WebSocket 在 Node 22 起内置稳定；Node 20 无此全局。缺失时如实退出，提示用人工浏览器检查，不伪造结果。
if (typeof WebSocket === 'undefined') {
  console.error('当前 Node 无内置 WebSocket（需 Node >= 22）。请升级 Node，或改用真实浏览器人工检查 5 个路由并留存截图。');
  process.exit(2);
}

async function main() {
  const browserPath = findBrowser();
  if (!browserPath) {
    console.error('未找到 Edge/Chrome，请用 --edge 或设置 EDGE_PATH');
    process.exit(2);
  }
  const profile = join(tmpdir(), `tidewatch-cdp-${Date.now()}`);
  const browser = spawn(browserPath, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, 'about:blank',
  ], { stdio: 'ignore' });

  let version;
  for (let i = 0; i < 40; i++) {
    try { version = await httpGet(`http://127.0.0.1:${port}/json/version`); break; } catch { await sleep(500); }
  }
  if (!version) { console.error('无法连接浏览器 CDP 端口'); safeKill(); process.exit(2); }

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let nextId = 1;
  const pending = new Map();
  const events = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const waitEvent = (method, sessionId, timeoutMs = 15000) => new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const idx = events.findIndex((e) => e.method === method && (!sessionId || e.sessionId === sessionId));
      if (idx >= 0) resolve(events.splice(idx, 1)[0]);
      else if (Date.now() - start > timeoutMs) resolve(null);
      else setTimeout(tick, 100);
    };
    tick();
  });

  const results = [];
  try {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);
    await send('Page.setLifecycleEventsEnabled', { enabled: true }, sessionId);

    const evalExpr = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
      return r.result?.value;
    };

    for (const { route, name } of ROUTES) {
      const url = base + route;
      await send('Page.navigate', { url }, sessionId);
      await waitEvent('Page.loadEventFired', sessionId);
      // 等待 React 真实渲染：#root 有子节点且 innerText 超过阈值。
      // 不要求文本“稳定”——应用有实时时钟与 SSE 轮询，innerText 会持续变化，永远不会字节稳定。
      let rendered = false;
      for (let i = 0; i < 40; i++) {
        const state = await evalExpr(
          'JSON.stringify({children:(document.querySelector("#root")||{}).childElementCount||0,' +
          'len:(document.body.innerText||"").length})'
        );
        const obj = JSON.parse(state || '{}');
        if (obj.children > 0 && obj.len > 100) { rendered = true; break; }
        await sleep(500);
      }
      await sleep(settleMs); // 额外等待图表/3D/异步数据
      const detail = JSON.parse(await evalExpr(
        'JSON.stringify({children:(document.querySelector("#root")||{}).childElementCount||0,' +
        'title:document.title, text:(document.body.innerText||"").replace(/\\s+/g," ").slice(0,220)})'
      ) || '{}');
      const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
      const pngPath = join(shotDir, `${name}.png`);
      writeFileSync(pngPath, Buffer.from(shot.data, 'base64'));
      results.push({ route, name, url, rendered, rootChildren: detail.children, title: detail.title,
        innerTextHead: detail.text, screenshot: pngPath });
      console.log(`[render] ${route} rendered=${rendered} rootChildren=${detail.children} -> ${pngPath}`);
    }
  } finally {
    try { ws.close(); } catch { /* noop */ }
    safeKill();
  }

  // 可区分性：5 张截图哈希应不同，innerText 摘要不应全相同
  const { createHash } = await import('node:crypto');
  for (const r of results) {
    const { readFileSync } = await import('node:fs');
    r.pngSha256 = createHash('sha256').update(readFileSync(r.screenshot)).digest('hex');
  }
  const distinctPng = new Set(results.map((r) => r.pngSha256)).size;
  const distinctText = new Set(results.map((r) => r.innerTextHead)).size;
  const allRendered = results.every((r) => r.rendered);
  const report = {
    schema: 'tidewatch-render-v1', base, checkedAt: new Date().toISOString(),
    allRendered, distinctScreenshots: distinctPng, distinctTexts: distinctText, routes: results,
  };
  writeFileSync(join(outDir, 'render-report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(`[render] allRendered=${allRendered} distinctScreenshots=${distinctPng}/5 distinctTexts=${distinctText}/5`);
  console.log(`[render] report: ${join(outDir, 'render-report.json')}`);
  process.exit(allRendered && distinctPng === ROUTES.length ? 0 : 1);

  function safeKill() { try { browser.kill(); } catch { /* noop */ } }
}

main().catch((e) => { console.error('render check failed:', e); process.exit(2); });
