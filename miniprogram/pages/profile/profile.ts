// pages/profile/profile.ts
// 演示模式免登录：展示运行模式、实时通道与语音插件状态
import { wsClient } from '../../utils/ws';
import { isVoicePluginAvailable } from '../../services/voice';

Page({
  data: {
    wsState: 'disconnected' as 'disconnected' | 'connecting' | 'open',
    wsStateText: '未连接',
    voiceAvailable: false,
  },

  privateUnsub: null as null | (() => void),

  onShow() {
    wsClient.connect();
    this.setData({ voiceAvailable: isVoicePluginAvailable() });
    this.privateUnsub?.();
    this.privateUnsub = wsClient.onStateChange((s) => {
      this.setData({
        wsState: s,
        wsStateText:
          s === 'open' ? '已连接' : s === 'connecting' ? '连接中' : '已断开',
      });
    });
  },

  onUnload() {
    this.privateUnsub?.();
  },
});
