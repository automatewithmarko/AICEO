import { memo, useMemo, useRef, useState } from 'react'
import { Handle, Position, useNodeId, useStore } from '@xyflow/react'
import { MessageCircle, Clock } from 'lucide-react'
import { useTranslation } from '../i18n'

interface WaitForReplyNodeData {
  label?: string
  timeout?: number
  timeoutUnit?: 'minutes' | 'hours'
  enableTimeout?: boolean
}

function WaitForReplyNode({ data, selected }: any) {
  const { t } = useTranslation('automation')
  const nodeId = useNodeId()

  // Check if handles have edges connected
  const hasReplyEdge = useStore((s) =>
    nodeId ? s.edges.some((e) => e.source === nodeId && e.sourceHandle === 'reply') : false
  )
  const hasTimeoutEdge = useStore((s) =>
    nodeId ? s.edges.some((e) => e.source === nodeId && e.sourceHandle === 'timeout') : false
  )

  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [showUnitMenu, setShowUnitMenu] = useState(false)
  const unitMenuRef = useRef<HTMLDivElement | null>(null)

  const [formData, setFormData] = useState({
    label: data.label || t('nodeDisplay.waitForReply'),
    timeout: data.timeout || 24,
    timeoutUnit: data.timeoutUnit || 'hours' as 'minutes' | 'hours',
    enableTimeout: data.enableTimeout ?? false
  })

  const timeUnits = useMemo(() => [
    { value: 'minutes' as const, label: t('nodeDisplay.minutes') },
    { value: 'hours' as const, label: t('nodeDisplay.hours') }
  ], [t])

  // Calculate max timeout value based on unit
  const getMaxTimeout = (unit: 'minutes' | 'hours') => {
    if (unit === 'minutes') return 1440 // 24 hours = 1440 minutes
    return 24 // 24 hours
  }

  const updateData = (patch: Partial<typeof formData>) => {
    setFormData((prev) => {
      let next = { ...prev, ...patch }

      // Enforce max 24 hours
      const maxTimeout = getMaxTimeout(next.timeoutUnit)
      if (next.timeout > maxTimeout) {
        next.timeout = maxTimeout
      }

      Object.assign(data, next)
      return next
    })
  }

  const formatTimeout = () => {
    if (!formData.enableTimeout) return t('nodeDisplay.noTimeout')
    return `${formData.timeout} ${formData.timeoutUnit}`
  }

  if (!selected) {
    return (
      <div
        ref={containerRef}
        className="relative rounded-xl shadow-lg border-2 min-w-[280px] max-w-[320px] bg-white border-gray-300"
      >
        <Handle
          type="target"
          position={Position.Left}
          className="w-4 h-4 bg-gray-600 border-2 border-white"
        />

        <div className="p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900">
                {formData.label}
              </h3>
              <p className="text-xs text-gray-600 mt-0.5">
                {t('nodeDisplay.pausesUntilReplies')}
              </p>
            </div>
          </div>

          {formData.enableTimeout && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex items-center gap-2 text-xs text-gray-700">
                <Clock className="w-3.5 h-3.5" />
                <span>{t('nodeDisplay.timeout')}: {formatTimeout()}</span>
              </div>
            </div>
          )}
        </div>

        {/* Output handles on the right side */}
        <div className="absolute right-0 top-1/2 transform -translate-y-1/2 flex flex-col items-end space-y-3 pr-1">
          <div className="flex items-center gap-2 relative">
            <span className="text-xs font-medium text-gray-700">{t('nodeDisplay.reply')}</span>
            <Handle
              type="source"
              position={Position.Right}
              id="reply"
              className="w-5 h-5 rounded-full border-4 border-white shadow-lg"
              style={{ position: 'relative', transform: 'none', right: 0, top: 0, backgroundColor: '#4b5563' }}
            />
            {!hasReplyEdge && (
              <div
                className="pointer-events-none text-[10px] text-gray-500 whitespace-nowrap"
                style={{ position: 'absolute', right: -60, top: '50%', transform: 'translateY(-50%)' }}
              >
                {t('nodeDisplay.nextStep')}
              </div>
            )}
          </div>
          {formData.enableTimeout && (
            <div className="flex items-center gap-2 relative">
              <span className="text-xs font-medium text-orange-600">{t('nodeDisplay.timeout')}</span>
              <Handle
                type="source"
                position={Position.Right}
                id="timeout"
                className="w-5 h-5 rounded-full border-4 border-white shadow-lg"
                style={{ position: 'relative', transform: 'none', right: 0, top: 0, backgroundColor: '#f97316' }}
              />
              {!hasTimeoutEdge && (
                <div
                  className="pointer-events-none text-[10px] text-gray-500 whitespace-nowrap"
                  style={{ position: 'absolute', right: -60, top: '50%', transform: 'translateY(-50%)' }}
                >
                  {t('nodeDisplay.nextStep')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Editing view
  return (
    <div
      ref={containerRef}
      className="relative rounded-xl shadow-xl border-2 min-w-[320px] max-w-[380px] bg-white border-gray-900"
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-4 h-4 bg-gray-600 border-2 border-white"
      />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <input
              type="text"
              value={formData.label}
              onChange={(e) => updateData({ label: e.target.value })}
              placeholder={t('nodeDisplay.waitForReply')}
              className="w-full text-sm font-semibold text-gray-900 bg-transparent border-none outline-none focus:ring-0 p-0"
            />
            <p className="text-xs text-gray-600 mt-0.5">
              {t('nodeDisplay.pausesUntilReplies')}
            </p>
          </div>
        </div>

        {/* Timeout Toggle */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.enableTimeout}
              onChange={(e) => updateData({ enableTimeout: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
            />
            <span className="text-sm font-medium text-gray-700">{t('nodeDisplay.enableTimeout')}</span>
          </label>

          {formData.enableTimeout && (
            <div className="pl-6 space-y-2">
              <label className="block text-xs font-medium text-gray-700">
                {t('nodeDisplay.timeoutAfter')}
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  max={getMaxTimeout(formData.timeoutUnit)}
                  value={formData.timeout}
                  onChange={(e) => updateData({ timeout: parseInt(e.target.value) || 1 })}
                  className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-500"
                />
                <div className="relative" ref={unitMenuRef}>
                  <button
                    type="button"
                    onClick={() => setShowUnitMenu(!showUnitMenu)}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 min-w-[100px] flex items-center justify-between"
                  >
                    <span>{timeUnits.find(u => u.value === formData.timeoutUnit)?.label}</span>
                    <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showUnitMenu && (
                    <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                      {timeUnits.map((unit) => (
                        <button
                          key={unit.value}
                          type="button"
                          onClick={() => {
                            updateData({ timeoutUnit: unit.value })
                            setShowUnitMenu(false)
                          }}
                          className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg"
                        >
                          {unit.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {t('nodeDisplay.afterTimeoutNote')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Output handles on the right side */}
      <div className="absolute right-0 top-1/2 transform -translate-y-1/2 flex flex-col items-end space-y-3 pr-1">
        <div className="flex items-center gap-2 relative">
          <span className="text-xs font-medium text-gray-700">{t('nodeDisplay.reply')}</span>
          <Handle
            type="source"
            position={Position.Right}
            id="reply"
            className="w-5 h-5 rounded-full border-4 border-white shadow-lg"
            style={{ position: 'relative', transform: 'none', right: 0, top: 0, backgroundColor: '#4b5563' }}
          />
          {!hasReplyEdge && (
            <div
              className="pointer-events-none text-[10px] text-gray-500 whitespace-nowrap"
              style={{ position: 'absolute', right: -60, top: '50%', transform: 'translateY(-50%)' }}
            >
              {t('nodeDisplay.nextStep')}
            </div>
          )}
        </div>
        {formData.enableTimeout && (
          <div className="flex items-center gap-2 relative">
            <span className="text-xs font-medium text-orange-600">{t('nodeDisplay.timeout')}</span>
            <Handle
              type="source"
              position={Position.Right}
              id="timeout"
              className="w-5 h-5 rounded-full border-4 border-white shadow-lg"
              style={{ position: 'relative', transform: 'none', right: 0, top: 0, backgroundColor: '#f97316' }}
            />
            {!hasTimeoutEdge && (
              <div
                className="pointer-events-none text-[10px] text-gray-500 whitespace-nowrap"
                style={{ position: 'absolute', right: -60, top: '50%', transform: 'translateY(-50%)' }}
              >
                {t('nodeDisplay.nextStep')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(WaitForReplyNode)
