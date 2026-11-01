interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  mini?: boolean;
  ariaLabel: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  mini,
  ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div className={`v2-seg ${mini ? 'v2-seg--mini' : ''}`.trim()} role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`v2-seg__btn ${opt.value === value ? 'v2-is-active' : ''}`.trim()}
          aria-pressed={opt.value === value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
