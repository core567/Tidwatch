export function Backdrop() {
  const contours = Array.from({ length: 13 }, (_, i) => {
    const shift = i * 74;
    const wobble = i % 2 === 0 ? 26 : -18;
    return `M -100 ${108 + shift} C 220 ${32 + shift + wobble}, 430 ${
      226 + shift - wobble
    }, 720 ${148 + shift} S 1170 ${36 + shift + wobble}, 1560 ${142 + shift}`;
  });

  return (
    <div className="v2-backdrop" aria-hidden="true">
      <div className="v2-backdrop__grid" />
      <svg
        className="v2-backdrop__contours"
        viewBox="0 0 1440 1000"
        preserveAspectRatio="none"
      >
        <g fill="none" stroke="rgba(110, 215, 215, 0.055)" strokeWidth="1">
          {contours.map((d, i) => (
            <path key={i} d={d} style={{ animationDelay: `${-i * 3}s` }} />
          ))}
        </g>
      </svg>
      <div className="v2-backdrop__glow v2-backdrop__glow--a" />
      <div className="v2-backdrop__glow v2-backdrop__glow--b" />
    </div>
  );
}
