"use client";

// =============================================================================
// Sakura petals — deterministic pseudo-random so SSR and client match
// =============================================================================
export function Sakura() {
  const petals = Array.from({ length: 16 }, (_, i) => {
    // Simple deterministic seed per petal
    const s1 = ((i * 7 + 13) * 2654435761) >>> 0;
    const left = (s1 % 100);
    const delay = ((i * 1.3 + 0.2) % 8).toFixed(1);
    const duration = (9 + (s1 % 7)).toFixed(0);
    const size = 11 + (s1 % 7);

    return (
      <div
        key={i}
        className="petal"
        style={{
          left: `${left}%`,
          animationDelay: `${delay}s`,
          animationDuration: `${duration}s`,
          width: size,
          height: size,
        }}
      />
    );
  });

  return <>{petals}</>;
}

// =============================================================================
// Mascot — cute lavender robot face
// =============================================================================
export function Mascot({
  size = 120,
  mood = "happy",
}: {
  size?: number;
  mood?: "happy" | "asleep";
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className="floaty"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Antenna stick */}
      <line
        x1="60" y1="28" x2="60" y2="12"
        stroke="#ff9eaa" strokeWidth="3" strokeLinecap="round"
      />
      {/* Antenna ball */}
      <circle cx="60" cy="9" r="6" fill="#ff9eaa" />
      {/* Antenna highlight */}
      <circle cx="58" cy="7" r="2" fill="#ffd2d9" opacity="0.7" />

      {/* Head */}
      <rect
        x="24" y="28" width="72" height="68" rx="20"
        fill="#cdcaeb" stroke="#807ea8" strokeWidth="2"
      />

      {/* Face screen */}
      <rect x="32" y="38" width="56" height="42" rx="12" fill="#3d2a3a" />

      {/* Eyes */}
      {mood === "happy" ? (
        <>
          {/* Glow halos */}
          <circle cx="48" cy="56" r="8" fill="#1f9d62" opacity="0.12" />
          <circle cx="72" cy="56" r="8" fill="#1f9d62" opacity="0.12" />
          {/* Iris */}
          <circle cx="48" cy="56" r="5" fill="#7bebb0" />
          <circle cx="72" cy="56" r="5" fill="#7bebb0" />
          {/* Glint */}
          <circle cx="50" cy="54" r="1.8" fill="#fff" opacity="0.85" />
          <circle cx="74" cy="54" r="1.8" fill="#fff" opacity="0.85" />
        </>
      ) : (
        <>
          {/* Closed curve eyes */}
          <path
            d="M42 56 Q48 62 54 56"
            stroke="#7bebb0" strokeWidth="2.5" fill="none" strokeLinecap="round"
          />
          <path
            d="M66 56 Q72 62 78 56"
            stroke="#7bebb0" strokeWidth="2.5" fill="none" strokeLinecap="round"
          />
        </>
      )}

      {/* Smile */}
      <path
        d="M51 67 Q60 74 69 67"
        stroke="#7bebb0" strokeWidth="2" fill="none" strokeLinecap="round"
      />

      {/* Blush — outside the screen, on the head */}
      <ellipse cx="26" cy="64" rx="6" ry="4" fill="#ffd2d9" opacity="0.55" />
      <ellipse cx="94" cy="64" rx="6" ry="4" fill="#ffd2d9" opacity="0.55" />

      {/* Side ear buttons */}
      <rect x="17" y="54" width="7" height="14" rx="3.5" fill="#b5b3d6" />
      <rect x="96" y="54" width="7" height="14" rx="3.5" fill="#b5b3d6" />
    </svg>
  );
}
