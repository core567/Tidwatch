import SourceTag from './SourceTag';

export function OnlineBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; text: string }> = {
    ONLINE: { cls: 'badge-ok', text: '在线' },
    STALE: { cls: 'badge-watch', text: '数据陈旧' },
    OFFLINE: { cls: 'badge-offline', text: '离线' },
  };
  const v = map[status] ?? { cls: 'badge-offline', text: status };
  return <span className={`badge ${v.cls}`}>{v.text}</span>
}

export function RelativeTime({ iso }: { iso: string | null }) {
  if (!iso) return <span className="muted">无数据</span>;
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diff / 1000);
  let text: string;
  if (sec < 0) text = '刚刚';
  else if (sec < 60) text = `${sec} 秒前`;
  else if (sec < 3600) text = `${Math.floor(sec / 60)} 分钟前`;
  else if (sec < 86400) text = `${Math.floor(sec / 3600)} 小时前`;
  else text = `${Math.floor(sec / 86400)} 天前`;
  return (
    <span className="muted" title={new Date(iso).toLocaleString('zh-CN')}>
      {text}
    </span>
  );
}

export { SourceTag };
