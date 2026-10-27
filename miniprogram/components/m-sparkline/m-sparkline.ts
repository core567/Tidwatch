// components/m-sparkline/m-sparkline.ts
// 专业趋势图：X/Y 真实坐标、缺测断线、渐变填充、触摸查看数据点、高 DPI。
import {
  buildSegments,
  normalizePoints,
  valueRange,
  yTicks,
  xTicks,
  formatTime,
  formatFullTime,
  type SparkPoint,
} from '../../utils/sparkline';

interface ChartLayout {
  width: number;
  height: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
  plotW: number;
  plotH: number;
}

interface ComponentData {
  points: SparkPoint[];
  alertFrom: string;
  height: number;
  showAxis: boolean;
  /** 页面是否已就绪且可见（由页面在 onReady/onShow、onHide/onUnload 控制） */
  active: boolean;
}

interface ReadyPoint extends SparkPoint {
  px: number;
  py: number;
}

Component({
  properties: {
    points: { type: null, value: [] as SparkPoint[] },
    alertFrom: { type: String, value: '' },
    height: { type: Number, value: 220 },
    /** 是否显示完整坐标轴（详情页 true；迷你图可 false） */
    showAxis: { type: Boolean, value: true },
    /** 仅当页面布局完成且可见时才允许绘制，避免转场期间原生层提前浮现 */
    active: { type: Boolean, value: false },
  },
  data: {
    layout: null as ChartLayout | null,
    hit: null as { x: number; y: number; label: string; value: string; source: string } | null,
    /** 首帧是否绘制完成（未完成时显示占位，canvas 自身保持透明不遮挡下层） */
    chartReady: false,
  },
  lifetimes: {
    attached() {
      (this as any)._mounted = true;
      // 每次挂载都是新的绘制世代
      (this as any)._gen = ((this as any)._gen ?? 0) + 1;
    },
    ready() {
      this.requestDraw();
    },
    detached() {
      const inst = this as any;
      inst._mounted = false;
      // 作废旧的查询/绘制回调，防止离开页面后仍向旧 canvas 绘制
      inst._gen = (inst._gen ?? 0) + 1;
      inst._ready = [];
    },
  },
  observers: {
    'points,alertFrom,height,showAxis,active'() {
      this.requestDraw();
    },
  },
  methods: {
    /**
     * 唯一的绘制入口：
     * 挂载 + 页面可见 + 有数据 三者满足后，nextTick 等 canvas（wx:if）挂载并布局稳定再测量。
     * 用 _gen 世代号丢弃页面切换后过期的异步回调。
     */
    requestDraw(this: any) {
      const inst = this as {
        data: ComponentData;
        _mounted?: boolean;
        _gen?: number;
        createSelectorQuery(): WechatMiniprogram.SelectorQuery;
      };
      if (!inst._mounted || !inst.data.active) return;
      const pts = normalizePoints(inst.data.points);
      if (pts.length === 0) {
        // 无数据不占原生层绘制（空态由 WXML 组件外处理）
        this.setData({ chartReady: false });
        return;
      }
      const gen = inst._gen ?? 0;
      wx.nextTick(() => {
        if (gen !== inst._gen || !inst._mounted || !inst.data.active) return;
        // canvas 是 wx:if 节点，nextTick 时个别基础库可能尚未完成布局；
        // 测量失败则在下一帧再试，最多 10 次，仍以“尺寸有效”为唯一放行条件。
        this.queryAndDraw(gen, 10);
      });
    },

    queryAndDraw(this: any, gen: number, retries: number) {
      const inst = this as {
        data: ComponentData;
        _mounted?: boolean;
        _gen?: number;
        createSelectorQuery(): WechatMiniprogram.SelectorQuery;
      };
      if (gen !== inst._gen || !inst._mounted || !inst.data.active) return;
      inst
        .createSelectorQuery()
        .in(this)
        .select('.m-spark-canvas')
        .fields({ node: true, size: true })
        .exec((res: Array<{ node?: WxCanvasNode; width: number } | null>) => {
          if (gen !== inst._gen || !inst._mounted || !inst.data.active) return;
          const info = res?.[0];
          if (info && info.node && info.width) {
            this.draw(info.node, info.width);
            return;
          }
          // 节点尚未挂载/布局完成：下一帧重试（非固定业务延时）
          if (retries > 0) {
            wx.nextTick(() => this.queryAndDraw(gen, retries - 1));
          }
        });
    },

    tryDraw(this: any) {
      this.requestDraw();
    },

    draw(this: any, canvas: WxCanvasNode, cssWidth: number) {
      const { points, alertFrom, height: cssHeight, showAxis } = this.data as ComponentData;
      const ctx = canvas.getContext('2d') as unknown as WxCanvasCtx;
      const dpr = wx.getWindowInfo?.().pixelRatio || wx.getSystemInfoSync().pixelRatio || 2;
      canvas.width = cssWidth * dpr;
      canvas.height = cssHeight * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      const pts = normalizePoints(points);
      const L: ChartLayout = {
        width: cssWidth,
        height: cssHeight,
        padL: showAxis ? 40 : 12,
        padR: 12,
        padT: showAxis ? 14 : 10,
        padB: showAxis ? 26 : 12,
        plotW: 0,
        plotH: 0,
      };
      L.plotW = L.width - L.padL - L.padR;
      L.plotH = L.height - L.padT - L.padB;
      (this as any)._layout = L;

      if (pts.length === 0) {
        ctx.clearRect(0, 0, cssWidth, cssHeight);
        this.drawEmpty(ctx, L, '暂无观测数据');
        this.setData({ hit: null, _ready: [] as ReadyPoint[], chartReady: false });
        return;
      }

      const segs = buildSegments(pts);
      const range = valueRange(pts);
      const t0 = new Date(pts[0].t).getTime();
      const t1 = new Date(pts[pts.length - 1].t).getTime();
      const x = (ts: number) =>
        t1 === t0 ? L.padL + L.plotW / 2 : L.padL + ((ts - t0) / (t1 - t0)) * L.plotW;
      const y = (v: number) => L.padT + L.plotH - ((v - range.min) / (range.max - range.min)) * L.plotH;

      const ready: ReadyPoint[] = pts.map((p) => {
        const ts = new Date(p.t).getTime();
        return { ...p, px: x(ts), py: y(p.v) };
      });
      (this as any)._ready = ready;

      // ---- 网格 + Y 轴刻度 ----
      if (showAxis) {
        const ticks = yTicks(range, 4);
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ticks.forEach((tk) => {
          const yy = y(tk.value);
          ctx.strokeStyle = '#EEF2F7';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(L.padL, yy);
          ctx.lineTo(L.width - L.padR, yy);
          ctx.stroke();
          ctx.fillStyle = '#8AA0B8';
          ctx.fillText(tk.label, L.padL - 6, yy);
        });
      }

      // ---- 缺测区间：浅灰底（不再使用含义不明的橙色） ----
      for (let i = 1; i < segs.length; i++) {
        const prevEnd = ready[segs[i - 1].end];
        const nextStart = ready[segs[i].start];
        ctx.fillStyle = 'rgba(148,163,184,0.10)';
        ctx.fillRect(prevEnd.px, L.padT, nextStart.px - prevEnd.px, L.plotH);
        // 虚线提示断点
        ctx.strokeStyle = 'rgba(148,163,184,0.55)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        const mid = (prevEnd.px + nextStart.px) / 2;
        ctx.beginPath();
        ctx.moveTo(mid, L.padT + 4);
        ctx.lineTo(mid, L.padT + L.plotH - 4);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const alertTs = alertFrom ? new Date(alertFrom).getTime() : null;

      // ---- 每段：渐变填充 + 折线（段内独立路径，绝不跨缺测） ----
      segs.forEach((seg) => {
        const rp = ready.slice(seg.start, seg.end + 1);
        const isAlert = alertTs !== null && new Date(pts[seg.start].t).getTime() >= alertTs;
        const color = isAlert ? '#1E6FE0' : '#189AB4';

        // 填充
        ctx.beginPath();
        ctx.moveTo(rp[0].px, L.padT + L.plotH);
        rp.forEach((p, i) => (i === 0 ? ctx.lineTo(p.px, p.py) : ctx.lineTo(p.px, p.py)));
        ctx.lineTo(rp[rp.length - 1].px, L.padT + L.plotH);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, L.padT, 0, L.padT + L.plotH);
        grad.addColorStop(0, isAlert ? 'rgba(30,111,224,0.20)' : 'rgba(24,154,180,0.18)');
        grad.addColorStop(1, 'rgba(30,111,224,0)');
        ctx.fillStyle = grad;
        ctx.fill();

        // 线
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        rp.forEach((p, i) => (i === 0 ? ctx.moveTo(p.px, p.py) : ctx.lineTo(p.px, p.py)));
        ctx.stroke();

        // 数据点很少（≤8）时画离散点，不假装平滑曲线
        if (rp.length <= 8) {
          rp.forEach((p) => {
            ctx.beginPath();
            ctx.fillStyle = color;
            ctx.arc(p.px, p.py, 2.5, 0, Math.PI * 2);
            ctx.fill();
          });
        }
      });

      // ---- X 轴时间刻度（真实时间，跨度自适应） ----
      if (showAxis) {
        const span = t1 - t0;
        const sameDay = new Date(t0).toDateString() === new Date(t1).toDateString();
        const ticks = xTicks(t0, t1, 4);
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#8AA0B8';
        ticks.forEach((tk) => ctx.fillText(formatTime(tk.ts, { sameDay, span }), x(tk.ts), L.padT + L.plotH + 7));
      }

      // ---- 末端点高亮 ----
      const last = ready[ready.length - 1];
      ctx.beginPath();
      ctx.fillStyle = '#1E6FE0';
      ctx.arc(last.px, last.py, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = '#fff';
      ctx.arc(last.px, last.py, 1.6, 0, Math.PI * 2);
      ctx.fill();

      this.setData({ chartReady: true });
    },

    drawEmpty(ctx: WxCanvasCtx, L: ChartLayout, text: string) {
      ctx.fillStyle = '#8AA0B8';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, L.width / 2, (L.padT + L.plotH) / 2);
    },

    onTouch(this: any, e: WechatMiniprogram.TouchEvent) {
      const ready = (this as any)._ready as ReadyPoint[] | undefined;
      const layout = (this as any)._layout as ChartLayout | undefined;
      if (!this.data.active || !ready || ready.length === 0 || !layout) return;
      const touch = e.touches[0] || e.changedTouches[0];
      // 小程序 touch 对象的 x/y 即相对当前元素（canvas）的坐标
      const xTouch = (touch as unknown as { x?: number; clientX?: number }).x ?? touch.clientX;
      if (typeof xTouch !== 'number') return;
      // 找最近点
      let best = ready[0];
      let bestDist = Math.abs(ready[0].px - xTouch);
      ready.forEach((p) => {
        const d = Math.abs(p.px - xTouch);
        if (d < bestDist) {
          bestDist = d;
          best = p;
        }
      });
      const sourceMap: Record<string, string> = {
        SIMULATED: '模拟数据',
        MANUAL: '人工测量',
        OFFICIAL_PUBLIC: '官方公开',
      };
      const source =
        sourceMap[best.sourceType || ''] || (best.scenarioId ? `模拟 · ${best.scenarioId}` : '');
      this.setData({
        hit: {
          x: best.px,
          y: best.py,
          label: formatFullTime(best.t),
          value: `${best.v}`,
          source,
        },
      });
    },

    onTouchEnd(this: any) {
      // 保留气泡，便于查看；离开后清除
      this.setData({ hit: null });
    },
  },
});

interface WxCanvasNode {
  getContext(t: string): unknown;
  width: number;
  height: number;
}
interface CanvasGradient {
  addColorStop(offset: number, color: string): void;
}
interface WxCanvasCtx {
  scale(x: number, y: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  stroke(): void;
  fill(): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient;
  setLineDash(d: number[]): void;
  fillText(text: string, x: number, y: number): void;
  fillStyle: string | CanvasGradient;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  lineJoin: string;
  lineCap: string;
}
