/** Minimal SVG icons for the timeline transport controls. */
export function PlayIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M3 2L12 7L3 12V2Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function PauseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="4" height="10" rx="1" fill="currentColor" />
      <rect x="8" y="2" width="4" height="10" rx="1" fill="currentColor" />
    </svg>
  )
}
