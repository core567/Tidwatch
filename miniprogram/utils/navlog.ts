/**
 * 仅开发环境：导航与页面生命周期诊断（定位顶部闪白）。
 * 输出统一相对时间戳（启动后的毫秒），便于排序。
 * 排查完成后移除所有 navMark/installNavLogger 调用并删除本文件。
 */

const PREFIX = '[navdiag]';
const t0 = Date.now();
const now = () => Date.now() - t0;

export function navMark(label: string, extra?: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(PREFIX, String(now()).padStart(6), label, extra ?? '');
}

type NavOpts = {
  url: string;
  success?: (res: unknown) => void;
  fail?: (err: { errMsg: string }) => void;
  [k: string]: unknown;
};

let history: string[] = [];

export function installNavLogger(): void {
  const wrap = (name: 'navigateTo' | 'switchTab' | 'navigateBack' | 'redirectTo' | 'reLaunch') => {
    const orig = wx[name] as (o: NavOpts) => unknown;
    (wx as unknown as Record<string, unknown>)[name] = (opts: NavOpts) => {
      history.push(`${name} ${opts.url ?? ''}`);
      navMark(`${name}:start`, { url: opts.url, history: [...history] });
      return orig.call(wx, {
        ...opts,
        success: (res: unknown) => {
          navMark(`${name}:success`, { url: opts.url });
          opts.success?.(res);
        },
        fail: (err: { errMsg: string }) => {
          navMark(`${name}:fail`, { url: opts.url, err: err.errMsg });
          opts.fail?.(err);
        },
      });
    };
  };
  (['navigateTo', 'switchTab', 'navigateBack', 'redirectTo', 'reLaunch'] as const).forEach(wrap);
}

/** 页面混入：在 onShow/onHide/onReady/onUnload 打点，并记录隐藏后 setData */
export function pageDiag(name: string) {
  return {
    __diagName: name,
    __diagVisible: false,
    __diagOnShow() {
      navMark(`${name}:onShow`);
      (this as unknown as { __diagVisible: boolean }).__diagVisible = true;
    },
    __diagOnHide() {
      navMark(`${name}:onHide`);
      (this as unknown as { __diagVisible: boolean }).__diagVisible = false;
    },
    __diagOnReady() {
      navMark(`${name}:onReady`);
    },
    __diagOnUnload() {
      navMark(`${name}:onUnload`);
    },
  };
}
