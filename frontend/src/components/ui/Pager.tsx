import Button from './Button';

/** 轻量分页：显示总条数、当前页/总页数，上一页/下一页 + 页码。 */
export default function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const pages: number[] = [];
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  for (let p = start; p <= Math.min(totalPages, start + 4); p++) pages.push(p);

  return (
    <div className="tw-pager">
      <span className="tw-tiny">
        共 {total} 条 · 第 {page}/{totalPages} 页
      </span>
      <div className="tw-row" style={{ gap: 4 }}>
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          上一页
        </Button>
        {pages.map((p) => (
          <button
            key={p}
            className={`tw-pager-num${p === page ? ' is-current' : ''}`}
            onClick={() => onPage(p)}
          >
            {p}
          </button>
        ))}
        <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          下一页
        </Button>
      </div>
    </div>
  );
}
