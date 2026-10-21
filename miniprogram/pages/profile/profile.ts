// pages/profile/profile.ts
import { getCurrentUser, logout, isLoggedIn } from '../../utils/auth';
import { wsClient } from '../../utils/ws';

const ROLE_TEXT: Record<string, string> = {
  admin: '系统管理员',
  analyst: '监测分析人员',
  inspector: '巡检人员',
};

Page({
  data: {
    user: {} as Partial<User>,
    roleText: '—',
    wsState: 'disconnected' as 'disconnected' | 'connecting' | 'open',
    wsStateText: '未连接',
  },

  privateUnsub: null as null | (() => void),

  onLoad() {
    if (!isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
  },

  onShow() {
    const user = getCurrentUser();
    if (!user) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.setData({ user, roleText: ROLE_TEXT[user.role] ?? user.role });
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

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定退出当前账号？',
      success: (res) => {
        if (res.confirm) {
          wsClient.logout();
          logout();
        }
      },
    });
  },
});
