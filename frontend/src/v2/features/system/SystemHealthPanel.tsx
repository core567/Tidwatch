import { useId } from 'react';
import type { HealthResponse } from '@/types/contract';
import { Icon } from '../../components/ui/Icon';
import { Panel } from '../../components/ui/Panel';

interface Check {
  id: string;
  name: string;
  detail: string;
  pass: boolean;
  status: string;
}

function HealthRing({ score, grade }: { score: number; grade: string }) {
  const rawId = useId();
  const gradientId = `health-${rawId.replace(/[^a-zA-Z0-9-]/g, '')}`;
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.min(100, Math.max(0, score)) / 100) * circumference;
  return (
    <div className="health-ring">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4fe6d2" />
            <stop offset="1" stopColor="#5fe3a0" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(120,205,210,0.1)" strokeWidth="5" />
        <circle
          cx="60" cy="60" r={radius} fill="none" stroke={`url(#${gradientId})`}
          strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`} transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="health-ring__center">
        <b className="v2-mono">{score.toFixed(1)}</b>
        <em>可用度</em>
        <span>{grade}</span>
      </div>
    </div>
  );
}

export function SystemHealthPanel({
  health, healthError, eventsOk, importOk, streamState,
}: {
  health?: HealthResponse;
  healthError?: Error | null;
  eventsOk: boolean;
  importOk: boolean;
  streamState: string;
}) {
  const checks: Check[] = [
    {
      id: 'api', name: '后端 API',
      detail: health ? `版本 ${health.version}` : '健康检查未返回',
      pass: health?.status === 'ok', status: health?.status === 'ok' ? '正常' : '异常',
    },
    {
      id: 'db', name: '数据库',
      detail: health ? `连接 ${health.database}` : '健康检查未返回',
      pass: health?.database === 'ok', status: health?.database === 'ok' ? '正常' : '异常',
    },
    {
      id: 'events', name: '事件接口',
      detail: '事件列表与研判数据',
      pass: eventsOk, status: eventsOk ? '正常' : '失败',
    },
    {
      id: 'import', name: '导入接口',
      detail: '官方月报批次与撤销',
      pass: importOk, status: importOk ? '正常' : '失败',
    },
    {
      id: 'stream', name: '实时通道',
      detail: 'SSE 事件与状态推送',
      pass: streamState === 'open',
      status: streamState === 'open' ? '已连接' : streamState === 'connecting' ? '连接中' : '未连接',
    },
  ];
  const passed = checks.filter((check) => check.pass).length;
  const score = (passed / checks.length) * 100;
  const grade = score >= 90 ? '运行正常' : score >= 70 ? '需要关注' : '异常';
  const now = new Date().toLocaleTimeString('zh-CN', { hour12: false });

  return (
    <Panel
      code="02"
      title="系统健康"
      en="SYSTEM HEALTH"
      className="health-panel"
      footer={
        <>
          <span className="health-panel__foot">
            <Icon name="clock" size={11} />
            页面检查 {now}
          </span>
          <span className="health-panel__foot health-panel__foot--right v2-mono">
            运行时间 暂无数据
          </span>
        </>
      }
    >
      {healthError && !health && (
        <div className="v2-sys-inline-error">健康检查失败：{healthError.message}</div>
      )}
      <div className="health-layout">
        <HealthRing score={score} grade={grade} />
        <div className="health-items">
          {checks.map((check) => (
            <div className="health-item" key={check.id}>
              <span className={`health-item__dot ${check.pass ? '' : 'health-item__dot--warn'}`.trim()} />
              <div className="health-item__main">
                <b>{check.name}</b>
                <em>{check.detail}</em>
              </div>
              <span className={`health-item__latency v2-mono ${check.pass ? '' : 'is-bad'}`.trim()}>{check.status}</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
