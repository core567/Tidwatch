// app.ts - TideWatch 移动巡检端全局入口
// M0 脚手架：仅处理登录态与全局数据；业务对接在 M3。
import { isLoggedIn } from './utils/auth';
import { logger } from './utils/logger';

App({
  globalData: {
    // 后端连接状态由 ws.ts 维护，这里只暴露最近一次状态供页面读取
    wsConnected: false,
  },

  onLaunch() {
    logger.info('app', 'TideWatch miniprogram launched');
    // 未登录时重定向到登录页（tabBar 页除外的页面由各自 onLoad 二次校验）
    if (!isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
    }
  },

  onShow() {
    // M3：应用回到前台时检查登录态与 WS 连接
  },

  onHide() {
    // M3：进入后台时由 ws 心跳逻辑自然降级
  },
});
