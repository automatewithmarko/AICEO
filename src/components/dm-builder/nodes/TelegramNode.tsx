import { memo, useMemo } from 'react'
import { Handle, Position, useNodeId, useStore } from '@xyflow/react'
import { MessageSquare, Image, Link, Volume2, Video } from 'lucide-react'
import IntegrationLogo from '../icons/IntegrationLogo'
import { useTranslation } from '../i18n'

interface TelegramNodeData {
  messageType?: 'text' | 'image' | 'video' | 'voice'
  content?: string
  mediaUrl?: string
  caption?: string
  voiceId?: string
  voiceName?: string
  voiceProvider?: 'elevenlabs' | 'minimax' | 'inworld' | 'upload'
  telegram_bot_id?: string
  buttons?: Array<{
    id: string
    title: string
    actionType: 'url' | 'next_step' | 'tag'
    url?: string
    nextStepId?: string
    tag?: string
  }>
}

function TelegramNode({ data, selected }: any) {
  const { t } = useTranslation('automation')
  const nodeId = useNodeId()

  // Check if main handle has an edge connected
  const hasMainEdge = useStore((s) =>
    nodeId ? s.edges.some((e) => e.source === nodeId && (e.sourceHandle === 'default' || e.sourceHandle === null || e.sourceHandle === '')) : false
  )

  // Check which button handles have edges
  const buttonEdges = useStore((s) =>
    nodeId ? s.edges.filter((e) => e.source === nodeId && e.sourceHandle?.startsWith('button-')) : []
  )

  const hasInstagramTrigger = useStore((s) => {
    // ReactFlow v11 exposed `nodeInternals`; @xyflow/react v12 renamed it `nodeLookup`.
    const nodeInternals = (s as any).nodeInternals ?? (s as any).nodeLookup
    if (!nodeInternals || typeof nodeInternals.values !== 'function') return false

    let triggerNode: any | undefined
    for (const node of nodeInternals.values()) {
      if (node.type === 'trigger') {
        triggerNode = node
        break
      }
    }

    const conditions = triggerNode?.data?.triggerConditions
    if (!Array.isArray(conditions)) return false
    return conditions.some((t: any) =>
      ['message', 'comment', 'story_reply', 'follow', 'live_comment'].includes(t.type)
    )
  })

  const messageTypes = useMemo(() => [
    { value: 'text', label: t('nodeDisplay.textMessage'), icon: MessageSquare },
    { value: 'image', label: t('nodeDisplay.photo'), icon: Image },
    { value: 'video', label: t('nodeDisplay.video'), icon: Video },
    { value: 'voice', label: t('nodeDisplay.voiceMessage'), icon: Volume2 },
  ], [t])

  // Selected type metadata and icon
  const currentType = messageTypes.find(t => t.value === data.messageType) || messageTypes[0]
  const TypeIcon = currentType.icon

  const getPreviewContent = () => {
    switch (data.messageType) {
      case 'image':
        return data.mediaUrl ? t('nodeDisplay.photoMessage') : t('nodeDisplay.noPhotoSelected')
      case 'video':
        return data.mediaUrl ? t('nodeDisplay.videoMessageEmoji') : t('nodeDisplay.noVideoSelected')
      case 'voice':
        // For voice, show the text-to-speech content in the preview area
        return (data.content && data.content.trim().length > 0)
          ? data.content
          : t('nodeDisplay.enterTextToSpeak')
      default:
        return data.content || t('nodeDisplay.enterYourMessage')
    }
  }

  const getCaption = () => {
    if (['image', 'video'].includes(data.messageType || '')) {
      return data.caption || ''
    }
    return ''
  }

  return (
    <div className="relative w-[280px]">
      {hasInstagramTrigger && (
        <div className="absolute top-0 left-0 w-full -translate-y-[80%] rounded-t-3xl bg-red-500 bg-opacity-60 border border-red-600 px-3 pt-2 pb-9 text-[13px] leading-snug text-[#7f1d1d] shadow-sm pointer-events-none text-center z-0">
          {t('nodeDisplay.instagramWarning')}
        </div>
      )}
      <div className={`relative z-10 bg-white rounded-3xl shadow-lg border-2 w-full transition-colors ${
        selected ? 'border-[#0088CC]' : 'border-gray-200 hover:border-[#0088CC]'
      }`}>
        <Handle
          type="target"
          position={Position.Left}
          className="w-8 h-8 bg-[#0088CC] border-4 border-white shadow-lg"
        />

        <div className="px-4 py-3">
        {/* Header with Telegram icon or voice provider icon (ElevenLabs, Minimax, Inworld) */}
        <div className="flex items-center mb-2 min-w-0">
          {data.messageType === 'voice' ? (
            data.voiceProvider === 'minimax' ? (
              <IntegrationLogo name="minimax" className="w-5 h-5 mr-3" />
            ) : data.voiceProvider === 'inworld' ? (
              <IntegrationLogo name="inworld" className="w-5 h-5 mr-3" />
            ) : (
              <IntegrationLogo name="elevenlabs" className="w-5 h-5 mr-3" />
            )
          ) : (
            <img src="/Telegram.png" alt="Telegram" className="w-5 h-5 mr-3" />
          )}
          <h3 className="text-lg font-medium text-gray-900 break-words flex-1 min-w-0">{t('nodeDisplay.sendMessage')}</h3>
        </div>

        {/* Preview area */}
        {data.messageType === 'voice' ? (
          <>
            <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm font-normal text-black break-words overflow-hidden">
              {getPreviewContent()}
            </div>
            <div className="mt-2 flex items-center gap-2">
              {data.voiceProvider === 'minimax' ? (
                <IntegrationLogo name="minimax" className="w-4 h-4" />
              ) : data.voiceProvider === 'inworld' ? (
                <IntegrationLogo name="inworld" className="w-4 h-4" />
              ) : (
                <IntegrationLogo name="elevenlabs" className="w-4 h-4" />
              )}
              <span className="text-xs font-medium text-gray-600">{data.voiceName || t('nodeDisplay.noVoiceSelected')}</span>
            </div>
          </>
        ) : data.messageType === 'image' ? (
          <>
            {data.mediaUrl && (
              <div className="relative rounded-lg overflow-hidden bg-gray-100 mb-2">
                <img src={data.mediaUrl} alt="Preview" className="w-full max-h-48 object-cover" />
              </div>
            )}
            {getCaption() ? (
              <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm font-normal text-black break-words overflow-hidden">
                {getCaption()}
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm font-normal text-gray-400 break-words overflow-hidden">
                {data.mediaUrl ? t('nodeDisplay.addCaption') : t('nodeDisplay.noPhotoSelected')}
              </div>
            )}
          </>
        ) : data.messageType === 'video' ? (
          <>
            {data.mediaUrl && (
              <div className="relative rounded-lg overflow-hidden bg-gray-100 mb-2">
                <video src={data.mediaUrl} className="w-full max-h-48 object-cover" controls />
              </div>
            )}
            {getCaption() ? (
              <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm font-normal text-black break-words overflow-hidden">
                {getCaption()}
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm font-normal text-gray-400 break-words overflow-hidden">
                {data.mediaUrl ? t('nodeDisplay.addCaption') : t('nodeDisplay.noVideoSelected')}
              </div>
            )}
          </>
        ) : (
          <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm font-normal text-black break-words overflow-hidden">
            {getPreviewContent()}
          </div>
        )}

        {/* Inline Keyboard Buttons (Telegram-style) */}
        {data.buttons && data.buttons.length > 0 && (
          <div className="mt-3 space-y-2">
            {data.buttons.map((button: any) => {
              const hasButtonEdge = buttonEdges.some(e => e.sourceHandle === `button-${button.id}`)
              return (
                <div key={button.id} className="relative">
                  <button
                    className="w-full px-3 py-2 rounded-lg bg-[#0088CC] text-white text-xs font-semibold tracking-wide hover:bg-[#006699] transition-colors"
                    type="button"
                    title={(button as any).isDraft ? `${button.title} — needs configuration` : button.title}
                  >
                    {(button as any).isDraft && (
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5 align-middle"
                        title="Configure later — finish setting up this button"
                      />
                    )}
                    {button.title}
                    {!(button as any).isDraft && button.actionType === 'url' && ' 🔗'}
                  </button>
                  {(button.actionType === 'next_step' || button.actionType === 'tag') && (
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={`button-${button.id}`}
                      className={`!w-6 !h-6 !border-4 !border-white shadow-md transition-colors ${
                        hasButtonEdge ? '!bg-[#0088CC]' : '!bg-gray-400'
                      }`}
                      style={{
                        top: '50%',
                        transform: 'translateY(-50%)',
                        right: '-16px'
                      }}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
        </div>

        {/* Main output handle */}
        <Handle
          type="source"
          position={Position.Right}
          id="default"
          className={`w-8 h-8 border-4 border-white shadow-lg transition-colors ${
            hasMainEdge ? 'bg-[#0088CC]' : 'bg-gray-400'
          }`}
        />
      </div>
    </div>
  )
}

export default memo(TelegramNode)
