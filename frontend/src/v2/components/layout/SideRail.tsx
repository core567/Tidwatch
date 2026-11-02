import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from '../../config/nav';
import { Icon } from '../ui/Icon';

export function SideRail() {
  return (
    <aside className="v2-rail" aria-label="主导航">
      <div className="v2-rail__mark">
        <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true">
          <rect x="0.5" y="0.5" width="33" height="33" stroke="rgba(79,230,210,0.32)" />
          <path
            d="M6.5 20.5c3.6 0 3.6-5.2 7.2-5.2s3.6 5.2 7.2 5.2 3.6-5.2 6.1-5.2"
            stroke="var(--tide)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M6.5 26c3.6 0 3.6-5.2 7.2-5.2s3.6 5.2 7.2 5.2 3.6-5.2 6.1-5.2"
            stroke="rgba(79,230,210,0.4)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <circle cx="17" cy="8.5" r="1.4" fill="var(--tide)" />
        </svg>
        <div className="v2-rail__wordmark">
          <strong>TIDEWATCH</strong>
          <span>RIVER INTELLIGENCE</span>
        </div>
      </div>

      <nav className="v2-rail__nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) => `v2-rail__item ${isActive ? 'v2-is-active' : ''}`.trim()}
            aria-label={item.label}
          >
            <span className="v2-rail__item-num">{item.index}</span>
            <span className="v2-rail__item-icon">
              <Icon name={item.icon} size={18} />
            </span>
            <span className="v2-rail__item-label">
              <b>{item.label}</b>
              <em>{item.en}</em>
            </span>
          </NavLink>
        ))}
      </nav>

      <div className="v2-rail__spine" aria-hidden="true">
        HAN RIVER · 30.59°N · 114.30°E
      </div>

      <div className="v2-rail__foot" title="系统运行正常">
        <span className="v2-status-dot" />
        <div className="v2-rail__foot-text">
          <b>SYSTEM NOMINAL</b>
          <span>v0.1 · DEMO BUILD</span>
        </div>
      </div>
    </aside>
  );
}
