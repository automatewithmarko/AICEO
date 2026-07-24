import * as React from 'react'

interface Props extends React.SVGProps<SVGSVGElement> {}

// Matches Gemini icon used in AICreditsPricingModal
export default function GeminiIcon(props: Props) {
  return (
    <svg
      viewBox="0 0 28 28"
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id="gem1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="50%" stopColor="#9B72CB" />
          <stop offset="100%" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path
        d="M14 2C14 2 15.2 9.5 18.5 13C21.8 16.5 26 14 26 14C26 14 21.8 11.5 18.5 15C15.2 18.5 14 26 14 26C14 26 12.8 18.5 9.5 15C6.2 11.5 2 14 2 14C2 14 6.2 16.5 9.5 13C12.8 9.5 14 2 14 2Z"
        fill="url(#gem1)"
      />
    </svg>
  )
}


