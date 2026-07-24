import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Video } from 'lucide-react'
import IntegrationLogo from '../icons/IntegrationLogo'

interface HeyGenNodeData {
  title?: string
  avatarId?: string
  avatarName?: string
  voiceId?: string
  voiceName?: string
  generatedAvatarId?: string
  generatedAvatarName?: string
  generatedVoiceId?: string
  generatedVoiceName?: string
  generatedVideoUrl?: string
  content?: string
  status?: 'draft' | 'waiting' | 'completed' | 'failed'
}

function HeyGenNode({ data, selected }: any) {
  const previewText = data.content?.trim() || 'Configure avatar, voice, and script'
  const statusLabel =
    data.status === 'completed'
      ? 'Ready to send'
      : data.status === 'waiting'
      ? 'Waiting for render'
      : data.status === 'failed'
      ? 'Last render failed'
      : 'Video generation'

  const displayAvatar = data.generatedVideoUrl
    ? data.generatedAvatarName || data.generatedAvatarId || data.avatarName || data.avatarId
    : data.avatarName || data.avatarId

  const displayVoice = data.generatedVideoUrl
    ? data.generatedVoiceName || data.generatedVoiceId || data.voiceName || data.voiceId
    : data.voiceName || data.voiceId

  return (
    <div className="relative w-[320px]">
      <div
        className={`relative rounded-3xl shadow-lg border-2 w-full transition-colors ${
          selected ? 'border-gray-900' : 'border-gray-200 hover:border-gray-900'
        } bg-white`}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="w-8 h-8 bg-gray-900 border-4 border-white shadow-lg"
        />

        <div className="px-4 py-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-gray-100">
              <IntegrationLogo name="heygen" className="h-7 w-7 text-gray-900" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-medium text-gray-900 truncate">{data.title || 'HeyGen Video'}</h3>
              <p className="text-xs text-gray-500">{statusLabel}</p>
            </div>
            <Video className="w-4 h-4 text-gray-400" />
          </div>

          <div className="space-y-2 mb-3">
            <div className="text-xs text-gray-500">
              Avatar: <span className="text-gray-800">{displayAvatar || 'Not selected'}</span>
            </div>
            <div className="text-xs text-gray-500">
              Voice: <span className="text-gray-800">{displayVoice || 'Not selected'}</span>
            </div>
          </div>

          <div className="rounded-2xl bg-gray-50 border border-gray-200 px-3 py-3 text-sm text-gray-700 break-words">
            {previewText}
          </div>
        </div>

        <Handle
          type="source"
          position={Position.Right}
          id="default"
          className="w-8 h-8 bg-gray-900 border-4 border-white shadow-lg"
        />
      </div>
    </div>
  )
}

export default memo(HeyGenNode)
