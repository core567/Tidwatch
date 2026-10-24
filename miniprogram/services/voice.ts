/**
 * 语音现场感知（P11）。
 *
 * 微信“同声传译”插件（wx.getRecorderManager + plugin 接口）需要：
 *  1. 在微信公众平台为小程序添加“微信同声传译”插件；
 *  2. app.json 配置 plugins；
 *  3. 真机或开启插件的开发者工具。
 *
 * 本封装做两层：
 *  - 当插件可用（requirePlugin 成功）时调用真实识别；
 *  - 插件缺失/识别失败时，明确回调降级为“手动输入”，绝不伪造识别结果，
 *    并把来源标记为 MANUAL（区别于插件 VOICE）。
 *
 * 注：TypeScript/Node 环境没有 wx/requirePlugin，所有调用都是惰性的。
 */

export type VoiceSource = 'VOICE_PLUGIN' | 'MANUAL_FALLBACK';

export interface VoiceResult {
  text: string;
  source: VoiceSource;
  /** 插件不可用或识别失败的原因（降级时存在） */
  fallbackReason?: string;
  durationMs?: number;
}

// 微信同声传译插件 appId（公开插件）
const PLUGIN_NAME = 'WechatSI';
const MANAGER = 'manager';

let pluginApi: WechatSIPlugin | null | undefined;

interface WechatSIPlugin {
  speechRecognizer?: {
    recognize?: (opts: {
      lang?: string;
      onStart?: () => void;
      onRecognize?: (res: { result?: string }) => void;
      onStop?: (res: { result?: string }) => void;
      onError?: (res: { errMsg?: string; retcode?: number }) => void;
    }) => void;
  };
  manager?: {
    start?: (opts: { lang?: string }) => void;
    stop?: () => void;
    onRecognize?: (res: { result?: string }) => void;
    onStop?: (res: { result?: string }) => void;
    onError?: (res: { errMsg?: string }) => void;
  };
}

function getPlugin(): WechatSIPlugin | null {
  if (pluginApi !== undefined) return pluginApi;
  try {
    const g: { requirePlugin?: (name: string) => unknown } = globalThis as never;
    const requirePluginFn = g.requirePlugin;
    if (typeof requirePluginFn !== 'function') {
      pluginApi = null;
    } else {
      const plug = requirePluginFn.call(g, PLUGIN_NAME) as WechatSIPlugin;
      pluginApi = plug && (plug.speechRecognizer || plug[MANAGER as 'manager']) ? plug : null;
    }
  } catch {
    pluginApi = null;
  }
  return pluginApi;
}

export function isVoicePluginAvailable(): boolean {
  return getPlugin() !== null;
}

/**
 * 开始一次录音识别。返回一个可停止的句柄；
 * 结果通过 onResult 返回（成功为 VOICE_PLUGIN，失败/无插件为 MANUAL_FALLBACK）。
 */
export function startVoiceRecognition(opts: {
  onResult: (r: VoiceResult) => void;
  onState?: (state: 'start' | 'stop' | 'error') => void;
}): { stop: () => void } {
  const startedAt = Date.now();
  const plugin = getPlugin();

  // 无插件：立即降级，调用方应展示手动输入框
  if (!plugin) {
    opts.onState?.('error');
    opts.onResult({
      text: '',
      source: 'MANUAL_FALLBACK',
      fallbackReason: '微信同声传译插件不可用（开发环境或未配置），请手动输入',
    });
    return { stop: () => undefined };
  }

  let finalText = '';
  const recognizer = plugin.speechRecognizer;
  const finish = (text: string, source: VoiceSource, reason?: string) => {
    opts.onResult({
      text,
      source,
      fallbackReason: reason,
      durationMs: Date.now() - startedAt,
    });
  };

  if (recognizer && typeof recognizer.recognize === 'function') {
    recognizer.recognize({
      lang: 'zh_CN',
      onStart: () => opts.onState?.('start'),
      onRecognize: (res) => {
        if (res.result) finalText = res.result;
      },
      onStop: (res) => {
        opts.onState?.('stop');
        const text = res.result || finalText;
        if (text) finish(text, 'VOICE_PLUGIN');
        else finish('', 'MANUAL_FALLBACK', '未识别到语音内容');
      },
      onError: () => {
        opts.onState?.('error');
        finish(finalText, 'MANUAL_FALLBACK', '语音识别失败，请手动输入');
      },
    });
    return { stop: () => undefined };
  }

  // manager 形式
  const m = plugin.manager;
  if (m) {
    m.onRecognize = (res) => {
      if (res.result) finalText = res.result;
    };
    m.onStop = (res) => {
      opts.onState?.('stop');
      const text = res.result || finalText;
      if (text) finish(text, 'VOICE_PLUGIN');
      else finish('', 'MANUAL_FALLBACK', '未识别到语音内容');
    };
    m.onError = () => {
      opts.onState?.('error');
      finish(finalText, 'MANUAL_FALLBACK', '语音识别失败，请手动输入');
    };
    m.start?.({ lang: 'zh_CN' });
    opts.onState?.('start');
    return { stop: () => m.stop?.() };
  }

  opts.onResult({ text: '', source: 'MANUAL_FALLBACK', fallbackReason: '插件接口不可用' });
  return { stop: () => undefined };
}
