// config/env.ts - 后端地址集中配置
//
// 真机调试注意（任务书明确要求）：
// 1. 真机上 localhost / 127.0.0.1 指向手机自身，不能访问电脑后端；
//    必须填写电脑的局域网 IP（与手机同一 WiFi），如 192.168.1.100。
// 2. 开发者工具 → 详情 → 本地设置：勾选
//    “不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书”。
// 3. 电脑防火墙需放行后端端口（默认 8000）。
// 4. 正式发布需要备案 HTTPS/WSS 域名，不在 V1.0 范围内。
//
// 后端就绪后（WP1），把 HOST 改为电脑实际局域网 IP；
// 开发者工具模拟器内调试可用 127.0.0.1。

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
