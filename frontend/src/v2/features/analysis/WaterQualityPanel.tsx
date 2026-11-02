import type { CSSProperties } from 'react';
import type { WaterQualityStation } from './analysisTypes';
import type { Station, StationId } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { Panel } from '../../components/ui/Panel';

const classNames = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ'];
const classColors = ['#5fe3a0', '#4fe6d2', '#ffc46b', '#ff9f5e', '#ff6f5e'];

interface WaterQualityPanelProps {
  waterQuality: WaterQualityStation[];
  stations: Station[];
  selectedStation: StationId;
  onSelectStation: (id: StationId) => void;
}

export function WaterQualityPanel({
  waterQuality,
  stations,
  selectedStation,
  onSelectStation,
}: WaterQualityPanelProps) {
  const selected = waterQuality.find((w) => w.id === selectedStation);
  const station = stations.find((s) => s.id === selectedStation);
  const compliant = waterQuality.filter((w) => w.classIndex <= 1).length;

  return (
    <Panel
      code="05"
      title="水质评价"
      en="QUALITY CLASS"
      className="v2-wq-panel"
      bodyClassName="wq-panel__body"
    >
      <div className="v2-wq-list">
        {stations.map((item) => {
          const quality = waterQuality.find((w) => w.id === item.id);
          if (!quality) return null;
          const color = classColors[quality.classIndex];
          return (
            <button
              key={item.id}
              type="button"
              className={`v2-wq-row ${selectedStation === item.id ? 'is-active' : ''}`.trim()}
              onClick={() => onSelectStation(item.id)}
              aria-pressed={selectedStation === item.id}
              style={{ '--wq-color': color } as CSSProperties}
            >
              <span className="v2-wq-row__name">
                {item.id}
                <em>{item.name.replace(' 断面', '').replace(`${item.id} `, '')}</em>
              </span>
              <span className="v2-wq-row__class">{classNames[quality.classIndex]}</span>
              <span className="v2-wq-row__scale" aria-hidden="true">
                {classNames.map((cls, i) => (
                  <i key={cls} className={i <= quality.classIndex ? 'v2-is-filled' : ''} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="v2-wq-detail">
        <div className="v2-wq-detail__head">
          <span>{station?.name.replace(' 断面', '')} · 超标与预警</span>
          <span className="v2-mono">{selected?.exceedances.length ?? 0} 项</span>
        </div>
        {selected && selected.exceedances.length > 0 ? (
          <ul className="v2-wq-exceed">
            {selected.exceedances.map((item) => (
              <li key={item.metric}>
                <span className="v2-wq-exceed__metric">{item.metric}</span>
                <b className="v2-mono">{item.value}</b>
                <em>{item.note}</em>
              </li>
            ))}
          </ul>
        ) : (
          <div className="v2-wq-clear">
            <Icon name="check" size={14} />
            当前断面未发现超标指标
          </div>
        )}
      </div>

      <div className="v2-wq-foot">
        <span>
          综合达标 <b className="v2-mono">{String(compliant).padStart(2, '0')} / 03</b> 断面
        </span>
        <span className="v2-mono">DEMO · 评价规则</span>
      </div>
    </Panel>
  );
}
