import React, { useState, useEffect } from 'react'
import { Handle, Position, useReactFlow, useNodeId, useStore } from '@xyflow/react'
import { MessageSquare, X, Check } from 'lucide-react'
import { useTranslation } from '../i18n'

interface InstagramReplyCommentNodeProps {
  data: {
    content?: string
    label?: string
  }
  selected?: boolean
  id: string
}

export default function InstagramReplyCommentNode({ data, selected, id }: any) {
  const { t } = useTranslation('automation')
  const nodeId = useNodeId()

  // Check if handle has an edge connected
  const hasMainEdge = useStore((s) =>
    nodeId ? s.edges.some((e) => e.source === nodeId) : false
  )

  const [isEditing, setIsEditing] = useState(false)
  const [content, setContent] = useState(data.content || '')
  const { setNodes } = useReactFlow()

  useEffect(() => {
    setContent(data.content || '')
  }, [data.content])

  const handleSave = () => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              content: content
            }
          }
        }
        return node
      })
    )
    setIsEditing(false)
  }

  const handleCancel = () => {
    setContent(data.content || '')
    setIsEditing(false)
  }

  const getPreviewContent = () => {
    if (!data.content || data.content.trim() === '') {
      return t('nodeDisplay.clickToConfigureReply')
    }
    return data.content.length > 80
      ? data.content.substring(0, 80) + '...'
      : data.content
  }

  return (
    <div
      className={`bg-white rounded-2xl p-4 shadow-sm border-2 transition-all duration-200 ${
        selected ? 'border-blue-500 shadow-lg' : 'border-gray-200 hover:border-gray-300'
      }`}
      style={{ minWidth: '280px', maxWidth: isEditing ? '400px' : '320px' }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-5 h-5 bg-gray-600 border-4 border-white shadow-lg rounded-full"
        style={{ left: -8 }}
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <MessageSquare className="w-5 h-5 text-blue-600 mr-3" />
            <h3 className="text-lg font-medium text-gray-900">{t('nodeDisplay.replyToComment')}</h3>
          </div>
          {isEditing && (
            <div className="flex space-x-1">
              <button
                onClick={handleSave}
                className="p-1 hover:bg-green-100 rounded text-green-600"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={handleCancel}
                className="p-1 hover:bg-red-100 rounded text-red-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              {t('nodeDisplay.commentReplyContent')}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('nodeDisplay.enterReplyPlaceholder')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              rows={4}
              autoFocus
            />
            <div className="text-xs text-gray-500">
              {t('nodeDisplay.usernameHint')}
            </div>
          </div>
        ) : (
          <div
            className="rounded-3xl border border-gray-200 bg-white p-4 shadow-md cursor-pointer hover:border-gray-300"
            onClick={() => setIsEditing(true)}
          >
            <div className="bg-gray-50 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 break-words">
              {getPreviewContent()}
            </div>
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
    </div>
  )
}
