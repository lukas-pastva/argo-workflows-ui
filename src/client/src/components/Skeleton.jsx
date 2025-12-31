import React from "react";

/**
 * Skeleton loader component for loading states
 *
 * Variants:
 *  - text: Single line text placeholder
 *  - row: Table row placeholder
 *  - card: Card placeholder
 *  - circle: Circular avatar placeholder
 *  - button: Button placeholder
 */
export default function Skeleton({
  variant = "text",
  width,
  height,
  count = 1,
  className = "",
  style = {}
}) {
  const baseStyle = {
    width: width || "100%",
    height: height || getDefaultHeight(variant),
    ...style,
  };

  const variants = {
    text: { borderRadius: "6px" },
    row: { borderRadius: "10px", marginBottom: "0.5rem" },
    card: { borderRadius: "14px", padding: "1rem" },
    circle: { borderRadius: "50%", width: height || "40px", height: height || "40px" },
    button: { borderRadius: "10px", width: width || "100px", height: height || "36px" },
  };

  const items = Array.from({ length: count }, (_, i) => (
    <div
      key={i}
      className={`skeleton ${className}`}
      style={{ ...baseStyle, ...variants[variant] }}
      aria-hidden="true"
    />
  ));

  return count === 1 ? items[0] : <>{items}</>;
}

function getDefaultHeight(variant) {
  switch (variant) {
    case "text": return "1em";
    case "row": return "48px";
    case "card": return "120px";
    case "circle": return "40px";
    case "button": return "36px";
    default: return "1em";
  }
}

/**
 * Table skeleton - renders multiple skeleton rows
 */
export function TableSkeleton({ rows = 5, columns = 5 }) {
  return (
    <div style={{ padding: "1rem" }}>
      {/* Header skeleton */}
      <div
        className="skeleton"
        style={{
          height: "40px",
          borderRadius: "10px",
          marginBottom: "1rem",
          opacity: 0.7
        }}
      />
      {/* Row skeletons */}
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="skeleton skeleton-row"
          style={{
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Card skeleton - renders a card placeholder
 */
export function CardSkeleton({ showHeader = true, showContent = true }) {
  return (
    <div
      style={{
        background: "var(--card-bg)",
        borderRadius: "14px",
        padding: "1.5rem",
        border: "1px solid var(--border-color)",
      }}
    >
      {showHeader && (
        <div
          className="skeleton"
          style={{
            height: "24px",
            width: "40%",
            borderRadius: "6px",
            marginBottom: "1rem"
          }}
        />
      )}
      {showContent && (
        <>
          <div
            className="skeleton"
            style={{
              height: "14px",
              width: "100%",
              borderRadius: "6px",
              marginBottom: "0.5rem"
            }}
          />
          <div
            className="skeleton"
            style={{
              height: "14px",
              width: "80%",
              borderRadius: "6px",
              marginBottom: "0.5rem"
            }}
          />
          <div
            className="skeleton"
            style={{
              height: "14px",
              width: "60%",
              borderRadius: "6px"
            }}
          />
        </>
      )}
    </div>
  );
}
