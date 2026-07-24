import { memo, useEffect, useRef, useState } from 'react'
import { Handle, Position, useNodeId, useStore } from '@xyflow/react'
import { Zap } from 'lucide-react'
import { useTranslation } from '../i18n'
import BooSendIcon from '../icons/BooSendIcon'

interface TriggerNodeData {
  triggerConditions?: Array<{
    id: string
    type: 'follow' | 'comment' | 'live_comment' | 'story_reply' | 'message' | 'automation_transfer' | 'whatsapp_message' | 'telegram_message' | 'web_chat'
    label: string
    description?: string
    keywords?: string[]
    // Additional keyword sources for other trigger types
    commentKeywords?: string[]
    storyReplyKeywords?: string[]
    liveCommentKeywords?: string[]
    bioKeywords?: string[] | string
    storyTarget?: 'all' | 'specific'
    selectedStoryId?: string
    stories?: Array<{ id: string; media_url: string; timestamp: string }>
    mediaTarget?: 'all' | 'specific'
    selectedMediaId?: string
    media?: Array<{ id: string; media_url: string; timestamp: string; media_type: string; caption?: string }>
    messageDetectionType?: 'keywords' | 'intent'
    selectedKnowledgeBase?: string
    intentDescription?: string
    // Comment actions (Reply/Delete) configuration
    replyToCommentEnabled?: boolean
    replyMode?: 'static' | 'ai'
    replyAIPrompt?: string
    replyCommentContent?: string
    replyCommentOptions?: string[]
    deleteCommentEnabled?: boolean
    deleteMode?: 'static' | 'ai'
    deleteKeywords?: string[]
    deleteAIPrompt?: string
    // WhatsApp specific fields
    whatsappDetectionType?: 'keywords' | 'intent'
    whatsappKeywords?: string[]
    whatsappPhoneNumber?: string
    whatsappIntentDescription?: string
    // Telegram specific fields
    telegramDetectionType?: 'keywords' | 'intent'
    telegramKeywords?: string[]
    telegramBotId?: string
    telegramIntentDescription?: string
    webSupportWidgetId?: string
  }>
  // Legacy support for existing data structure
  triggerType?: 'follow' | 'comment' | 'live_comment' | 'story_reply' | 'message' | 'automation_transfer' | 'whatsapp_message' | 'telegram_message' | 'web_chat'
  keywords?: string[]
  description?: string
  storyTarget?: 'all' | 'specific'
  selectedStoryId?: string
  stories?: Array<{ id: string; media_url: string; timestamp: string }>
  mediaTarget?: 'all' | 'specific'
  selectedMediaId?: string
  media?: Array<{ id: string; media_url: string; timestamp: string; media_type: string; caption?: string }>
  messageDetectionType?: 'keywords' | 'intent'
  selectedKnowledgeBase?: string
  intentDescription?: string
  // WhatsApp specific fields
  whatsappDetectionType?: 'keywords' | 'intent'
  whatsappKeywords?: string[]
  whatsappPhoneNumber?: string
  whatsappIntentDescription?: string
  // Telegram specific fields
  telegramDetectionType?: 'keywords' | 'intent'
  telegramKeywords?: string[]
  telegramBotId?: string
  telegramIntentDescription?: string
}

