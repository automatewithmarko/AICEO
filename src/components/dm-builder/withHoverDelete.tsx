// Ported from BooSend app/automation/builder/page.tsx (withHoverDelete).
// Adds a hover-only duplicate + delete button row above any node.
import { useReactFlow } from '@xyflow/react'
import { Copy, Trash2 } from 'lucide-react'

export default function withHoverDelete(NodeComponent: React.ComponentType<any>) {
  return function WrappedNode(props: any) {
    const { setNodes, setEdges, getNode } = useReactFlow()
    const { id } = props

    const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation()
      const deletedNodeId = id

      setEdges((eds) => eds.filter((edge) => edge.source !== deletedNodeId && edge.target !== deletedNodeId))

      // Clear any button nextStepId references that point to the deleted node
      setNodes((nds) => nds.map((node) => {
        if (node.data?.buttons && Array.isArray(node.data.buttons)) {
          const updatedButtons = node.data.buttons.map((button: any) => {
            if (button.nextStepId === deletedNodeId) {
              return { ...button, nextStepId: undefined }
            }
            return button
          })
          return { ...node, data: { ...node.data, buttons: updatedButtons } }
        }
        return node
      }).filter((n) => n.id !== deletedNodeId))
    }

    const handleDuplicate = (e: React.MouseEvent) => {
      e.stopPropagation()
      const source = getNode(id)
      if (!source) return
      const clonedData = (() => {
        try {
          const json = JSON.parse(JSON.stringify(source.data || {}))
          if (Array.isArray(json.buttons)) {
            json.buttons = json.buttons.map((b: any) => ({ ...b, nextStepId: undefined }))
          }
          return json
        } catch {
          return { ...(source.data || {}) }
        }
      })()
      const newId = `${source.type || 'node'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const newNode = {
        ...source,
        id: newId,
        position: {
          x: (source.position?.x ?? 0) + 280,
          y: (source.position?.y ?? 0) + 180,
        },
        data: clonedData,
        selected: false,
      }
      setNodes((nds) => nds.map((n) => ({ ...n, selected: false })).concat(newNode as any))
    }

    return (
      <div className="relative group">
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-[1000]">
          <button
            type="button"
            onClick={handleDuplicate}
            title="Duplicate node"
            className="bg-white border border-gray-300 rounded-full w-7 h-7 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:border-gray-400 shadow-sm"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            title="Delete node"
            className="bg-white border border-gray-300 rounded-full w-7 h-7 flex items-center justify-center text-gray-600 hover:text-red-600 hover:border-red-300 shadow-sm"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <NodeComponent {...props} />
      </div>
    )
  }
}
