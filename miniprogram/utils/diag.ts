/**
 * 仅排查闪白：业务请求 / WS 更新的全局隔离开关。
 *
 * 操作方式：进入「闪白对照实验」页（pages/_flashtest/index）点击按钮切换；
 * 或在开发者工具控制台调用：
 *   require('../../utils/diag').setDiag({ noRequests: true })
 * 开关写入 storage，跨页面立即生效（页面每次 load / WS 回调实时读取）。
 *
 * 作用：
 * - noRequests=true：任务/事件/监测页 onLoad/onShow/WS 触发的列表 load 直接 return
 * - noWs=true：忽略 WS 消息回调（不触发刷新、不更新角标）
 */
export interface DiagFlags {
  noRequests: boolean;
  noWs: boolean;
}

const KEY = '__navdiag_flags__';
const DEFAULTS: DiagFlags = { noRequests: false, noWs: false };

function read(): DiagFlags {
  try {
    const raw = wx.getStorageSync(KEY);
    if (raw && typeof raw === 'object') {
      return { noRequests: !!raw.noRequests, noWs: !!raw.noWs };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

function write(next: DiagFlags): void {
  wx.setStorageSync(KEY, next);
}

export const diag = {
  get flags(): DiagFlags {
    return read();
  },
  set(partial: Partial<DiagFlags>): DiagFlags {
    const next = { ...read(), ...partial };
    write(next);
    return next;
  },
  reset(): DiagFlags {
    write({ ...DEFAULTS });
    return { ...DEFAULTS };
  },
  allowRequest(): boolean {
    return !read().noRequests;
  },
  allowWs(): boolean {
    return !read().noWs;
  },
};

/** 供控制台：const { setDiag } = require('./utils/diag') */
export function setDiag(partial: Partial<DiagFlags>): DiagFlags {
  return diag.set(partial);
}
