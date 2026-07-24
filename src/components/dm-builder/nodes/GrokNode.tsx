import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import GrokIcon from '../icons/GrokIcon'

interface ChatLLMNodeData {
  label?: string
  model?: string
  llmPrompt?: string
  systemPrompt?: string
  outputVariableName?: string
  generatedTemplate?: string
}

function GrokNode({ data, selected }: any) {
  const label = data.label?.trim() || 'Grok Node'
  const model = data.model?.trim() || 'grok-2'
  const outputVar = data.outputVariableName?.trim() || 'summary'
  const message = data.generatedTemplate?.trim()
    ? (data.generatedTemplate.length > 60 ? `${data.generatedTemplate.slice(0, 60).trim()}…` : data.generatedTemplate)
    : 'the generated message'

  return (
    <div
      className={`relative min-w-[260px] max-w-[340px] rounded-3xl border-2 bg-white text-gray-900 shadow-lg ${
        selected ? 'border-indigo-500' : 'border-gray-200'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="h-6 w-6 border-4 border-white bg-indigo-500 shadow-lg"
      />

      <div className="p-4 pr-6">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-indigo-50 ring-1 ring-indigo-100 overflow-hidden">
            <GrokIcon className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-gray-900">{label}</h3>
            <p className="mt-0.5 text-[11px] text-gray-800">Model : {model}</p>
          </div>
        </div>

        <div className="mt-2 rounded-xl bg-gray-50 px-3 py-2 text-[11px] text-gray-600 ring-1 ring-gray-200/70">
          <p className="text-[11px] text-gray-700 break-words">
            <span className="font-mono font-semibold text-purple-700">{'{{'}{outputVar}{'}}'}</span>
            {' : '}{message}
          </p>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="h-5 w-5 rounded-full border-4 border-white bg-indigo-500 shadow-lg"
        style={{ top: '50%', right: -8, transform: 'translateY(-50%)' }}
      />
    </div>
  )
}

export default memo(GrokNode)
