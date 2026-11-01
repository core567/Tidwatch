import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'overview'
  | 'analysis'
  | 'assessment'
  | 'inspection'
  | 'review'
  | 'system'
  | 'twin'
  | 'assistant'
  | 'refresh'
  | 'arrow-right'
  | 'arrow-up-right'
  | 'chevron-right'
  | 'clock'
  | 'mic'
  | 'plus'
  | 'download'
  | 'check'
  | 'close'
  | 'wave'
  | 'filter'
  | 'expand'
  | 'send'
  | 'camera'
  | 'search'
  | 'server'
  | 'layers';

const shapes: Record<IconName, ReactNode> = {
  overview: <path d="M2.5 12h3.6l2.4-6.2 4 12.4 2.5-6.2h6.5" />,
  analysis: (
    <>
      <path d="M3.5 20h17" />
      <path d="M6 16.5V11M10.5 16.5V5.5M15 16.5v-8M19.5 16.5v-4" />
    </>
  ),
  assessment: (
    <>
      <path d="M12 3.2 2.9 20h18.2L12 3.2Z" />
      <path d="M12 9.4v4.8M12 17.2h.01" />
    </>
  ),
  inspection: (
    <>
      <path d="M8.5 4.5H6.2A1.2 1.2 0 0 0 5 5.7v14.1A1.2 1.2 0 0 0 6.2 21h11.6a1.2 1.2 0 0 0 1.2-1.2V5.7a1.2 1.2 0 0 0-1.2-1.2h-2.3" />
      <rect x="8.5" y="2.8" width="7" height="3.4" rx="0.8" />
      <path d="M8.8 13.2l2 2 4.4-4.4" />
    </>
  ),
  review: (
    <>
      <path d="M6 3h8l4 4v14H6V3Z" />
      <path d="M14 3v4h4" />
      <path d="M9 12.5v5M12 10.5v7M15 13.5v4" />
    </>
  ),
  system: (
    <>
      <ellipse cx="12" cy="5.5" rx="7.8" ry="2.9" />
      <path d="M4.2 5.5v13c0 1.6 3.5 2.9 7.8 2.9s7.8-1.3 7.8-2.9v-13" />
      <path d="M4.2 12c0 1.6 3.5 2.9 7.8 2.9s7.8-1.3 7.8-2.9" />
    </>
  ),
  twin: (
    <>
      <path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4L12 2.8Z" />
      <path d="M4 7.4 12 12l8-4.6M12 12v9.2" />
    </>
  ),
  assistant: (
    <>
      <path d="M11 3.4l1.8 4.8 4.8 1.8-4.8 1.8L11 16.6l-1.8-4.8L4.4 10l4.8-1.8L11 3.4Z" />
      <path d="M18.2 15.4l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8.8-2.1Z" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-2.34 6.1" />
      <path d="M20 4.6V11h-6.4" />
    </>
  ),
  'arrow-right': <path d="M4.5 12h14.5M13 6l6 6-6 6" />,
  'arrow-up-right': <path d="M7 17 17 7M9 7h8v8" />,
  'chevron-right': <path d="M9.5 6l6 6-6 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.4V12l3 1.8" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.8 11.4a6.2 6.2 0 0 0 12.4 0M12 17.6V21M9 21h6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  download: (
    <>
      <path d="M12 3.5v11M7.5 10l4.5 4.5L16.5 10" />
      <path d="M4 18.5h16" />
    </>
  ),
  check: <path d="M4.5 12.5l4.5 4.5 10.5-11" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  wave: (
    <>
      <path d="M2 13.5c3 0 3-5 6-5s3 5 6 5 3-5 6-5" />
      <path d="M2 19c3 0 3-5 6-5s3 5 6 5 3-5 6-5" opacity=".5" />
    </>
  ),
  filter: <path d="M3.5 5.5h17l-6.5 7.6v6.2l-4 1.7v-7.9L3.5 5.5Z" />,
  expand: <path d="M4 9V4h5M20 15v5h-5M20 9V4h-5M4 15v5h5" />,
  send: <path d="M21 3 10.5 13.5M21 3l-6.5 18-4-8.5L2 8.5 21 3Z" />,
  camera: (
    <>
      <path d="M3.5 8h3.6l1.5-2.2h6.8L16.9 8h3.6v11.2H3.5V8Z" />
      <circle cx="12" cy="13.4" r="3.4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.7" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  server: (
    <>
      <rect x="3.5" y="4" width="17" height="6.4" rx="1" />
      <rect x="3.5" y="13.6" width="17" height="6.4" rx="1" />
      <path d="M7 7.2h.01M7 16.8h.01M10.5 7.2h4M10.5 16.8h4" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3 3.5 7.6 12 12.2l8.5-4.6L12 3Z" />
      <path d="m3.5 12.2 8.5 4.6 8.5-4.6M3.5 16.8l8.5 4.6 8.5-4.6" />
    </>
  ),
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, strokeWidth = 1.4, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {shapes[name]}
    </svg>
  );
}
