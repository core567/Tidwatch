// components/shell-me/shell-me.ts
// 「我的」= 系统与演示中心（非个人资料中心）：
// - 系统状态：HTTP 健康检查 / WebSocket / 最近业务数据时间，三者独立取数，互不冒充；
// - 数据来源：官方自动站、MQTT 实时链路、模拟/演示数据，开关与计数均来自真实只读接口；
// - 演示辅助：只展示场景运行的只读状态（启停是 PC 管理员写操作，现场端不触发）；
// - 关于：定位、核心功能、版本（以后端 /api/health 真实版本为准）。
// 不提供登录/注册/资料编辑，不注入异常，不自动触发场景，不改后端数据。
import {
  healthCheck,
  getDiagnostics,
  getScenarioStatus,
  getOfficialStatus,
  listReaches,
} from '../../services/api';
import { wsClient } from '../../utils/ws';
import { getSessionMode } from '../../utils/auth';
import { formatDateTime } from '../../utils/util';
import type { SystemDiagnostics, OfficialStatus } from '../../services/api';

/* eslint-disable @typescript-eslint/no-explicit-any */
type ShellThis = {
  data: any;
  setData: (d: Record<string, unknown>) => void;
  ensureInit: () => void;
  load: (silent?: boolean) => Promise<boolean>;
  _unsubState?: (() => void) | null;
  _inited?: boolean;
  _loaded?: boolean;
  _seq?: number;
};

Component({
  properties: {
    active: {
      type: Boolean,
      value: false,
      observer(this: ShellThis, val: boolean) {
        if (!val) return;
        const first = !this._inited;
        this.ensureInit();
        if (!first && this._loaded) this.load(true);
      },
    },
  },

  data: {
    loading: true,
    refreshing: false,
    errorMsg: '',
    // 访问模式（只读事实：演示兜底 / 真实 JWT）
    modeText: '演示模式',
    // HTTP 后端健康（与 WS 分离）
    httpState: 'checking' as 'ok' | 'down' | 'checking',
    httpText: '检测中',
    dbState: '—',
    version: '—',
    // WebSocket（独立于 HTTP）
    wsState: 'disconnected' as 'disconnected' | 'connecting' | 'open',
    wsText: '未连接',
    wsTone: 'off' as 'on' | 'wait' | 'off' | 'ok',
    // 最近业务数据
    lastDataText: '—',
    reachOnline: 0,
    reachStale: 0,
    reachOffline: 0,
    // 诊断（公网部署可能 403 → available=false，降级不报错）
    diagAvailable: false,
    observations: 0,
    ingestionErrors: 0,
    ruleVersion: '—',
    ruleLabel: '',
    // MQTT / 官方站 / 场景均为三态：on 启用 / off 未启用 / unknown 接口不可达（失败不冒充“未启用”）
    mqttState: 'unknown' as 'on' | 'off' | 'unknown',
    mqttText: '状态未知',
    officialState: 'unknown' as 'on' | 'off' | 'unknown',
    officialText: '状态未知',
    officialLabel: '',
    scenarioState: 'unknown' as 'running' | 'stopped' | 'unknown',
    scenarioText: '状态未知',
    updatedText: '',
  } as Record<string, unknown>,

  pageLifetimes: {
    show(this: ShellThis) {
      if (this.data.active && this._loaded) this.load(true);
    },
  },

  lifetimes: {
    attached(this: ShellThis) {
      if (this.data.active) this.ensureInit();
    },
    detached(this: ShellThis) {
      this._unsubState?.();
    },
  },

  methods: {
    ensureInit(this: ShellThis) {
      if (this._inited) return;
      this._inited = true;
      this.load();
      // WS 独立判定：HTTP 200 不代表 WS 在线
      this._unsubState = wsClient.onStateChange((s) => {
        const map = {
          open: { text: '实时通道已连接', tone: 'ok' },
          connecting: { text: '实时通道连接中', tone: 'wait' },
          disconnected: { text: '实时通道未连接', tone: 'off' },
        } as const;
        this.setData({ wsState: s, wsText: map[s].text, wsTone: map[s].tone });
      });
      wsClient.connect();
    },

    onRetry(this: ShellThis) {
      this.load();
    },

    async onRefresh(this: ShellThis) {
      const ok = await this.load(true);
      wx.showToast({ title: ok ? '状态已刷新' : '部分来源不可达', icon: 'none' });
    },

    async load(this: ShellThis, silent = false) {
      const seq = (this._seq ?? 0) + 1;
      this._seq = seq;
      if (!silent) this.setData({ loading: true, errorMsg: '' });
      else this.setData({ refreshing: true });

      // 各来源独立容错：单点失败不拖垮整页
      const health = await healthCheck().catch(() => null);
      const diag: SystemDiagnostics | null = await getDiagnostics().catch(() => null);
      const official: OfficialStatus | null = await getOfficialStatus().catch(() => null);
      const scenario = await getScenarioStatus().catch(() => null);
      const reaches = await listReaches().catch(() => [] as Reach[]);
      if (seq !== this._seq) return;

      // HTTP：仅以 /api/health 的返回判定，绝不与 WS 状态混用
      const httpOk = !!health && health.status === 'ok';
      const lastSeen = reaches
        .map((r) => r.lastSeenAt)
        .filter(Boolean)
        .sort()
        .pop();

      this.setData({
        loading: false,
        refreshing: false,
        errorMsg: '',
        modeText: getSessionMode() === 'jwt' ? '已登录（真实账号）' : '演示模式（免登录兜底）',
        httpState: httpOk ? 'ok' : 'down',
        httpText: httpOk ? '后端服务正常' : '后端服务不可达',
        dbState: health?.database === 'ok' ? '正常' : health ? '异常' : '未知',
        version: health?.version ?? '—',
        lastDataText: lastSeen ? formatDateTime(lastSeen as string) : '暂无业务数据',
        reachOnline: reaches.filter((r) => r.onlineStatus === 'ONLINE').length,
        reachStale: reaches.filter((r) => r.onlineStatus === 'STALE').length,
        reachOffline: reaches.filter((r) => r.onlineStatus === 'OFFLINE').length,
        diagAvailable: !!diag,
        observations: diag?.counts?.observations ?? 0,
        ingestionErrors: diag?.counts?.ingestionErrors ?? 0,
        ruleVersion: diag?.ruleVersion ?? '—',
        ruleLabel: diag?.ruleLabel ?? '',
        mqttState: diag ? (diag.mqtt?.enabled ? 'on' : 'off') : 'unknown',
        mqttText: !diag
          ? '诊断接口不可达'
          : diag.mqtt?.enabled
            ? '已启用'
            : '未启用',
        officialState: official ? (official.enabled ? 'on' : 'off') : 'unknown',
        officialText: !official
          ? '状态接口不可达'
          : official.enabled
            ? '已启用'
            : '未启用',
        officialLabel: official?.sourceLabel ?? '',
        scenarioState: scenario
          ? scenario.running
            ? 'running'
            : 'stopped'
          : 'unknown',
        scenarioText: !scenario
          ? '状态接口不可达'
          : scenario.running
            ? `场景 ${scenario.scenario} 运行中`
            : '当前无场景运行',
        updatedText: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      });

      // 仅当所有只读来源都失败且首次加载时才进错误态（单一来源失败已就地降级）
      if (!httpOk && !diag && reaches.length === 0 && !this._loaded) {
        this.setData({ errorMsg: '无法连接后端服务，请确认后端已启动或刷新重试' });
      }
      this._loaded = true;
      return httpOk || !!diag || reaches.length > 0;
    },
  },
});
