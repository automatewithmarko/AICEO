import React from 'react'

interface BooSendIconProps {
  className?: string
}

export default function BooSendIcon({ className = "w-5 h-5" }: BooSendIconProps) {
  return (
    <img 
      src="https://i.postimg.cc/cJnkg6sZ/boosend-logo.png" 
      alt="BooSend AI" 
      className={className}
    />
  )
}