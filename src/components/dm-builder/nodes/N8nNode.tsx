import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import IntegrationLogo from '../icons/IntegrationLogo'
import { useTranslation } from '../i18n'

interface N8nNodeData {
  label?: string
  webhookUrl?: string
  workflowId?: string
  workflowName?: string
  mode?: 'send' | 'send_and_receive'        // legacy
  webhookMode?: 'send' | 'send_and_receive' // current
}

function N8nNode({ data, selected }: any) {
  const { t } = useTranslation('automation')
  const effectiveMode = data.webhookMode || data.mode || 'send'
  const modeLabel = effectiveMode === 'send_and_receive' ? t('nodeDisplay.sendAndReceive') : t('nodeDisplay.sendOnly')

  return (
    <div className="relative w-[260px]">
      <div
        className={`relative rounded-3xl shadow-lg border-2 w-full transition-colors ${
          selected ? 'border-[#EA4B71]' : 'border-[#EA4B71]/60 hover:border-[#EA4B71]'
        }`}
        style={{ background: '#EA4B71' }}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 border-2 border-white shadow-md"
          style={{ background: '#EA4B71' }}
        />

        <div className="px-4 py-3">
          {/* Header */}
          <div className="flex items-center mb-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white mr-2 overflow-hidden">
              <IntegrationLogo name="n8n" className="w-8 h-8" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white truncate">
                N8N
              </h3>
              <p className="text-xs text-white/70 truncate">
                {modeLabel}
              </p>
            </div>
          </div>

          {/* Workflow info */}
          <div className="mt-1">
            <div className="text-[11px] font-medium text-white/80 mb-1">
              {t('nodeDisplay.workflow')}
            </div>
            <div className="px-2 py-1 rounded-md bg-white/10 text-[11px] text-white truncate">
              {data.workflowName || data.webhookUrl || t('nodeDisplay.notConfigured')}
            </div>
          </div>
        </div>

        <Handle
          type="source"
          position={Position.Right}
          id="default"
          className="w-3 h-3 border-2 border-white shadow-md"
          style={{ background: '#EA4B71' }}
        />
      </div>
    </div>
  )
}

export default memo(N8nNode)
