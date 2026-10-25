export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
}

export default function Tabs({ items, active, onChange }: TabsProps) {
  return (
    <div className="tw-tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.key}
          role="tab"
          aria-selected={item.key === active}
          onClick={() => onChange(item.key)}
        >
          {item.label}
          {item.count !== undefined ? <span className="tw-tabs-count">{item.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
