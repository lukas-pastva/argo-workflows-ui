import React, { useEffect, useState } from "react";
import { IconClose } from "./icons";

/**
 * Professional error banner with animation
 *
 * Props
 *  – message  (String)  : error text to show; empty/false hides the banner
 *  – onClose  (Func)    : callback that clears the error in the parent
 *  – duration (Number)  : how long to stay visible (ms); default 5000 ms
 */
export default function ErrorBanner({ message, onClose, duration = 5000 }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (message) {
      setIsVisible(true);
      setIsExiting(false);
    }
  }, [message]);

  useEffect(() => {
    if (!message) return undefined;
    const id = setTimeout(() => {
      handleClose();
    }, duration);
    return () => clearTimeout(id);
  }, [message, duration]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose();
    }, 300);
  };

  if (!message || !isVisible) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: "fixed",
        top: "var(--space-4)",
        left: "50%",
        transform: `translateX(-50%) ${isExiting ? 'translateY(-20px)' : 'translateY(0)'}`,
        zIndex: 1100,
        background: "linear-gradient(135deg, var(--danger) 0%, var(--danger-600) 100%)",
        color: "#fff",
        padding: "var(--space-3) var(--space-6)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-lg), 0 4px 20px rgba(239, 68, 68, 0.3)",
        display: "flex",
        alignItems: "center",
        gap: "var(--space-4)",
        maxWidth: "90vw",
        animation: isExiting ? "none" : "fadeInDown 0.4s cubic-bezier(0.19, 1, 0.22, 1)",
        opacity: isExiting ? 0 : 1,
        transition: "opacity 0.3s ease, transform 0.3s ease",
      }}
    >
      {/* Error icon */}
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>

      <span style={{ fontWeight: 500, fontSize: "0.875rem" }}>{message}</span>

      <button
        onClick={handleClose}
        aria-label="Dismiss error"
        style={{
          marginLeft: "auto",
          background: "rgba(255, 255, 255, 0.2)",
          border: "none",
          borderRadius: "var(--radius-full)",
          width: "28px",
          height: "28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: "#fff",
          transition: "all var(--transition-base)",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.3)";
          e.currentTarget.style.transform = "scale(1.1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
          e.currentTarget.style.transform = "scale(1)";
        }}
      >
        <IconClose width={14} height={14} />
      </button>
    </div>
  );
}
