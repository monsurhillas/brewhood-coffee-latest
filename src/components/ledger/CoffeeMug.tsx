"use client";

import { useId } from "react";

export type MugSlice = { name: string; pct: number; mugColor: string };

// The liquid region inside the drawn cup below, in the same 0-100/0-140
// viewBox units — kept in sync with the <rect>/<ellipse> geometry so the
// stacked coffee bands line up with the walls of the mug.
const INNER = { x: 27, y: 34, width: 46, height: 62, rx: 8 };

// A little layered-coffee "meter": the mug is always fully poured, its
// bands sized by each drink's share of this person's counted sales — not
// an absolute quantity, so there's nothing to compare it against besides
// itself. The biggest drink anchors the bottom, like sediment, so the mug
// visually reads as "built from" whatever they order most.
export default function CoffeeMug({ slices, size = 88 }: { slices: MugSlice[]; size?: number }) {
  const clipId = useId();
  const hasCoffee = slices.length > 0;

  let cursorY = INNER.y + INNER.height;
  const bands = slices.map((slice) => {
    const height = (slice.pct / 100) * INNER.height;
    const y = cursorY - height;
    cursorY = y;
    return { ...slice, y, height };
  });

  return (
    <svg
      width={size}
      height={size * 1.12}
      viewBox="0 0 100 112"
      role="img"
      aria-label={
        hasCoffee
          ? `Coffee mix: ${slices.map((s) => `${s.name} ${s.pct}%`).join(", ")}`
          : "No coffee logged yet"
      }
    >
      <g stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.45">
        <path d="M40 14 C 36 9, 44 6, 40 1" />
        <path d="M52 15 C 48 10, 56 7, 52 2" />
        <path d="M64 14 C 60 9, 68 6, 64 1" />
      </g>

      <path
        d="M79 46 C 96 46, 96 92, 79 92"
        fill="none"
        stroke="var(--border)"
        strokeWidth="7"
        strokeLinecap="round"
      />

      <rect x="20" y="30" width="60" height="76" rx="10" fill="var(--card)" stroke="var(--border)" strokeWidth="3" />

      <clipPath id={clipId}>
        <rect x={INNER.x} y={INNER.y} width={INNER.width} height={INNER.height} rx={INNER.rx} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {hasCoffee ? (
          bands.map((b) => (
            <rect
              key={b.name}
              x={INNER.x}
              y={b.y}
              width={INNER.width}
              height={b.height}
              fill={b.mugColor}
              stroke="var(--card)"
              strokeWidth="1"
            />
          ))
        ) : (
          <rect x={INNER.x} y={INNER.y} width={INNER.width} height={INNER.height} fill="var(--border)" opacity="0.3" />
        )}
      </g>

      <ellipse
        cx="30"
        cy="46"
        rx="5"
        ry="15"
        fill="#fff"
        opacity="0.12"
        transform="rotate(-12 30 46)"
      />

      <ellipse cx="50" cy="30" rx="30" ry="6" fill="var(--card)" stroke="var(--border)" strokeWidth="3" />
    </svg>
  );
}
