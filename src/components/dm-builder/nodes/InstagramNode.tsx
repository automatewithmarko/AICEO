import { memo, useState, useEffect, useCallback, useRef } from 'react'
import { Handle, Position, useNodeId, useStore } from '@xyflow/react'
import { MessageSquare, Image, Link, Volume2, Video, Play, Pause } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useTranslation } from '../i18n'
import IntegrationLogo from '../icons/IntegrationLogo'

interface InstagramNodeData {
  messageType?: 'text' | 'image' | 'video' | 'link' | 'voice'
  content?: string
  mediaUrl?: string
  linkUrl?: string
  linkTitle?: string
  voiceId?: string
  voiceName?: string
  voiceProvider?: 'elevenlabs' | 'minimax' | 'inworld' | 'upload'
  uploadedAudioUrl?: string
  buttons?: Array<{
    id: string
    title: string
    type: 'link'
    url?: string
    isDraft?: boolean
  }>
  showAnalytics?: boolean
  collectResponse?: boolean
  responseType?: 'email' | 'phone' | 'fullName' | 'companyName'
  responseTimeout?: number
  responseTimeoutUnit?: 'minutes' | 'hours'
}

function InstagramNode({ data, selected }: any) {
  const { t } = useTranslation('automation')
  const nodeId = useNodeId()
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Inline editing state (message text + button label/url). Persistence
  // follows SmartDelayNode's pattern: mutate the node's data object in place
  // as the user types; closing the editor is just a UI state change.
  const [, setBump] = useState(0)
  const bump = () => setBump((v) => v + 1)
  const [editingMessage, setEditingMessage] = useState(false)
  const [editingButtonId, setEditingButtonId] = useState<string | null>(null)
  const messageEditRef = useRef<HTMLDivElement | null>(null)
  const buttonEditRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  // Focus + size the textarea when the message editor opens
  useEffect(() => {
    if (editingMessage && textareaRef.current) {
      const el = textareaRef.current
      el.focus()
      const len = el.value.length
      el.setSelectionRange(len, len)
      autoGrow(el)
    }
  }, [editingMessage])

  // Auto-close (data is already saved write-through) on outside pointerdown,
  // capture phase for reliability — same convention as SmartDelayNode.
  useEffect(() => {
    const onDocPointerDown = (e: Event) => {
      const target = e.target as HTMLElement
      if (editingMessage && messageEditRef.current && !messageEditRef.current.contains(target)) {
        setEditingMessage(false)
      }
      if (editingButtonId && buttonEditRef.current && !buttonEditRef.current.contains(target)) {
        setEditingButtonId(null)
      }
    }
    document.addEventListener('pointerdown', onDocPointerDown, true)
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true)
  }, [editingMessage, editingButtonId])

  // If node loses selection while editing, exit edit mode (edits already saved)
  useEffect(() => {
    if (!selected) {
      setEditingMessage(false)
      setEditingButtonId(null)
    }
  }, [selected])

  const stopEditorEvents = {
    onPointerDown: (e: any) => e.stopPropagation(),
    onMouseDown: (e: any) => e.stopPropagation(),
    onClick: (e: any) => e.stopPropagation(),
    onKeyDown: (e: any) => e.stopPropagation(),
  }

  // Check if main handle has an edge connected
  const hasMainEdge = useStore((s: any) =>
    nodeId ? s.edges.some((e: any) => e.source === nodeId && (e.sourceHandle === 'default' || e.sourceHandle === null || e.sourceHandle === '')) : false
  )

  // Check which button handles have edges
  const buttonEdges = useStore((s: any) =>
    nodeId ? s.edges.filter((e: any) => e.source === nodeId && e.sourceHandle?.startsWith('button-')) : []
  )

  // Check response collection handles
  const hasResponseReceivedEdge = useStore((s: any) =>
    nodeId ? s.edges.some((e: any) => e.source === nodeId && e.sourceHandle === 'response-received') : false
  )
  const hasTimeoutEdge = useStore((s: any) =>
    nodeId ? s.edges.some((e: any) => e.source === nodeId && e.sourceHandle === 'timeout') : false
  )

  const hasTelegramTrigger = useStore((s: any) => {
    // reactflow v11 exposed nodeInternals; @xyflow/react v12 exposes nodeLookup
    const lookup = s.nodeLookup || s.nodeInternals
    if (!lookup || typeof lookup.values !== 'function') return false

    let triggerNode: any | undefined
    for (const node of lookup.values()) {
      if (node.type === 'trigger') {
        triggerNode = node
        break
      }
    }

    if (!triggerNode) return false

    const conditions = triggerNode.data?.triggerConditions
    if (Array.isArray(conditions)) {
      const hasNewStyle = conditions.some((tc: any) => tc?.type === 'telegram_message')
      if (hasNewStyle) return true
    }

    // Legacy support: single triggerType on trigger node
    return triggerNode.data?.triggerType === 'telegram_message'
  })

  const automationId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('id')
    : null

  // Stats state
  const [stats, setStats] = useState({
    sent: 0,
    clicked: 0,
    buttonBreakdown: [] as Array<{ buttonId?: string; title: string; count: number; type: 'url' | 'postback' }>
  })
  const [statsLoading, setStatsLoading] = useState(false)
  const [hoveredClickStat, setHoveredClickStat] = useState(false)
  const clickStatRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Map button IDs to titles from node data
  const buttonTitleMap = new Map<string, string>()
  if (data.buttons) {
    data.buttons.forEach((button: any) => {
      if (button.id && button.title) {
        buttonTitleMap.set(button.id, button.title)
      }
    })
  }

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
      if (response.ok) {
        const data = await response.json()
        setStats({
          sent: data.sent || 0,
          clicked: data.clicked || 0,
          buttonBreakdown: data.buttonBreakdown || []
        })
      }
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.error('Error fetching node stats:', error)
      }
    } finally {
      clearTimeout(timeout)
      setStatsLoading(false)
    }
  }, [automationId, nodeId])

  // Fetch stats when analytics view is enabled
  useEffect(() => {
    if (data.showAnalytics && automationId && nodeId) {
      fetchStats()
    } else {
      // Abort in-flight request and reset stats when analytics is disabled
      abortRef.current?.abort()
      setStats({ sent: 0, clicked: 0, buttonBreakdown: [] })
    }
  }, [data.showAnalytics, automationId, nodeId, fetchStats])

  const messageTypes = [
    { value: 'text', label: 'Text Message', icon: MessageSquare },
    { value: 'image', label: 'Image', icon: Image },
    { value: 'video', label: 'Video', icon: Video },
    { value: 'link', label: 'Link', icon: Link },
    { value: 'voice', label: 'Voice Message', icon: Volume2 }
  ]

  // Selected type metadata and icon
  const currentType = messageTypes.find(mt => mt.value === data.messageType) || messageTypes[0]

  // The message text editor only applies to plain text messages (the branch
  // that renders data.content).
  const isTextMessage = !data.messageType || data.messageType === 'text'

  const getPreviewContent = () => {
    switch (data.messageType) {
      case 'image':
        return data.mediaUrl ? '🖼️ Image message' : t('nodeDisplay.noImageSelected')
      case 'video':
        return data.mediaUrl ? '🎥 Video message' : t('nodeDisplay.noVideoSelected')
      case 'link':
        return data.linkUrl ? `🔗 ${data.linkTitle || data.linkUrl}` : 'No link provided'
      case 'voice':
        // For upload/record mode, show different message
        if (data.voiceProvider === 'upload') {
          return data.uploadedAudioUrl ? t('nodeDisplay.audioReady') : t('nodeDisplay.uploadRecordAudio')
        }
        // For AI-generated voice, show the text-to-speech content
        return (data.content && data.content.trim().length > 0)
          ? data.content
          : t('nodeDisplay.enterTextToSpeak')
      default:
        return data.content || t('nodeDisplay.enterYourMessage')
    }
  }

  return (
    <div className="relative w-[280px]">
      {hasTelegramTrigger && (
        <div className="absolute top-0 left-0 w-full -translate-y-[80%] rounded-t-3xl bg-red-500 bg-opacity-60 border border-red-600 px-3 pt-2 pb-9 text-[13px] leading-snug text-[#7f1d1d] shadow-sm pointer-events-none text-center z-0">
          {t('nodeDisplay.telegramWarning')}
        </div>
      )}
      <div className={`relative z-10 bg-white rounded-3xl shadow-lg border-2 w-full transition-colors ${
        selected ? 'border-gray-900' : 'border-gray-200 hover:border-gray-900'
      }`}>
        <Handle
          type="target"
          position={Position.Left}
          className="w-8 h-8 bg-gray-600 border-4 border-white shadow-lg"
        />

        <div className="px-4 py-3">
        {/* Header with message icon and heading */}
        <div className="flex items-center mb-2 min-w-0">
          {currentType.value === 'voice' ? (
            data.voiceProvider === 'upload' ? (
              <Volume2 className="w-5 h-5 mr-3 text-gray-600" />
            ) : data.voiceProvider === 'minimax' ? (
              <IntegrationLogo name="minimax" className="w-5 h-5 mr-3" />
            ) : data.voiceProvider === 'inworld' ? (
              <IntegrationLogo name="inworld" className="w-5 h-5 mr-3" />
            ) : (
              <IntegrationLogo name="elevenlabs" className="w-5 h-5 mr-3" />
            )
          ) : (
            <img src="/Instagram_icon.png" alt="Instagram" width={20} height={20} className="w-5 h-5 mr-3" />
          )}
          <h3 className="text-lg font-medium text-gray-900 break-words flex-1 min-w-0">{t('nodeDisplay.sendMessage')}</h3>
        </div>

        {/* Analytics Stats Section */}
        {data.showAnalytics && (
          <div className="mb-3 bg-gray-50 rounded-2xl border border-gray-200 p-4">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* Sent */}
              <div className="text-center">
                {statsLoading ? (
                  <div className="text-2xl font-bold text-gray-400 mb-1">...</div>
                ) : (
                  <div className="text-2xl font-bold text-blue-600 mb-1">
                    {stats.sent.toLocaleString()}
                  </div>
                )}
                <div className="text-xs text-gray-500">{t('nodeDisplay.sent')}</div>
              </div>

              {/* Clicked */}
              <div
                ref={clickStatRef}
                className="text-center relative cursor-help"
                onMouseEnter={() => setHoveredClickStat(true)}
                onMouseLeave={() => setHoveredClickStat(false)}
              >
                {statsLoading ? (
                  <div className="text-2xl font-bold text-gray-400 mb-1">...</div>
                ) : (
                  <div className="text-2xl font-bold text-blue-600 mb-1">
                    {stats.clicked.toLocaleString()}
                  </div>
                )}
                <div className="text-xs text-gray-500">{t('nodeDisplay.clicked')}</div>

                {/* Hover Tooltip */}
                {hoveredClickStat && stats.buttonBreakdown.length > 0 && typeof document !== 'undefined' && createPortal(
                  <div
                    ref={tooltipRef}
                    className="fixed z-[9999] pointer-events-none"
                    style={{
                      position: 'fixed',
                      left: clickStatRef.current
                        ? clickStatRef.current.getBoundingClientRect().left + clickStatRef.current.offsetWidth / 2
                        : 0,
                      top: clickStatRef.current
                        ? clickStatRef.current.getBoundingClientRect().bottom + 8
                        : 0,
                      transform: 'translateX(-50%)',
                    }}
                  >
                    <div className="bg-gray-900 border border-gray-800 rounded-lg shadow-lg p-3 min-w-[200px]">
                      <div className="text-xs font-semibold text-white mb-2">{t('nodeDisplay.buttonClicks')}</div>
                      <div className="space-y-1.5">
                        {stats.buttonBreakdown.map((button, idx) => {
                          // Prioritize button title from node data (most accurate)
                          // Fallback to API title if node data not available
                          let displayTitle = button.title
                          if (button.buttonId && buttonTitleMap.has(button.buttonId)) {
                            displayTitle = buttonTitleMap.get(button.buttonId)!
                          } else if (button.title.startsWith('Button ')) {
                            // If API title is generic like "Button btn-...", try to find actual title
                            // by matching button ID from node data
                            const matchingButton = data.buttons?.find((b: any) => b.id === button.buttonId)
                            if (matchingButton?.title) {
                              displayTitle = matchingButton.title
                            }
                          }

                          return (
                            <div key={idx} className="flex items-center justify-between text-xs">
                              <span className="text-white truncate max-w-[150px]" title={displayTitle}>
                                {displayTitle}
                              </span>
                              <span className="text-white font-semibold ml-2">
                                {button.count}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>,
                  document.body
                )}
              </div>
            </div>
          </div>
        )}

        {/* Preview area */}
        {data.messageType === 'voice' ? (
          <>
            <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm font-normal text-black break-words overflow-hidden">
              {data.voiceProvider === 'upload' && data.uploadedAudioUrl ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (audioRef.current) {
                        if (isAudioPlaying) {
                          audioRef.current.pause()
                          setIsAudioPlaying(false)
                        } else {
                          audioRef.current.play()
                          setIsAudioPlaying(true)
                        }
                      }
                    }}
                    className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-900 hover:bg-gray-800 text-white transition-colors"
                  >
                    {isAudioPlaying ? (
                      <Pause className="w-3 h-3" />
                    ) : (
                      <Play className="w-3 h-3 ml-0.5" />
                    )}
                  </button>
                  <span className="flex-1">{t('nodeDisplay.uploadRecordAudio')}</span>
                  <audio
                    ref={audioRef}
                    src={data.uploadedAudioUrl}
                    onEnded={() => setIsAudioPlaying(false)}
                    onPause={() => setIsAudioPlaying(false)}
                    className="hidden"
                  />
                </div>
              ) : (
                getPreviewContent()
              )}
            </div>
            <div className="mt-3 flex items-center gap-2">
              {data.voiceProvider === 'upload' ? (
                <>
                  <Volume2 className="w-4 h-4 text-gray-600" />
                  <span className="text-xs font-medium text-gray-800">
                    {data.uploadedAudioUrl ? t('nodeDisplay.audioUploaded') : t('nodeDisplay.uploadRecord')}
                  </span>
                </>
              ) : data.voiceProvider === 'minimax' ? (
                <>
                  <IntegrationLogo name="minimax" className="w-4 h-4" />
                  <span className="text-xs font-medium text-gray-800">{data.voiceName || t('nodeDisplay.noVoiceSelected')}</span>
                </>
              ) : data.voiceProvider === 'inworld' ? (
                <>
                  <IntegrationLogo name="inworld" className="w-4 h-4" />
                  <span className="text-xs font-medium text-gray-800">{data.voiceName || t('nodeDisplay.noVoiceSelected')}</span>
                </>
              ) : (
                <>
                  <IntegrationLogo name="elevenlabs" className="w-4 h-4" />
                  <span className="text-xs font-medium text-gray-800">{data.voiceName || t('nodeDisplay.noVoiceSelected')}</span>
                </>
              )}
            </div>
          </>
        ) : data.messageType === 'image' ? (
          <div className="flex items-center justify-center">
            {data.mediaUrl ? (
              <div className="w-full h-[260px] rounded-lg overflow-hidden bg-gray-50">
                <img src={data.mediaUrl} alt="Image preview" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-full h-[140px] rounded-lg bg-gray-50 text-gray-600 flex items-center justify-center text-sm">
                {t('nodeDisplay.noImageSelected')}
              </div>
            )}
          </div>
        ) : data.messageType === 'video' ? (
          <div className="flex items-center justify-center">
            {data.mediaUrl ? (
              <div className="w-full h-[260px] rounded-lg overflow-hidden bg-gray-50">
                <video
                  className="w-full h-full object-cover"
                  src={data.mediaUrl}
                  muted
                  playsInline
                  controls
                  preload="metadata"
                />
              </div>
            ) : (
              <div className="w-full h-[140px] rounded-lg bg-gray-50 text-gray-600 flex items-center justify-center text-sm">
                {t('nodeDisplay.noVideoSelected')}
              </div>
            )}
          </div>
        ) : editingMessage && isTextMessage ? (
          <div ref={messageEditRef}>
            <textarea
              ref={textareaRef}
              value={data.content || ''}
              onChange={(e) => {
                data.content = e.target.value
                bump()
                autoGrow(e.target)
              }}
              placeholder={t('nodeDisplay.enterYourMessage')}
              rows={2}
              {...stopEditorEvents}
              className="nodrag nopan w-full bg-gray-50 rounded-lg px-3 py-2 text-xs font-normal text-black resize-none overflow-hidden border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        ) : (
          <div
            className={`bg-gray-50 rounded-lg px-3 py-2 text-xs font-normal text-black break-words max-h-20 overflow-y-auto overflow-x-hidden${selected && isTextMessage ? ' cursor-text' : ''}`}
            onClick={(e) => {
              if (selected && isTextMessage) {
                e.stopPropagation()
                setEditingMessage(true)
              }
            }}
          >
            {getPreviewContent()}
          </div>
        )}

        {/* Buttons area (visual preview card style) - only for text messages */}
        {data.messageType === 'text' && data.buttons && data.buttons.length > 0 && (
          <div className="mt-4 space-y-2">
            {data.buttons.map((button: any) => {
              const hasButtonEdge = buttonEdges.some((e: any) => e.sourceHandle === `button-${button.id}`)
              return (
                <div key={button.id} className="relative">
                  {editingButtonId === button.id ? (
                    <div ref={buttonEditRef} className="w-full space-y-1 rounded-xl border border-gray-300 bg-white p-2">
                      <input
                        type="text"
                        value={button.title || ''}
                        onChange={(e) => {
                          button.title = e.target.value
                          bump()
                        }}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          if (e.key === 'Enter') setEditingButtonId(null)
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Button label"
                        autoFocus
                        className="nodrag nopan w-full text-xs border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                      <input
                        type="text"
                        value={button.url || ''}
                        onChange={(e) => {
                          button.url = e.target.value
                          bump()
                        }}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          if (e.key === 'Enter') setEditingButtonId(null)
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="https://..."
                        className="nodrag nopan w-full text-xs border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                    </div>
                  ) : (
                    <button
                      className="w-full px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-semibold tracking-wide hover:bg-gray-800 truncate block"
                      type="button"
                      title={button.isDraft ? `${button.title} — needs configuration` : button.title}
                      onClick={(e) => {
                        if (selected) {
                          e.stopPropagation()
                          setEditingButtonId(button.id)
                        }
                      }}
                    >
                      {button.isDraft && (
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5 align-middle"
                          title="Configure later — finish setting up this button"
                        />
                      )}
                      {(button.title || '').toUpperCase()}
                    </button>
                  )}
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`button-${button.id}`}
                    style={{ position: 'absolute', right: -20, top: '50%', transform: 'translateY(-50%)' }}
                    className="w-4 h-4 rounded-full border-2 border-white shadow-md bg-blue-500"
                  />
                  {!hasButtonEdge && (
                    <div
                      className="pointer-events-none text-[10px] text-gray-500 whitespace-nowrap"
                      style={{ position: 'absolute', right: -70, top: '50%', transform: 'translateY(-50%)' }}
                    >
                      {t('nodeDisplay.nextStep')}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Collect Response Status Bar */}
        {data.collectResponse && data.responseType && (
          <div className="mt-3 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-xs font-medium text-blue-700">
                {t('nodeDisplay.collecting', { type: t(`nodeDisplay.${data.responseType}`) })}
              </span>
            </div>
          </div>
        )}
        </div>

        {/* Main generic right connector retained on every node */}
        {!data.collectResponse && (
          <>
            <Handle
              type="source"
              position={Position.Right}
              id="default"
              className="w-5 h-5 bg-gray-600 border-4 border-white shadow-lg rounded-full"
              style={{ top: '50%', right: -8, transform: 'translateY(-50%)', zIndex: 10 }}
            />
            {!hasMainEdge && (
              <div
                className="pointer-events-none text-[10px] text-gray-500 whitespace-nowrap"
                style={{ position: 'absolute', right: -60, top: '50%', transform: 'translateY(-50%)' }}
              >
                {t('nodeDisplay.nextStep')}
              </div>
            )}
          </>
        )}

        {/* Collect Response connectors */}
        {data.collectResponse && (
          <>
            {/* Next Step handle (top) */}
            <Handle
              type="source"
              position={Position.Right}
              id="default"
              className="w-5 h-5 bg-gray-600 border-4 border-white shadow-lg rounded-full"
              style={{ top: '30%', right: -8, transform: 'translateY(-50%)', zIndex: 10 }}
            />
            {!hasMainEdge && (
              <div
                className="pointer-events-none text-[10px] text-gray-500 whitespace-nowrap"
                style={{ position: 'absolute', right: -60, top: '30%', transform: 'translateY(-50%)' }}
              >
                {t('nodeDisplay.nextStep')}
              </div>
            )}

            {/* Response Received handle (bottom - second from bottom) */}
            <Handle
              type="source"
              position={Position.Right}
              id="response-received"
              className="w-5 h-5 bg-green-500 border-4 border-white shadow-lg rounded-full"
              style={{ top:'auto',bottom: 40, right: -8, transform: 'translateY(50%)', zIndex: 10 }}
            />
            {!hasResponseReceivedEdge && (
              <div
                className="pointer-events-none text-[10px] text-gray-500 whitespace-nowrap"
                style={{ position: 'absolute', right: -105, bottom: 40, transform: 'translateY(50%)' }}
              >
                {t('nodeDisplay.responseReceived')}
              </div>
            )}

            {/* Timeout handle (bottom) */}
            <Handle
              type="source"
              position={Position.Right}
              id="timeout"
              className="w-5 h-5 bg-orange-500 border-4 border-white shadow-lg rounded-full"
              style={{ top:'auto',bottom: 20, right: -8, transform: 'translateY(50%)', zIndex: 10 }}
            />
            {!hasTimeoutEdge && (
              <div
                className="pointer-events-none text-[10px] text-gray-500 whitespace-nowrap"
                style={{ position: 'absolute', right: -60, bottom: 20, transform: 'translateY(50%)' }}
              >
                {t('nodeDisplay.timeout')}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default memo(InstagramNode)
