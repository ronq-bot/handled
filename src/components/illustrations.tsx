/**
 * Engraved line marks, drawn in brass on bone. Authored as inline SVG rather
 * than sourced photography — nothing to license, nothing to download, and it
 * suits the catalogue-plate look far better than stock images would.
 *
 * Every stroke carries `.ink-path` with a `--dash` roughly equal to its own
 * length, so it draws itself on when a parent <Reveal> adds `.is-in`.
 */

type MarkProps = { className?: string; title?: string };

function frame(title: string | undefined) {
  return title
    ? { role: "img" as const, "aria-label": title }
    : { "aria-hidden": true as const, focusable: "false" as const };
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** A rose, drawn as a spiral — three turns reads as petals at any size. */
function Rose({ x, y, r = 11 }: { x: number; y: number; r?: number }) {
  return (
    <path
      {...stroke}
      className="ink-path"
      style={{ ["--dash" as string]: "160" }}
      d={`M ${x} ${y} m ${-r} 0 a ${r} ${r} 0 1 1 ${r * 2} 0 a ${r * 0.68} ${r * 0.68} 0 1 1 ${
        -r * 1.36
      } 0 a ${r * 0.36} ${r * 0.36} 0 1 1 ${r * 0.72} 0`}
    />
  );
}

export function BouquetMark({ className = "", title }: MarkProps) {
  return (
    <svg viewBox="0 0 200 280" className={className} {...frame(title)}>
      {/* wrap */}
      <path
        {...stroke}
        className="ink-path"
        style={{ ["--dash" as string]: "320" }}
        d="M70 178 L130 178 L117 254 L83 254 Z"
      />
      <path
        {...stroke}
        className="ink-path"
        style={{ ["--dash" as string]: "140" }}
        d="M70 178 L100 198 L130 178"
      />
      <path
        {...stroke}
        className="ink-path"
        style={{ ["--dash" as string]: "80" }}
        d="M83 216 L117 216"
      />

      {/* stems */}
      <path
        {...stroke}
        className="ink-path"
        style={{ ["--dash" as string]: "120" }}
        d="M100 198 C97 168 91 138 84 112"
      />
      <path
        {...stroke}
        className="ink-path"
        style={{ ["--dash" as string]: "120" }}
        d="M100 198 C103 166 109 138 117 114"
      />
      <path
        {...stroke}
        className="ink-path"
        style={{ ["--dash" as string]: "110" }}
        d="M100 198 L100 106"
      />

      {/* leaves */}
      <path
        {...stroke}
        className="ink-path"
        style={{ ["--dash" as string]: "160" }}
        d="M99 178 C82 172 68 156 63 136 C80 140 94 156 99 178 Z"
      />
      <path
        {...stroke}
        className="ink-path"
        style={{ ["--dash" as string]: "160" }}
        d="M101 172 C118 166 132 150 137 130 C120 134 106 150 101 172 Z"
      />

      <Rose x={84} y={100} />
      <Rose x={117} y={102} />
      <Rose x={100} y={78} r={13} />

      {/* buds */}
      <path
        {...stroke}
        className="ink-path"
        style={{ ["--dash" as string]: "90" }}
        d="M64 122 c-6 -8 -2 -18 6 -18 c8 0 12 10 6 18 z"
      />
      <path
        {...stroke}
        className="ink-path"
        style={{ ["--dash" as string]: "90" }}
        d="M136 126 c-6 -8 -2 -18 6 -18 c8 0 12 10 6 18 z"
      />
    </svg>
  );
}

export function FruitMark({ className = "", title }: MarkProps) {
  return (
    <svg viewBox="0 0 200 280" className={className} {...frame(title)}>
      {/* footed bowl */}
      <path
        {...stroke}
        className="ink-path"
        style={{ ["--dash" as string]: "220" }}
        d="M56 168 C56 208 76 228 100 228 C124 228 144 208 144 168 Z"
      />
      <path
        {...stroke}
        className="ink-path"
        style={{ ["--dash" as string]: "90" }}
        d="M100 228 L100 250"
      />
      <path
        {...stroke}
        className="ink-path"
        style={{ ["--dash" as string]: "80" }}
        d="M76 254 L124 254"
      />

      {/* skewered pieces */}
      <path
        {...stroke}
        className="ink-path"
        style={{ ["--dash" as string]: "100" }}
        d="M78 168 L70 108"
      />
      <path
        {...stroke}
        className="ink-path"
        style={{ ["--dash" as string]: "100" }}
        d="M100 166 L100 96"
      />
      <path
        {...stroke}
        className="ink-path"
        style={{ ["--dash" as string]: "100" }}
        d="M122 168 L130 110"
      />

      {/* strawberry */}
      <path
        {...stroke}
        className="ink-path"
        style={{ ["--dash" as string]: "130" }}
        d="M100 78 C112 78 120 88 116 100 C113 110 106 116 100 116 C94 116 87 110 84 100 C80 88 88 78 100 78 Z"
      />
      <path
        {...stroke}
        className="ink-path"
        style={{ ["--dash" as string]: "80" }}
        d="M88 80 L100 72 L112 80"
      />

      {/* pineapple daisies */}
      <g className="ink-path" style={{ ["--dash" as string]: "200" }}>
        <circle {...stroke} cx={70} cy={98} r={7} />
        <path {...stroke} d="M70 84 L70 91 M70 105 L70 112 M56 98 L63 98 M77 98 L84 98" />
      </g>
      <g className="ink-path" style={{ ["--dash" as string]: "200" }}>
        <circle {...stroke} cx={130} cy={100} r={7} />
        <path {...stroke} d="M130 86 L130 93 M130 107 L130 114 M116 100 L123 100 M137 100 L144 100" />
      </g>
    </svg>
  );
}

/** A wax seal with the house monogram — used as a section ornament. */
export function SealMark({ className = "", title }: MarkProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...frame(title)}>
      <circle
        {...stroke}
        className="ink-path"
        style={{ ["--dash" as string]: "330" }}
        cx={60}
        cy={60}
        r={52}
      />
      <circle
        {...stroke}
        className="ink-path"
        style={{ ["--dash" as string]: "290" }}
        cx={60}
        cy={60}
        r={45}
        strokeDasharray="3 5"
      />
      <text
        x={60}
        y={72}
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        style={{ fontFamily: "var(--font-display)", fontSize: 34 }}
      >
        α
      </text>
    </svg>
  );
}

