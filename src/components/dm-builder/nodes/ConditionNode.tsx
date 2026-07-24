import { memo } from 'react'
import { Handle, Position, useNodeId, useStore } from '@xyflow/react'
import { GitBranch } from 'lucide-react'
import { useTranslation } from '../i18n'

interface ConditionNodeData {
  conditions?: Array<{
    id: string
    type: 'follows_account' | 'is_verified' | 'follower_count' | 'has_tag'
    value?: string | number
    operator?: 'greater_than' | 'less_than' | 'equals'
    followRelation?: 'follows' | "doesnt_follow"
    booleanOp?: 'is' | 'isnt'
    /** Legacy single-tag value. Kept for backwards compat. */
    tagName?: string
    /** Multi-tag list (new). Used with relation 'has' / 'does_not_have'. */
    tagNames?: string[]
    /** 'no_tags' = contact has zero tags at all. */
    hasTagRelation?: 'has' | 'does_not_have' | 'no_tags'
  }>
  relationship?: 'AND' | 'OR'
  conditionSummary?: string
}

function ConditionNode({ data, selected }: any) {
  const { t } = useTranslation('automation')
  const nodeId = useNodeId()

  // Check if handles have edges connected
  const hasTrueEdge = useStore((s) =>
    nodeId ? s.edges.some((e) => e.source === nodeId && e.sourceHandle === 'true') : false
  )
  const hasFalseEdge = useStore((s) =>
    nodeId ? s.edges.some((e) => e.source === nodeId && e.sourceHandle === 'false') : false
  )

  const hasConditions = Array.isArray(data.conditions) && data.conditions.length > 0
  const rel = (data.relationship || 'AND') as 'AND' | 'OR'

  const Smart = ({ children }: { children: any }) => (
    <span className="text-blue-400 underline underline-offset-2 decoration-2 decoration-blue-400 font-semibold select-none cursor-default">{children}</span>
  )

  type Cond = NonNullable<ConditionNodeData['conditions']>[number]
  const renderCond = (c: Cond) => {
    if (!c) return null
    if (c.type === 'follows_account') {
      const label = c.followRelation === 'doesnt_follow' ? "doesn't follow" : 'follows'
      return (
        <>
          <span>User </span>
          <Smart>{label}</Smart>
          <span> account</span>
        </>
      )
    }
    // Hide is_verified condition from UI
    if (c.type === 'is_verified') {
      return null
    }
    if (c.type === 'has_tag') {
      // 'no_tags' is its own mode — contact has zero tags. No tag list to show.
      if (c.hasTagRelation === 'no_tags') {
        return (
          <>
            <span>User </span>
            <Smart>has no tags</Smart>
          </>
        )
      }
      // Read multi-tag list (new) with fallback to legacy single tagName.
      const names: string[] = Array.isArray(c.tagNames) && c.tagNames.length > 0
        ? c.tagNames
        : (c.tagName ? [c.tagName] : [])
      const label = c.hasTagRelation === 'does_not_have' ? "doesn't have any of" : 'has any of'
      const tagDisplay = names.length === 0
        ? '(no tags)'
        : names.length === 1
          ? names[0]
          : names.length <= 3
            ? names.join(', ')
            : `${names[0]} +${names.length - 1} more`
      return (
        <>
          <span>User </span>
          <Smart>{label}</Smart>
          <span> </span>
          <Smart>{tagDisplay}</Smart>
        </>
      )
    }
    // follower_count
    const op = c.operator || 'greater_than'
    const opLabel = op === 'less_than' ? 'less' : op === 'equals' ? 'equal' : 'more'
    const thanTo = op === 'equals' ? 'to' : 'than'
    const num = typeof c.value === 'number' || typeof c.value === 'string' ? c.value : 1000
    return (
      <>
        <span>Follower count is </span>
        <Smart>{opLabel}</Smart>
        <span> {thanTo} </span>
        <Smart>{num}</Smart>
        <span> followers</span>
      </>
    )
  }

  const summary = hasConditions
    ? (
        <div className="text-gray-900">
          {data!.conditions!.map((c: Cond, idx: number) => (
            <span key={c.id}>
              {idx > 0 && (
                <>
                  <span> </span>
                  <Smart>{rel}</Smart>
                  <span> </span>
                </>
              )}
              {renderCond(c)}
            </span>
          ))}
        </div>
      )
    : (data.conditionSummary || 'Click to configure conditions...')

  return (
    <div className={`relative bg-white rounded-3xl shadow-lg border-2 min-w-[360px] max-w-[460px] cursor-pointer hover:shadow-xl transition-shadow ${
      selected ? 'border-gray-900' : 'border-gray-200'
    }`}>
      <Handle
        type="target"
        position={Position.Left}
        className="w-8 h-8 bg-gray-600 border-4 border-white shadow-lg"
      />

      <div className="p-6 pr-16">
        {/* Header with condition icon and heading */}
        <div className="flex items-center mb-1">
          <GitBranch className="w-5 h-5 text-gray-600 mr-3" />
          <h3 className="text-lg font-medium text-gray-900">{t('nodeDisplay.condition')}</h3>
        </div>

        <div className="text-[15px] leading-6 break-words">
          {summary}
        </div>
      </div>

      {/* Colored connection handles only (green for true, red for false) */}
      <div className="absolute right-0 top-1/2 transform -translate-y-1/2 flex flex-col items-end space-y-4 pr-1">
        <div className="flex items-center gap-2 relative">
          <span className="text-xs font-medium text-green-600">{t('nodeDisplay.ifTrue')}</span>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            className="w-6 h-6 rounded-full border-4 border-white shadow-lg"
            style={{ position: 'relative', transform: 'none', right: 0, top: 0, backgroundColor: '#22c55e' }}
          />
          {!hasTrueEdge && (
            <div
              className="pointer-events-none text-[10px] text-gray-500 whitespace-nowrap"
              style={{ position: 'absolute', right: -60, top: '50%', transform: 'translateY(-50%)' }}
            >
              {t('nodeDisplay.nextStep')}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 relative">
          <span className="text-xs font-medium text-red-600">{t('nodeDisplay.ifFalse')}</span>
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            className="w-6 h-6 rounded-full border-4 border-white shadow-lg"
            style={{ position: 'relative', transform: 'none', right: 0, top: 0, backgroundColor: '#ef4444' }}
          />
          {!hasFalseEdge && (
            <div
              className="pointer-events-none text-[10px] text-gray-500 whitespace-nowrap"
              style={{ position: 'absolute', right: -60, top: '50%', transform: 'translateY(-50%)' }}
            >
              {t('nodeDisplay.nextStep')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(ConditionNode)
