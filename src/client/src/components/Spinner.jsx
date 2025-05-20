import React from "react";

export default function Spinner({ small = false }) {
  return (
    <span
      className={
        `inline-block animate-spin rounded-full border-gray-300
         border-t-4 border-t-primary
         ${small ? "w-4 h-4 border-2" : "w-9 h-9"}`
      }
      aria-label="loading"
    />
  );
}