// Keyword chips that become editable while the node is selected.
// Unselected rendering is byte-identical to the original BooSend markup
// (first 3 chips + "+N more"). When editing, all chips render with a small ×
// remover plus an inline "+ add" input (Enter commits, auto-saves on outside
// pointerdown / deselect — same conventions as SmartDelayNode).
function KeywordChips({ list, editing, onCommit }: { list: string[]; editing: boolean; onCommit: (next: string[]) => void }) {
  const { t } = useTranslation('automation')
  const [draft, setDraft] = useState('')
  const wrapRef = useRef<HTMLDivElement | null>(null)

  const commitDraft = () => {
    const value = draft.trim()
    if (value) onCommit([...list, value])
    setDraft('')
  }

  // Auto-save pending draft when clicking outside (capture phase for reliability)
  useEffect(() => {
    if (!editing) return
    const onDocPointerDown = (e: Event) => {
      const target = e.target as HTMLElement
      if (wrapRef.current && !wrapRef.current.contains(target)) {
        commitDraft()
      }
    }
    document.addEventListener('pointerdown', onDocPointerDown, true)
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, draft, list])

  // If the node loses selection while a draft is pending, save it
  useEffect(() => {
    if (!editing && draft.trim()) {
      onCommit([...list, draft.trim()])
      setDraft('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  if (!editing) {
    return (
      <div className="flex flex-wrap gap-1">
        {list.slice(0, 3).map((keyword, idx) => (
          <span
            key={idx}
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
          >
            {keyword}
          </span>
        ))}
        {list.length > 3 && (
          <span className="text-xs text-gray-500">{t('nodeDisplay.more', { count: list.length - 3 })}</span>
        )}
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="flex flex-wrap items-center gap-1">
      {list.map((keyword, idx) => (
        <span
          key={idx}
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
        >
          {keyword}
          <button
            type="button"
            className="nodrag nopan ml-1 text-gray-400 hover:text-gray-700 leading-none"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onCommit(list.filter((_, i) => i !== idx))
            }}
            aria-label="Remove keyword"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') {
            e.preventDefault()
            commitDraft()
          }
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        placeholder="+ add"
        className="nodrag nopan w-16 text-xs border border-gray-300 rounded-full px-2 py-0.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
      />
    </div>
  )
}

function TriggerNode({ data, selected }: any) {
  const { t, i18n } = useTranslation('automation')
  const nodeId = useNodeId()
  const [, setBump] = useState(0)

  // Check if handle has an edge connected
  const hasMainEdge = useStore((s: any) =>
    nodeId ? s.edges.some((e: any) => e.source === nodeId) : false
  )

  function safeT(key: string, fallback: string) {
    const value = t(key)
    return value === key ? fallback : value
  }

  function getTriggerLabel(type: string) {
    const key = `nodeDisplay.triggerLabels.${type}`

    // If the translation exists, use it.
    // Note: i18next returns the key itself when missing (it does not throw),
    // so we must check existence explicitly.
    if ((i18n as any)?.exists?.(key)) return t(key)

    // Hard fallback map (matches production behavior).
    const fallbackLabels: Record<string, string> = {
      follow: 'User follows your account',
      comment: 'User comments on reel/post',
      live_comment: 'User comments on live video',
      story_reply: 'User replies to story',
      message: 'Message Received',
      automation_transfer: 'Executed through another automation',
      whatsapp_message: 'Message Received',
      telegram_message: 'Message Received',
      web_chat: 'Web Chat',
    }

    return fallbackLabels[type] ?? safeT('nodeDisplay.messageReceived', 'Message Received')
  }

  // Convert legacy data structure to new format for backward compatibility.
  // Also ensure we always show a sensible default trigger summary (Message Received)
  // even if the trigger has been "cleared" in the UI (empty conditions array).
  const triggerConditions =
    (data.triggerConditions && data.triggerConditions.length > 0
      ? data.triggerConditions
      : data.triggerType
        ? [
            {
              id: '1',
              type: data.triggerType,
              label: getTriggerLabel(data.triggerType),
              description: data.description,
              keywords: data.keywords,
              storyTarget: data.storyTarget,
              selectedStoryId: data.selectedStoryId,
              stories: data.stories,
              mediaTarget: data.mediaTarget,
              selectedMediaId: data.selectedMediaId,
              media: data.media,
              messageDetectionType: data.messageDetectionType,
              selectedKnowledgeBase: data.selectedKnowledgeBase,
            },
          ]
        : [
            {
              id: '1',
              type: 'message',
              label: getTriggerLabel('message'),
            },
          ]) as NonNullable<TriggerNodeData['triggerConditions']>

  // Persist keyword edits by mutating the node's data object in place
  // (same persistence pattern as SmartDelayNode's Object.assign(data, ...)).
  const commitKeywords = (condition: any, field: string, next: string[]) => {
    if (!Array.isArray(data.triggerConditions) || data.triggerConditions.length === 0) {
      // Legacy/default node: promote the synthesized conditions array onto data
      // so the edit survives (condition objects are shared by reference).
      data.triggerConditions = triggerConditions
    }
    condition[field] = next
    setBump((v) => v + 1)
  }

  const aiIntentCondition = triggerConditions.find((c) => c.type === 'message' && c.messageDetectionType === 'intent')
  const hasOnlyAIIntent = triggerConditions.length === 1 && !!aiIntentCondition

  // Black AI Recognition variant when only AI intent is selected
  if (hasOnlyAIIntent && aiIntentCondition) {
    return (
      <div
        data-onboarding-target="trigger-node"
        className={`relative rounded-3xl shadow-lg border-2 min-w-[320px] max-w-[380px] bg-black text-white ${
          selected ? 'border-white' : 'border-gray-800'
        }`}
      >
        <div className="p-6 pr-20">
          <div className="flex items-center mb-3">
            <BooSendIcon className="w-9 h-9 mr-3 flex-shrink-0" />
            <div className="flex flex-col">
              <h3 className="text-lg font-medium text-white leading-none">{t('nodeDisplay.aiRecognition')}</h3>
              <span className="text-[11px] text-white/70 mt-1">{t('nodeDisplay.messageReceived')}</span>
            </div>
          </div>

          <div className="mt-4">
            <div className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[12px] text-gray-100">
              AI set up
            </div>
            {aiIntentCondition.selectedKnowledgeBase && (
              <div className="mt-2 text-[11px] text-gray-300">
                KB: {aiIntentCondition.selectedKnowledgeBase.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
              </div>
            )}
          </div>
        </div>

        <div className="absolute right-0 top-1/2 transform -translate-y-1/2 flex items-center">
          <Handle
            type="source"
            position={Position.Right}
            className="w-8 h-8 bg-gray-600 border-4 border-white shadow-lg"
            style={{ position: 'relative', transform: 'none', right: 0, top: 0 }}
          />
          {!hasMainEdge && (
            <div
              className="pointer-events-none text-[10px] text-gray-500 whitespace-nowrap"
              style={{ position: 'absolute', right: -60, top: '50%', transform: 'translateY(-50%)' }}
            >
              {t('nodeDisplay.nextStep')}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      data-onboarding-target="trigger-node"
      className={`relative bg-white rounded-3xl shadow-lg border-2 min-w-[320px] max-w-[380px] ${
        selected ? 'border-blue-500' : 'border-gray-200'
      }`}
    >
      <div className="p-6 pr-20">
        {/* Header with bolt icon and "When..." */}
        <div className="flex items-center mb-4">
          <Zap className="w-5 h-5 text-gray-600 mr-3" />
          <h3 className="text-lg font-medium text-gray-900">{t('nodeDisplay.when')}</h3>
        </div>

        {/* Trigger Conditions */}
        <div className="space-y-3">
          {triggerConditions.length > 0 ? (
            triggerConditions.map((condition, index) => (
              <div key={condition.id || `${condition.type}-${index}`} className="flex items-start space-x-3">
                <div className="w-4 h-4 mt-0.5 flex-shrink-0 flex items-center justify-center">
                  {condition.type === 'whatsapp_message' ? (
                    <img src="/whatsapp.webp" alt="WhatsApp" width={16} height={16} className="w-4 h-4" />
                  ) : condition.type === 'telegram_message' ? (
                    <img src="/Telegram.png" alt="Telegram" width={16} height={16} className="w-4 h-4" />
                  ) : condition.type === 'web_chat' ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M2 12h20"/>
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-pink-500">
                      <rect x="2" y="2" width="20" height="20" rx="6" ry="6" stroke="currentColor" strokeWidth="2"/>
                      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/>
                      <path d="m18.5 5.5h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 mb-1">
                    {(() => {
                      const label = condition.label
                      // If label looks like a raw i18n key, replace with a friendly fallback.
                      if (
                        typeof label === 'string' &&
                        (label === `nodeDisplay.triggerLabels.${condition.type}` ||
                          label.startsWith('nodeDisplay.'))
                      ) {
                        return getTriggerLabel(condition.type)
                      }
                      return label || getTriggerLabel(condition.type)
                    })()}
                  </p>

                  {/* Message trigger details */}
                  {condition.type === 'message' && (
                    <div>
                      {condition.messageDetectionType === 'keywords' && ((condition.keywords && condition.keywords.length > 0) || selected) && (
                        <div>
                          <p className="text-xs text-gray-600 mb-1">{t('nodeDisplay.keywords')}</p>
                          <KeywordChips
                            list={condition.keywords || []}
                            editing={!!selected}
                            onCommit={(next) => commitKeywords(condition, 'keywords', next)}
                          />
                        </div>
                      )}

                      {condition.messageDetectionType === 'intent' && (
                        <div className="mt-1">
                          <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1">
                            <BooSendIcon className="w-4 h-4" />
                            <span className="text-[12px] font-semibold text-gray-800">AI set up</span>
                          </div>
                          {condition.selectedKnowledgeBase && (
                            <div className="mt-2 text-[11px] text-gray-500">
                              KB: {condition.selectedKnowledgeBase.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                            </div>
                          )}
                        </div>
                      )}

                      {!condition.messageDetectionType && (
                        <p className="text-xs text-gray-500">{t('nodeDisplay.anyMessage')}</p>
                      )}
                    </div>
                  )}

                  {/* WhatsApp message trigger details */}
                  {condition.type === 'whatsapp_message' && (
                    <div>
                      {condition.whatsappPhoneNumber && (
                        <p className="text-xs text-gray-600 mb-1">{t('nodeDisplay.phone')}: {condition.whatsappPhoneNumber}</p>
                      )}
                      {condition.whatsappDetectionType === 'keywords' && condition.whatsappKeywords && condition.whatsappKeywords.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-600 mb-1">{t('nodeDisplay.keywords')}</p>
                          <div className="flex flex-wrap gap-1">
                            {condition.whatsappKeywords.slice(0, 3).map((keyword, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                              >
                                {keyword}
                              </span>
                            ))}
                            {condition.whatsappKeywords.length > 3 && (
                              <span className="text-xs text-gray-500">{t('nodeDisplay.more', { count: condition.whatsappKeywords.length - 3 })}</span>
                            )}
                          </div>
                        </div>
                      )}

                      {condition.whatsappDetectionType === 'intent' && (
                        <div className="mt-1">
                          <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1">
                            <BooSendIcon className="w-4 h-4" />
                            <span className="text-[12px] font-semibold text-gray-800">AI set up</span>
                          </div>
                        </div>
                      )}

                      {!condition.whatsappDetectionType && (
                        <p className="text-xs text-gray-500">{t('nodeDisplay.anyWhatsAppMessage')}</p>
                      )}
                    </div>
                  )}

                  {/* Web Chat trigger details */}
                  {condition.type === 'web_chat' && (
                    <div>
                      {condition.webSupportWidgetId && (
                        <p className="text-xs text-gray-600 mb-1">Widget: {condition.webSupportWidgetId}</p>
                      )}
                    </div>
                  )}

                  {/* Telegram message trigger details */}
                  {condition.type === 'telegram_message' && (
                    <div>
                      {condition.telegramBotId && (
                        <p className="text-xs text-gray-600 mb-1">{t('nodeDisplay.bot')}: {condition.telegramBotId}</p>
                      )}
                      {condition.telegramDetectionType === 'keywords' && ((condition.telegramKeywords && condition.telegramKeywords.length > 0) || selected) && (
                        <div>
                          <p className="text-xs text-gray-600 mb-1">{t('nodeDisplay.keywords')}</p>
                          <KeywordChips
                            list={condition.telegramKeywords || []}
                            editing={!!selected}
                            onCommit={(next) => commitKeywords(condition, 'telegramKeywords', next)}
                          />
                        </div>
                      )}

                      {condition.telegramDetectionType === 'intent' && (
                        <div className="mt-1">
                          <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1">
                            <BooSendIcon className="w-4 h-4" />
                            <span className="text-[12px] font-semibold text-gray-800">AI set up</span>
                          </div>
                        </div>
                      )}

                      {!condition.telegramDetectionType && (
                        <p className="text-xs text-gray-500">{t('nodeDisplay.anyTelegramMessage')}</p>
                      )}
                    </div>
                  )}

                  {/* Comment trigger details */}
                  {condition.type === 'comment' && (
                    <div>
                      <p className="text-xs text-gray-600">
                        {t('nodeDisplay.target')}: {condition.mediaTarget === 'all' ? t('nodeDisplay.allPostsReels') : t('nodeDisplay.specificPostReel')}
                        {condition.mediaTarget === 'specific' && condition.selectedMediaId && (
                          <span className="ml-1 text-blue-600">({condition.media?.find(m => m.id === condition.selectedMediaId) ? t('nodeDisplay.selected') : t('nodeDisplay.mediaSelected')})</span>
                        )}
                      </p>
                      {condition.messageDetectionType === 'intent' && (
                        <div className="mt-2">
                          <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1">
                            <BooSendIcon className="w-4 h-4" />
                            <span className="text-[12px] font-semibold text-gray-800">AI set up</span>
                          </div>
                        </div>
                      )}
                      {condition.messageDetectionType !== 'intent' &&
                        ((Array.isArray(condition.commentKeywords) && condition.commentKeywords.length > 0) || selected) && (
                        <div className="mt-1">
                          <p className="text-xs text-gray-600 mb-1">{t('nodeDisplay.keywords')}</p>
                          <KeywordChips
                            list={Array.isArray(condition.commentKeywords) ? condition.commentKeywords : []}
                            editing={!!selected}
                            onCommit={(next) => commitKeywords(condition, 'commentKeywords', next)}
                          />
                        </div>
                      )}

                      {/* Delete comment summary (only when configured) */}
                      {condition.deleteCommentEnabled && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-600 mb-1">Delete Comment</p>
                          {(condition.deleteMode === 'ai') ? (
                            <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1">
                              <BooSendIcon className="w-4 h-4" />
                              <span className="text-[12px] font-semibold text-gray-800">AI set up</span>
                            </div>
                          ) : (
                            <div>
                              {Array.isArray(condition.deleteKeywords) && condition.deleteKeywords.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {condition.deleteKeywords.slice(0, 3).map((keyword, idx) => (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                                    >
                                      {keyword}
                                    </span>
                                  ))}
                                  {condition.deleteKeywords.length > 3 && (
                                    <span className="text-xs text-gray-500">
                                      {t('nodeDisplay.more', { count: condition.deleteKeywords.length - 3 })}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-500">Configured</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Story reply details */}
                  {condition.type === 'story_reply' && (
                    <div>
                      <p className="text-xs text-gray-600">
                        {t('nodeDisplay.target')}: {condition.storyTarget === 'all' ? t('nodeDisplay.allStories') : t('nodeDisplay.specificStory')}
                        {condition.storyTarget === 'specific' && condition.selectedStoryId && (
                          <span className="ml-1 text-blue-600">({condition.stories?.find(s => s.id === condition.selectedStoryId) ? t('nodeDisplay.selected') : t('nodeDisplay.storySelected')})</span>
                        )}
                      </p>
                      {((Array.isArray(condition.storyReplyKeywords) && condition.storyReplyKeywords.length > 0) || selected) && (
                        <div className="mt-1">
                          <p className="text-xs text-gray-600 mb-1">{t('nodeDisplay.keywords')}</p>
                          <KeywordChips
                            list={Array.isArray(condition.storyReplyKeywords) ? condition.storyReplyKeywords : []}
                            editing={!!selected}
                            onCommit={(next) => commitKeywords(condition, 'storyReplyKeywords', next)}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Live comment details */}
                  {condition.type === 'live_comment' && (
                    <div>
                      {((Array.isArray(condition.liveCommentKeywords) && condition.liveCommentKeywords.length > 0) || selected) && (
                        <div>
                          <p className="text-xs text-gray-600 mb-1">{t('nodeDisplay.keywords')}</p>
                          <KeywordChips
                            list={Array.isArray(condition.liveCommentKeywords) ? condition.liveCommentKeywords : []}
                            editing={!!selected}
                            onCommit={(next) => commitKeywords(condition, 'liveCommentKeywords', next)}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Follow details (bio keywords) */}
                  {condition.type === 'follow' && (
                    <div>
                      {(() => {
                        const list = Array.isArray(condition.bioKeywords)
                          ? condition.bioKeywords
                          : typeof condition.bioKeywords === 'string'
                            ? condition.bioKeywords.split(',').map(s => s.trim()).filter(Boolean)
                            : []
                        return list.length > 0 ? (
                          <div>
                            <p className="text-xs text-gray-600 mb-1">{t('nodeDisplay.bioKeywords')}</p>
                            <div className="flex flex-wrap gap-1">
                              {list.slice(0, 3).map((keyword, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                                >
                                  {keyword}
                                </span>
                              ))}
                              {list.length > 3 && (
                                <span className="text-xs text-gray-500">{t('nodeDisplay.more', { count: list.length - 3 })}</span>
                              )}
                            </div>
                          </div>
                        ) : null
                      })()}
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="flex items-center justify-center py-4">
              <p className="text-sm font-medium text-blue-600 cursor-pointer">{t('nodeDisplay.clickToConfigure')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Removed 'then' badge per design; keep connection handle */}
      <div className="absolute right-0 top-1/2 transform -translate-y-1/2 flex items-center">
        <Handle
          type="source"
          position={Position.Right}
          className="w-8 h-8 bg-gray-600 border-4 border-white shadow-lg"
          style={{ position: 'relative', transform: 'none', right: 0, top: 0 }}
        />
        {!hasMainEdge && (
          <div
            className="pointer-events-none text-[10px] text-gray-500 whitespace-nowrap"
            style={{ position: 'absolute', right: -60, top: '50%', transform: 'translateY(-50%)' }}
          >
            {t('nodeDisplay.nextStep')}
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(TriggerNode)
