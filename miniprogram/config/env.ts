// config/env.ts - 后端地址集中配置（全小程序唯一地址来源，禁止在页面硬编码）
//
// 三种环境：
// 1) 开发者工具模拟器：HOST = '127.0.0.1'（后端 --host 127.0.0.1 即可）。
// 2) 真机调试（开发者工具点「真机调试」，不是「预览」）：
//    HOST 必须填电脑的局域网 IP，且后端用 --host 0.0.0.0 启动、防火墙放行端口。
//    真机调试走调试通道，继承「不校验合法域名」，可用 http / ws + IP。
// 3) 扫码「预览」/体验版/正式版：强制 HTTPS/WSS + 已备案域名并在小程序后台配置
//    服务器域名，IP 与 http 一律不可用；测试号无法配置服务器域名。
//
// 当前以「微信开发者工具」演示为主：HOST 用 127.0.0.1（后端 --host 0.0.0.0 同时覆盖回环与局域网）。
// 真机「真机调试」时改为电脑局域网 IP（如 172.20.10.2），普通扫码预览受测试号域名限制不可用。
const HOST = '127.0.0.1';
const HTTP_PORT = '8000';

function buildWsUrl(host: string, port: string): string {
  // 真机局域网调试使用 ws://；未来正式环境改为 wss://备案域名
  return `ws://${host}:${port}/api/ws`;
}

export const ENV = {
  API_BASE_URL: `http://${HOST}:${HTTP_PORT}`,
  WS_URL: buildWsUrl(HOST, HTTP_PORT),
  REQUEST_TIMEOUT_MS: 10000,
  WS_HEARTBEAT_MS: 25000,
  WS_RECONNECT_MAX_MS: 30000,
} as const;
