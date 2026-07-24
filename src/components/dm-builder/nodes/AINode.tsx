import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Handle, Position, useNodeId, useStore } from '@xyflow/react'
import { useTranslation } from '../i18n'
import BooSendIcon from '../icons/BooSendIcon'

interface AINodeData {
  goals?: Array<{
    id: string
    task: string
  }>
  systemPrompt?: string
  knowledgeBaseId?: string
  customKnowledgeBase?: string
  model?: 'gemini-2.0-flash-exp' | 'gemini-1.5-pro' | 'gemini-1.5-flash'
  temperature?: number
  maxTokens?: number
  telegram_bot_id?: string
  showAnalytics?: boolean
}

function AINode({ data, selected }: any) {
  const { t } = useTranslation('automation')
  const nodeId = useNodeId()
  const selectedAITab = (data as any)?.selectedAITab
  const isAdvancedAgent = selectedAITab === 'advanced'

  // Inline editing (only visible while the node is selected; unselected
  // rendering is identical to the original). Persistence follows
  // SmartDelayNode's pattern: mutate the node's data object in place.
  const [, setBump] = useState(0)
  const bump = () => setBump((v) => v + 1)
  const [editingPrompt, setEditingPrompt] = useState(false)
  const promptEditRef = useRef<HTMLDivElement | null>(null)
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null)

  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  useEffect(() => {
    if (editingPrompt && promptTextareaRef.current) {
      const el = promptTextareaRef.current
      el.focus()
      const len = el.value.length
      el.setSelectionRange(len, len)
      autoGrow(el)
    }
  }, [editingPrompt])

  // Close the prompt editor on outside pointerdown (capture phase for
  // reliability); edits are saved write-through so closing loses nothing.
  useEffect(() => {
    if (!editingPrompt) return
    const onDocPointerDown = (e: Event) => {
      const target = e.target as HTMLElement
      if (promptEditRef.current && !promptEditRef.current.contains(target)) {
        setEditingPrompt(false)
      }
    }
    document.addEventListener('pointerdown', onDocPointerDown, true)
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true)
  }, [editingPrompt])

  // Exit edit mode when the node loses selection
  useEffect(() => {
    if (!selected) setEditingPrompt(false)
  }, [selected])

  // Check if main handle has an edge connected
  const hasMainEdge = useStore((s: any) =>
    nodeId ? s.edges.some((e: any) => e.source === nodeId && (e.sourceHandle == null || e.sourceHandle === '')) : false
  )

  // Check if tools handle has an edge connected (only relevant for basic agent)
  const hasToolsEdge = useStore((s: any) =>
    nodeId ? s.edges.some((e: any) => e.source === nodeId && e.sourceHandle === 'tools') : false
  )

  // Debug: Log when node renders to verify advancedAgentFlow is present
  if (typeof window !== 'undefined' && (data as any)?.advancedAgentFlow) {
    console.log('🎨 AINode rendering with advancedAgentFlow:', {
      flowNodes: (data as any).advancedAgentFlow?.nodes?.length,
      flowEdges: (data as any).advancedAgentFlow?.edges?.length
    })
  }

  const automationId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('id')
    : null
  const showAnalytics = Boolean((data as any)?.showAnalytics)

  const [statsLoading, setStatsLoading] = useState(false)
  const [linkStats, setLinkStats] = useState<{
    totalLinksSent: number
    uniqueLinksSent: number
    linkBreakdown: Array<{ url: string; count: number }>
    configuredLinks: Array<{ url: string; sentCount: number; configured: boolean }>
    truncated: boolean
  }>({
    totalLinksSent: 0,
    uniqueLinksSent: 0,
    linkBreakdown: [],
    configuredLinks: [],
    truncated: false
  })

  const abortRef = useRef<AbortController | null>(null)

  const fetchStats = useCallback(async () => {
    if (!automationId || !nodeId) return

    // Abort any in-flight request before starting a new one
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setStatsLoading(true)
    const timeout = setTimeout(() => controller.abort(), 15_000)
    try {
      const response = await fetch(
        `/api/automations/${automationId}/nodes/${nodeId}/stats`,
        { signal: controller.signal }
      )
      if (!response.ok) return
      const json = await response.json()

      setLinkStats({
        totalLinksSent: Number(json.totalLinksSent) || 0,
        uniqueLinksSent: Number(json.uniqueLinksSent) || 0,
        linkBreakdown: Array.isArray(json.linkBreakdown) ? json.linkBreakdown : [],
        configuredLinks: Array.isArray(json.configuredLinks) ? json.configuredLinks : [],
        truncated: Boolean(json.truncated)
      })
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.error('Error fetching AI node stats:', error)
      }
    } finally {
      clearTimeout(timeout)
      setStatsLoading(false)
    }
  }, [automationId, nodeId])

  useEffect(() => {
    if (showAnalytics && automationId && nodeId) {
      fetchStats()
    } else {
      // Abort in-flight request and reset stats when analytics is disabled
      abortRef.current?.abort()
      setLinkStats({ totalLinksSent: 0, uniqueLinksSent: 0, linkBreakdown: [], configuredLinks: [], truncated: false })
    }
  }, [showAnalytics, automationId, nodeId, fetchStats])

  const systemPrompt = typeof (data as any)?.systemPrompt === 'string' ? (data as any).systemPrompt : ''
  const goals = Array.isArray(data.goals) ? data.goals : []

  return (
    <div className={`relative rounded-3xl shadow-lg border-2 min-w-[280px] max-w-[350px] bg-black text-white ${
      selected ? 'border-white' : 'border-gray-800'
    }`}>
      {/* Platform Icon - Hidden, now determined by trigger */}

      <Handle
        type="target"
        position={Position.Left}
        className="w-8 h-8 bg-gray-600 border-4 border-white shadow-lg"
      />

      <div className="p-6 pr-20">
        {/* Header with BooSend logo and heading */}
        <div className="flex items-center mb-3">
          <BooSendIcon className="w-10 h-10 mr-3 flex-shrink-0" />
          <div className="flex flex-col">
            <h3 className="text-lg font-medium text-white leading-none">{t('nodeDisplay.aiAgent')}</h3>
            {/* Agent type + steps */}
            {(() => {
              const isN8n = (data as any)?.configType === 'n8n' || (data as any)?.selectedAITab === 'n8n'
              const isAdvanced = !isN8n && ((data as any)?.configType === 'advanced' || (data as any)?.selectedAITab === 'advanced')
              const basicStepsRaw = Array.isArray((data as any)?.goals) ? (data as any).goals : []
              const basicStepsFilled = basicStepsRaw.filter((g: any) => g && g.task && String(g.task).trim())
              const basicCount = basicStepsFilled.length > 0 ? basicStepsFilled.length : basicStepsRaw.length
              // Prefer embedded flow count, then lightweight summary count if present
              const advancedCount = (data as any)?.advancedAgentFlow?.nodes?.length || (data as any)?.advancedStepCount || 0
              const advancedUseSteps = (data as any)?.advancedUseSteps === true
              const advancedStepsCount = Array.isArray((data as any)?.advancedSteps) ? (data as any).advancedSteps.filter((s: any) => s && s.task && String(s.task).trim()).length : 0
              const stepCount = isAdvanced ? (advancedUseSteps ? advancedStepsCount : advancedCount) : basicCount
              return (
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs font-semibold text-green-400">
                    {isN8n ? 'n8n Agent' : isAdvanced ? t('nodeDisplay.advancedAgent') : t('nodeDisplay.basicAgent')}
                  </span>
                  {!isN8n && (
                    <span className="text-[11px] font-medium text-white/90 bg-white/10 px-2 py-0.5 rounded-md border border-white/20">
                      {t('nodeDisplay.steps', { count: stepCount || 0 })}
                    </span>
                  )}
                </div>
              )
            })()}
          </div>
        </div>

        {/* Analytics (Links Sent) */}
        {(data as any)?.showAnalytics && (
          <div className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-[11px] text-white/70">Unique links</div>
                <div className="text-xl font-semibold text-white">
                  {statsLoading ? '…' : linkStats.uniqueLinksSent}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[11px] text-white/70">Links sent</div>
                <div className="text-xl font-semibold text-white">
                  {statsLoading ? '…' : linkStats.totalLinksSent}
                </div>
              </div>
            </div>

            {!statsLoading && linkStats.configuredLinks.length > 0 && (
              <div
                className="mt-3 max-h-32 space-y-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-400/80 [&::-webkit-scrollbar-thumb]:rounded-full"
                style={{
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(148,163,184,0.9) transparent',
                }}
              >
                {linkStats.configuredLinks.map((item) => (
                  <div key={item.url} className="flex items-center justify-between gap-3 opacity-90">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-white/80 truncate hover:text-white"
                      title={item.url}
                    >
                      {item.url}
                    </a>
                    <div className="text-[11px] font-medium text-white/80 tabular-nums">
                      {item.sentCount}
                    </div>
                  </div>
                ))}
                {linkStats.truncated && (
                  <div className="text-[11px] text-white/50">
                    Showing stats from the most recent messages.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Optional metadata */}
        <div className="space-y-2">
          {data.knowledgeBaseId && data.knowledgeBaseId !== 'custom' && (
            <div className="text-xs text-gray-300 mt-1">
              KB: {data.knowledgeBaseId}
            </div>
          )}
          {data.customKnowledgeBase && (
            <div className="text-xs text-gray-300 mt-1">
              KB: {data.customKnowledgeBase}
            </div>
          )}
        </div>

        {/* Inline editing (visible only while selected — unselected display is
            unchanged from the original card) */}
        {selected && (
          <div className="mt-3 space-y-2">
            <div ref={promptEditRef}>
              <div className="text-[11px] font-medium text-white/60 mb-1">System prompt</div>
              {editingPrompt ? (
                <textarea
                  ref={promptTextareaRef}
                  value={systemPrompt}
                  onChange={(e) => {
                    ;(data as any).systemPrompt = e.target.value
                    bump()
                    autoGrow(e.target)
                  }}
                  placeholder="Describe how this agent should behave..."
                  rows={3}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="nodrag nopan w-full text-xs text-white bg-white/10 border border-white/20 rounded-md px-2 py-1.5 placeholder-white/40 resize-none overflow-hidden focus:outline-none focus:ring-2 focus:ring-white/40"
                />
              ) : (
                <div
                  className="nodrag text-xs text-gray-300 whitespace-pre-wrap break-words rounded-md border border-white/10 bg-white/5 px-2 py-1.5 max-h-24 overflow-y-auto cursor-text"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditingPrompt(true)
                  }}
                >
                  {systemPrompt.trim() ? systemPrompt : <span className="text-white/40">Add system prompt...</span>}
                </div>
              )}
            </div>

            {goals.length > 0 && (
              <div>
                <div className="text-[11px] font-medium text-white/60 mb-1">Steps</div>
                <div className="space-y-1">
                  {goals.map((goal: any, idx: number) => (
                    <input
                      key={goal?.id || idx}
                      type="text"
                      value={goal?.task || ''}
                      onChange={(e) => {
                        goal.task = e.target.value
                        bump()
                      }}
                      placeholder={`Step ${idx + 1}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      className="nodrag nopan w-full text-xs text-white bg-white/10 border border-white/20 rounded-md px-2 py-1 placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-white/40"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="w-5 h-5 bg-gray-600 border-4 border-white shadow-lg rounded-full"
        style={{ top: '50%', right: -8, transform: 'translateY(-50%)' }}
      />
      {!hasMainEdge && (
        <div
          className="pointer-events-none text-[10px] text-gray-500 whitespace-nowrap"
          style={{ position: 'absolute', right: -60, top: '50%', transform: 'translateY(-50%)' }}
        >
          {t('nodeDisplay.nextStep')}
        </div>
      )}

      {/* Bottom center handle for tool connections - hidden for n8n agent */}
      {!((data as any)?.configType === 'n8n' || (data as any)?.selectedAITab === 'n8n') && (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="tools"
            className="w-4 h-4 bg-blue-500 border-3 border-white shadow-lg rounded-full"
            style={{ bottom: -8, left: '50%', transform: 'translateX(-50%)' }}
            onClick={(e) => {
              // Tap-to-open the tools popup. Drag-from-handle still works as before
              // (drag fires on mousedown+move, this onClick fires on mouseup+no-move,
              // so the two paths don't conflict). Mainly to unblock mobile users.
              e.stopPropagation()
              const cb = (data as any)?.onToolsHandleClick
              if (typeof cb === 'function' && nodeId) {
                cb(nodeId)
              }
            }}
          />
          {!hasToolsEdge && (
            <div
              className="pointer-events-none text-[10px] text-gray-500"
              style={{ position: 'absolute', bottom: -26, left: '50%', transform: 'translateX(-50%)' }}
            >
              {t('nodeDisplay.tools')}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default memo(AINode)
