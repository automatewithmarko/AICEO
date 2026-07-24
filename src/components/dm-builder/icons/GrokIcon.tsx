import * as React from 'react'

interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {}

export default function GrokIcon({ className, alt = 'Grok', ...props }: Props) {
  return (
    <img
      src="/grok-seeklogo.png"
      alt={alt}
      className={className}
      {...props}
    />
  )
}


