import React from "react";

export default function ErrorBanner({ message, onClose }) {
  if (!message) return null;
  return (
    <div
      style={{
        background: "#fee",
        color: "#a00",
        padding: "0.75rem 1rem",
        borderBottom: "1px solid #d88"
      }}
    >
      {message}
      <button
        style={{
          marginLeft: "1rem",
          background: "transparent",
          border: "none",
          fontSize: "1.2rem",
          cursor: "pointer",
          color: "#a00"
        }}
        onClick={onClose}
        aria-label="close"
      >
        ×
      </button>
    </div>
  );
}
