import { useId, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Icon } from '../../components/ui/Icon';
import type { RecoveryAssessment } from '@/types/contract';
import { FACTOR_CN, displayIso, factorSorted } from './reviewModel';

function resultTone(result: RecoveryAssessment['result']) {
  if (result === 'RECOVERED_SUPPORTED') {
    return {
      badge: 'live' as const,
      accent: '#4fe6d2',
      accent2: '#5fe3a0',
      ring: 'rgba(79,230,210,0.16)',
      className: 'is-ok',
    };
  }
  if (result === 'NEEDS_OBSERVATION') {
    return {
      badge: 'mid' as const,
      accent: '#ffc46b',
      accent2: '#ff9f5e',
      ring: 'rgba(255,196,107,0.16)',
      className: 'is-watch',
    };
  }
  return {
    badge: 'default' as const,
    accent: '#8aaab2',
    accent2: '#628891',
    ring: 'rgba(120,205,210,0.14)',
    className: 'is-muted',
  };
}

/**
 * 恢复评估（真实规则结论）：
 * 环形图展示「规则通过数 / 规则总数」，不把规则通过率冒充恢复度。
 */
export function RecoveryCard({ assess }: { assess: RecoveryAssessment | undefined }) {
  const [open, setOpen] = useState(false);
  const rawId = useId();
  const gradientId = `v2-recovery-${rawId.replace(/[^a-zA-Z0-9-]/g, '')}`;

  if (!assess) {
    return (
      <section className="v2-recovery-card">
        <header className="v2-report-block__head">
          <h4>恢复评估</h4>
          <span>RECOVERY</span>
        </header>
        <p className="v2-report-empty">未获取恢复评估结果</p>
      </section>
    );
  }

  const total = assess.factors.length;
  const pass = assess.factors.filter((f) => f.passed === true).length;
  const fail = assess.factors.filter((f) => f.passed === false).length;
  const unknown = total - pass - fail;
  const pct = total ? Math.round((pass / total) * 100) : 0;
  const tone = resultTone(assess.result);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;
  const factors = factorSorted(assess.factors);

  return (
    <section className="v2-recovery-card">
      <header className="v2-report-block__head">
        <h4>恢复评估</h4>
        <span>RECOVERY</span>
        <Badge tone={tone.badge} className="v2-recovery-card__badge">{assess.label}</Badge>
      </header>

      <div className="v2-recovery-card__body">
        <div className={`v2-recovery-ring ${tone.className}`}>
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={tone.accent} />
                <stop offset="1" stopColor={tone.accent2} />
              </linearGradient>
            </defs>
            <circle cx="60" cy="60" r={radius} fill="none" stroke={tone.ring} strokeWidth="6" />
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div className="v2-recovery-ring__center">
            <b className="v2-mono">{pass}</b>
            <span>/ {total}</span>
            <em>规则通过</em>
          </div>
        </div>

        <div className="v2-recovery-card__meta">
          <div className="v2-recovery-card__counts">
            <div className="v2-recovery-count v2-recovery-count--ok"><b>{pass}</b><span>通过</span></div>
            <div className="v2-recovery-count v2-recovery-count--danger"><b>{fail}</b><span>不满足</span></div>
            <div className="v2-recovery-count v2-recovery-count--muted"><b>{unknown}</b><span>信息不足</span></div>
          </div>
          <div className="v2-recovery-card__anchor">
            <span>
              锚点 <b className="v2-mono">{assess.anchor.at ? displayIso(assess.anchor.at) : '缺失'}</b>
            </span>
            <em>{assess.anchor.note}</em>
          </div>
          <button
            type="button"
            className="v2-recovery-card__toggle"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? '收起' : '查看'} {total} 项规则依据
            <Icon name="chevron-right" size={11} className={open ? 'v2-is-open' : ''} />
          </button>
        </div>
      </div>

      {open && (
        <div className="v2-recovery-factors">
          {factors.map((f) => {
            const state = f.passed === true ? '通过' : f.passed === false ? '不满足' : '信息不足';
            const stateTone = f.passed === true ? 'ok' : f.passed === false ? 'danger' : 'muted';
            return (
              <div className={`v2-recovery-factor v2-recovery-factor--${stateTone}`} key={f.code}>
                <span className={`v2-recovery-factor__dot v2-recovery-factor__dot--${stateTone}`} />
                <div className="v2-recovery-factor__body">
                  <div className="v2-recovery-factor__title">
                    <b>{FACTOR_CN[f.code] ?? f.code}</b>
                    <span className={`v2-recovery-factor__state v2-recovery-factor__state--${stateTone}`}>{state}</span>
                    <code>{f.code}</code>
                  </div>
                  <p>{f.detail}</p>
                </div>
              </div>
            );
          })}
          <p className="v2-recovery-card__note">规则只读结论，不改变事件业务状态。</p>
        </div>
      )}
    </section>
  );
}
