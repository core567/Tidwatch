// app.ts - TideWatch 移动巡检端全局入口
// V1.0 演示模式免登录：启动直达任务首页，并建立全局唯一 WS 连接。
import { wsClient } from './utils/ws';
import { logger } from './utils/logger';

App({
  globalData: {
    wsConnected: false,
  },

  onLaunch() {
    logger.info('app', 'TideWatch miniprogram launched (demo, no login)');
    wsClient.connect();
  },

  onShow() {
    // 回前台：确保连接存在（WS 内部去重，不建第二条）
    wsClient.connect();
  },

  onHide() {
    // 进入后台由 WS 心跳/微信保活机制自然处理，不断连
  },
});
