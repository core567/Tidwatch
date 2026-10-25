export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div className="tw-segmented" role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={opt.value === value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
          {opt.count !== undefined && <span className="tw-segmented-count">{opt.count}</span>}
        </button>
      ))}
    </div>
  );
}
