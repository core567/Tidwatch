import { Icon } from './Icon';

interface PhotoTileProps {
  index: number;
  label?: string;
  time?: string;
}

export function PhotoTile({ index, label, time }: PhotoTileProps) {
  return (
    <figure className="v2-photo-tile">
      <div className="v2-photo-tile__art" aria-hidden="true">
        <svg viewBox="0 0 160 96" preserveAspectRatio="none">
          <g fill="none" stroke="rgba(170,255,245,0.16)" strokeWidth="1">
            <path d="M-10 74 C 30 60, 50 82, 84 70 S 140 50, 170 62" />
            <path d="M-10 84 C 30 70, 50 92, 84 80 S 140 60, 170 72" />
            <path d="M-10 64 C 30 50, 50 72, 84 60 S 140 40, 170 52" />
          </g>
        </svg>
        <span className="v2-photo-tile__no v2-mono">IMG_{String(index).padStart(2, '0')}</span>
        <span className="v2-photo-tile__demo v2-mono">DEMO</span>
      </div>
      <figcaption>
        <Icon name="camera" size={11} />
        {label ?? `现场照片 ${index}`}
        {time && <span className="v2-mono">{time}</span>}
      </figcaption>
    </figure>
  );
}
