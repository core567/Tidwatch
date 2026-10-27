// pages/login/login.ts
import { login } from '../../services/api';
import { wsClient } from '../../utils/ws';

Page({
  data: {
    username: '',
    password: '',
    submitting: false,
    errorMsg: '',
  },

  onUsername(e: WechatMiniprogram.Input): void {
    this.setData({ username: e.detail.value });
  },
  onPassword(e: WechatMiniprogram.Input): void {
    this.setData({ password: e.detail.value });
  },

  async onSubmit(): Promise<void> {
    const username = this.data.username.trim();
    const password = this.data.password;
    if (!username || !password) {
      this.setData({ errorMsg: '请输入账号和密码' });
      return;
    }
    this.setData({ submitting: true, errorMsg: '' });
    try {
      await login(username, password);
      wsClient.connect(); // 登录成功后建立全局唯一 WS 连接
      wx.showToast({ title: '登录成功', icon: 'success' });
      wx.reLaunch({ url: '/pages/tasks/tasks' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '登录失败';
      this.setData({ errorMsg: msg });
    } finally {
      this.setData({ submitting: false });
    }
  },

  /** 返回上一页（从「我的」进入登录但不登录时） */
  onBack(): void {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: '/pages/tasks/tasks' });
    }
  },
});
