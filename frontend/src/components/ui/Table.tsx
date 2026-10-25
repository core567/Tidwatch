import type { PropsWithChildren, ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';

export function Table({ children }: PropsWithChildren) {
  return (
    <div className="tw-table-wrap">
      <table className="tw-table">{children}</table>
    </div>
  );
}

export function Th({ children, ...rest }: PropsWithChildren<ThHTMLAttributes<HTMLTableCellElement>>) {
  return <th {...rest}>{children}</th>;
}

export function Td({ children, ...rest }: PropsWithChildren<TdHTMLAttributes<HTMLTableCellElement>>) {
  return <td {...rest}>{children}</td>;
}

export function TableEmpty({
  colSpan,
  title = '暂无数据',
  description,
}: {
  colSpan: number;
  title?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <tr>
      <td className="tw-table-empty" colSpan={colSpan}>
        <div style={{ fontWeight: 600, color: 'var(--tw-primary-800)' }}>{title}</div>
        {description && <div style={{ marginTop: 4, fontSize: 12.5 }}>{description}</div>}
      </td>
    </tr>
  );
}