export function CalendarMark({ className = "", title }: MarkProps) {
  return (
    <svg viewBox="0 0 200 200" className={className} {...frame(title)}>
      <path
        {...stroke}
        className="ink-path"
        style={{ ["--dash" as string]: "420" }}
        d="M38 52 h124 a6 6 0 0 1 6 6 v100 a6 6 0 0 1 -6 6 h-124 a6 6 0 0 1 -6 -6 v-100 a6 6 0 0 1 6 -6 z"
      />
      <path
        {...stroke}
        className="ink-path"
        style={{ ["--dash" as string]: "140" }}
        d="M32 84 L168 84"
      />
      <path
        {...stroke}
        className="ink-path"
        style={{ ["--dash" as string]: "60" }}
        d="M66 36 L66 62 M134 36 L134 62"
      />
      {/* the ringed date */}
      <circle
        {...stroke}
        className="ink-path"
        style={{ ["--dash" as string]: "120" }}
        cx={128}
        cy={126}
        r={17}
      />
      <g {...stroke} className="ink-path" style={{ ["--dash" as string]: "260" }} opacity={0.55}>
        <path d="M58 108 h18 M92 108 h18 M126 108 h4" />
        <path d="M58 128 h18 M92 128 h18" />
        <path d="M58 148 h18 M92 148 h18 M118 148 h20" />
      </g>
    </svg>
  );
}
