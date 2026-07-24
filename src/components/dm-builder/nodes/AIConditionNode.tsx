import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Handle, Position, useNodeId, useStore } from '@xyflow/react'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from '../i18n'
import BooSendIcon from '../icons/BooSendIcon'

interface AIConditionPath {
  id: string
  label?: string
  prompt: string
}

export interface AIConditionNodeData {
  label?: string
  description?: string
  contextScope?: 'full_conversation' | 'last_message'
  paths?: AIConditionPath[]
}

function AIConditionNode({ data, selected }: any) {
  const { t } = useTranslation('automation')
  const nodeId = useNodeId()
  const containerRef = useRef<HTMLDivElement | null>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState<AIConditionNodeData>(() => {
    const existingPaths = Array.isArray(data.paths) && data.paths.length > 0
      ? data.paths
      : [{
          id: 'path-1',
          prompt: '',
        }]
    return {
      label: data.label || t('nodeDisplay.aiCondition'),
      description: data.description || t('nodeDisplay.useAIToRoute'),
      contextScope: data.contextScope || 'full_conversation',
      paths: existingPaths,
    }
  })

  // Track which handles have connections for hint labels
  const connectedHandles = useStore((s) => {
    if (!nodeId) return new Set<string>()
    const set = new Set<string>()
    for (const e of s.edges) {
      if (e.source === nodeId && e.sourceHandle) {
        set.add(e.sourceHandle)
      }
    }
    return set
  })

  const paths = useMemo(() => formData.paths || [], [formData.paths])

  const handleSave = () => {
    Object.assign(data, {
      ...data,
      ...formData,
      paths: paths,
    })
    setIsEditing(false)
  }

  // Auto-save when node loses selection
  useEffect(() => {
    if (!selected && isEditing) {
      handleSave()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  // Auto-save when clicking outside
  useEffect(() => {
    const onDocPointerDown = (e: Event) => {
      const t = e.target as HTMLElement
      if (isEditing && containerRef.current && !containerRef.current.contains(t)) {
        handleSave()
      }
    }
    document.addEventListener('pointerdown', onDocPointerDown, true)
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, formData])

  const pathCount = paths.length
  // Keep the closed node as tight as possible while still fitting header + description
  const baseCollapsedHeight = 96
  const extraPaths = Math.max(0, pathCount - 1)
  const perPathHeight = 20
  const collapsedMinHeight = !isEditing
    ? baseCollapsedHeight + extraPaths * perPathHeight
    : undefined

  return (
    <div
      ref={containerRef}
      onClick={(e) => {
        const t = e.target as HTMLElement
        if (t.closest('.react-flow__handle')) return
        if (!isEditing) setIsEditing(true)
      }}
      className={`relative rounded-3xl shadow-lg border-2 overflow-visible bg-black text-white ${
        isEditing ? 'min-w-[520px]' : 'min-w-[380px]'
      } ${selected ? 'border-white' : 'border-gray-800'}`}
      style={collapsedMinHeight ? { minHeight: collapsedMinHeight } : undefined}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-8 h-8 bg-gray-600 border-4 border-white shadow-lg"
      />

      <div className="p-6 pr-20">
        {/* Header with inline toggle */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <BooSendIcon className="w-10 h-10 mr-3 flex-shrink-0" />
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-medium leading-none">{t('nodeDisplay.aiCondition')}</h3>
              <span className="text-[11px] font-medium text-white/90 bg-white/10 px-2 py-0.5 rounded-md border border-white/20">
                {paths.length} {paths.length === 1 ? t('nodeDisplay.path', { number: '' }).trim() : t('nodeDisplay.paths')}
              </span>
            </div>
          </div>
          {isEditing && (
            <div className="flex items-center gap-1 text-[11px] text-white/70">
              <span className={formData.contextScope === 'full_conversation' ? 'font-semibold text-white' : ''}>
                {t('nodeDisplay.fullConversation')}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setFormData({
                    ...formData,
                    contextScope:
                      formData.contextScope === 'full_conversation'
                        ? 'last_message'
                        : 'full_conversation',
                  })
                }}
                className="relative inline-flex items-center w-9 h-4 rounded-full bg-white/20 border border-white/30 px-[2px]"
              >
                <div
                  className={`w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${
                    formData.contextScope === 'full_conversation'
                      ? 'translate-x-0'
                      : 'translate-x-4'
                  }`}
                />
              </button>
              <span className={formData.contextScope === 'last_message' ? 'font-semibold text-white' : ''}>
                {t('nodeDisplay.lastMessage')}
              </span>
            </div>
          )}
        </div>

        {/* Body */}
        {isEditing ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/5">
              <div className="divide-y divide-white/10">
                {paths.map((p, idx) => (
                  <div key={p.id} className="px-3 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-white/70">
                        {t('nodeDisplay.pathLabel', { number: idx + 1 })}
                      </div>
                      {paths.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            const next = paths.filter((x) => x.id !== p.id)
                            setFormData({ ...formData, paths: next })
                          }}
                          className="p-1.5 rounded-md border border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                          title={t('nodeDisplay.removePath')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <textarea
                        value={p.prompt}
                        onChange={(e) => {
                          const next = paths.map((x) =>
                            x.id === p.id ? { ...x, prompt: e.target.value } : x
                          )
                          setFormData({ ...formData, paths: next })
                        }}
                        placeholder={t('nodeDisplay.pathPromptPlaceholder')}
                        className="w-full text-sm bg-white/5 text-white placeholder-white/50 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-white/20 min-h-[60px]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  const nextIndex = paths.length + 1
                  const newPath: AIConditionPath = {
                    id: `path-${Date.now()}-${nextIndex}`,
                    prompt: '',
                  }
                  setFormData({ ...formData, paths: [...paths, newPath] })
                }}
                className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md border border-white/30 text-white hover:bg-white/10"
              >
                <Plus className="w-4 h-4" /> {t('nodeDisplay.addPath')}
              </button>
            </div>

            <p className="text-xs text-white/70">
              {t('nodeDisplay.pathsNote')}
            </p>
          </div>
        ) : (
          <div className="mt-1">
            <p className="text-sm text-white/80">
              {formData.description}
            </p>
          </div>
        )}
      </div>

      {/* Right-side handles: one per path, aligned and half outside border */}
      {paths.length > 0 && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col items-end space-y-3 pr-0">
          {paths.map((p) => {
            const hasEdge = connectedHandles.has(p.id)
            return (
              <div key={p.id} className="flex items-center gap-2 relative">
                <Handle
                  type="source"
                  position={Position.Right}
                  id={p.id}
                  className="w-6 h-6 rounded-full border-4 border-white shadow-lg bg-gray-600"
                  style={{ position: 'relative', transform: 'none', right: -8, top: 0 }}
                />
                {!hasEdge && (
                  <div
                    className="pointer-events-none text-[10px] text-gray-500 whitespace-nowrap"
                    style={{ position: 'absolute', right: -60, top: '50%', transform: 'translateY(-50%)' }}
                  >
                    {t('nodeDisplay.nextStep')}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default memo(AIConditionNode)
