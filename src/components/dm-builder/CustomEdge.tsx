// Ported from BooSend app/automation/builder/page.tsx (CustomEdge).
// Bezier edge with a hover-only delete button at the midpoint.
import { useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { Trash2 } from 'lucide-react'

let deleteEdgeCallback: ((id: string) => void) | null = null
export function setDeleteEdgeCallback(cb: ((id: string) => void) | null) {
  deleteEdgeCallback = cb
}

export default function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}: EdgeProps) {
  const [isHovered, setIsHovered] = useState(false)

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const onEdgeClick = (evt: React.MouseEvent) => {
    evt.stopPropagation()
    if (deleteEdgeCallback) {
      deleteEdgeCallback(id)
    }
  }

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} interactionWidth={1000} />
      {/* Separate path for hover detection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={100}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ pointerEvents: 'stroke' }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            fontSize: 12,
            opacity: isHovered ? 1 : 0,
            pointerEvents: isHovered ? 'all' : 'none',
            transition: 'opacity 0.2s ease',
          }}
          className="nodrag nopan"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <button
            type="button"
            onClick={onEdgeClick}
            title="Delete connection"
            className="bg-white border border-gray-300 rounded-full w-7 h-7 flex items-center justify-center text-gray-600 hover:text-red-600 hover:border-red-300 shadow-sm"
            style={{ opacity: 1, pointerEvents: 'all' }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
