import { memo, useEffect, useRef, useState } from 'react'
import { Handle, Position, useNodeId, useStore } from '@xyflow/react'
import { GitBranch, Trash2 } from 'lucide-react'
import { useTranslation } from '../i18n'

interface RandomizerNodeData {
  paths?: number
  weights?: number[]
  descriptions?: string[]
}

function RandomizerNode({ data, selected }: any) {
  const { t } = useTranslation('automation')
  const nodeId = useNodeId()

  // Check which path handles have edges connected
  const pathEdges = useStore((s) =>
    nodeId ? s.edges.filter((e) => e.source === nodeId && e.sourceHandle?.startsWith('path-')) : []
  )

  // Always show expanded layout (design request)
  const [isEditing] = useState(true)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [formData, setFormData] = useState({
    paths: data.paths || 2,
    weights: data.weights || [50, 50],
    descriptions: data.descriptions || ['Path A', 'Path B']
  })
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [inlineValue, setInlineValue] = useState<string>('')

  const handleSave = () => {
    Object.assign(data, formData)
  }

  const addPath = () => {
    const newPaths = formData.paths + 1
    const newWeight = Math.floor(100 / newPaths)
    const remainingWeight = 100 - (newWeight * (newPaths - 1))

    setFormData({
      ...formData,
      paths: newPaths,
      weights: [...formData.weights.slice(0, -1), newWeight, remainingWeight],
      descriptions: [...formData.descriptions, `Path ${String.fromCharCode(65 + newPaths - 1)}`]
    })
  }

  const removePathAt = (index: number) => {
    if (formData.paths <= 2) return
    const newPaths = formData.paths - 1
    const newWeights = formData.weights.filter((_, i) => i !== index)
    const newDescriptions = formData.descriptions.filter((_, i) => i !== index)
    const totalWeight = newWeights.reduce((sum, w) => sum + w, 0)
    const normalizedWeights = newWeights.map(w => Math.round((w / totalWeight) * 100))
    setFormData({
      ...formData,
      paths: newPaths,
      weights: normalizedWeights,
      descriptions: newDescriptions
    })
  }

  const updateWeight = (index: number, value: number) => {
    const newWeights = [...formData.weights]
    newWeights[index] = value

    // Ensure weights sum to 100
    const total = newWeights.reduce((sum, w) => sum + w, 0)
    if (total !== 100) {
      const diff = 100 - total
      const otherIndices = newWeights.map((_, i) => i).filter(i => i !== index)
      const adjustment = Math.floor(diff / otherIndices.length)
      otherIndices.forEach(i => {
        newWeights[i] = Math.max(0, newWeights[i] + adjustment)
      })
      // Distribute remainder so the total is exactly 100
      const remainder = 100 - newWeights.reduce((s, w) => s + w, 0)
      if (remainder !== 0 && otherIndices.length > 0) {
        // add remainder to the path with the largest weight (or first) to keep balance stable
        const targetIndex = otherIndices.sort((a, b) => newWeights[b] - newWeights[a])[0]
        newWeights[targetIndex] = Math.max(0, newWeights[targetIndex] + remainder)
      }
    }

    setFormData({ ...formData, weights: newWeights })
  }

  const updateDescription = (index: number, value: string) => {
    const newDescriptions = [...formData.descriptions]
    newDescriptions[index] = value
    setFormData({ ...formData, descriptions: newDescriptions })
  }

  // Auto-save when clicking outside the node while editing
  useEffect(() => {
    const onDocPointerDown = (e: Event) => {
      const target = e.target as HTMLElement
      if (isEditing && containerRef.current && !containerRef.current.contains(target)) {
        handleSave()
      }
    }
    document.addEventListener('pointerdown', onDocPointerDown, true)
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true)
  }, [isEditing, formData])

  // If this node loses selection while editing (e.g., clicking canvas or another node), auto-save and exit
  useEffect(() => {
    if (!selected && isEditing) {
      handleSave()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const getPathColor = (index: number) => {
    const colors = ['bg-gray-600', 'bg-gray-700', 'bg-gray-800', 'bg-gray-500', 'bg-gray-900']
    return colors[index % colors.length]
  }

  return (
    <div
      ref={containerRef}
      className={`relative bg-white rounded-3xl shadow-lg border-2 overflow-visible min-w-[410px] max-w-[470px] ${selected ? 'border-gray-900' : 'border-gray-200'}`}>
      <Handle
        type="target"
        position={Position.Left}
        className="w-8 h-8 bg-gray-600 border-4 border-white shadow-lg"
      />

      <div className={`p-6 pr-12`}>
        {/* Header with randomizer icon and heading */}
        <div className="mb-4 relative">
          <div className="flex items-center pr-8">
            <GitBranch className="w-5 h-5 text-gray-600 mr-3" />
            <h3 className="text-lg font-medium text-gray-900">{t('nodeDisplay.randomizer')}</h3>
          </div>
        </div>

        <div className="space-y-3">
          {formData.weights.map((weight, index) => (
            <div key={index} className="relative flex items-center gap-2">
              {/* Delete path */}
              <button
                onClick={(e) => { e.stopPropagation(); removePathAt(index) }}
                disabled={formData.paths <= 2}
                className="p-1 text-red-600 hover:bg-red-50 rounded disabled:opacity-40"
                title="Delete path"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              {/* Dark pill with percentage that switches to input on click */}
              <div className="relative flex-1 h-8 bg-gray-900 rounded-full flex items-center justify-center select-none">
                {editingIndex === index ? (
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={inlineValue}
                    autoFocus
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '')
                      setInlineValue(raw.slice(0, 3))
                    }}
                    onBlur={() => {
                      const n = parseInt(inlineValue || '0', 10)
                      const val = Math.max(0, Math.min(100, isNaN(n) ? 0 : n))
                      updateWeight(index, val)
                      setEditingIndex(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const n = parseInt(inlineValue || '0', 10)
                        const val = Math.max(0, Math.min(100, isNaN(n) ? 0 : n))
                        updateWeight(index, val)
                        setEditingIndex(null)
                      } else if (e.key === 'Escape') {
                        setEditingIndex(null)
                      }
                    }}
                    className="w-12 text-center text-sm font-semibold bg-transparent text-white outline-none border-none focus:outline-none focus:ring-0 appearance-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setEditingIndex(index); setInlineValue(String(weight)) }}
                    className="text-white text-xs font-semibold"
                    title="Edit percentage"
                  >
                    {weight}%
                  </button>
                )}
              </div>

              {/* Path label + handle aligned at the card edge */}
              <div className="absolute top-1/2 -translate-y-1/2 flex items-center gap-2 pr-1" style={{ right: -12 }}>
                <span className="text-xs font-medium text-blue-400">
                  {formData.descriptions[index]}
                </span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`path-${index}`}
                  style={{ position: 'relative', transform: 'none', right: 0, top: 0, zIndex: 2 }}
                  className={`w-5 h-5 rounded-full border-4 border-white shadow-lg ${getPathColor(index)}`}
                />
                {!pathEdges.some(e => e.sourceHandle === `path-${index}`) && (
                  <div
                    className="pointer-events-none text-[10px] text-gray-500 whitespace-nowrap"
                    style={{ position: 'absolute', right: -60, top: '50%', transform: 'translateY(-50%)' }}
                  >
                    {t('nodeDisplay.nextStep')}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* ADD button */}
          <button
            onClick={(e) => { e.stopPropagation(); addPath() }}
            disabled={formData.paths >= 5}
            className="w-full border-2 border-dashed border-gray-400 rounded-lg py-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            ADD
          </button>

          {/* Total row */}
          <div className="text-xs text-gray-500 flex items-center justify-between">
            <span>Total</span>
            <span className={`font-medium ${formData.weights.reduce((s: number, w: number) => s + w, 0) === 100 ? 'text-gray-700' : 'text-red-600'}`}>
              {formData.weights.reduce((sum: number, w: number) => sum + w, 0)}%
            </span>
          </div>
        </div>
      </div>

      {/* Handles are now inline in each row next to the path label */}
    </div>
  )
}

export default memo(RandomizerNode)
