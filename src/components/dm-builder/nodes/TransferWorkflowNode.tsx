import { memo, useState, useEffect, useRef } from "react"
import { Handle, Position, useNodeId, useStore } from "@xyflow/react"
import { ChevronDown, Info } from "lucide-react"
import { useTranslation } from '../i18n'
import BooSendIcon from "../icons/BooSendIcon"

interface Automation {
  id: string
  name: string
  description: string | null
  status: 'active' | 'draft' | 'paused' | 'archived'
}

interface TransferWorkflowNodeData {
  label?: string
  targetAutomationId?: string
  targetAutomationName?: string
}

function TransferWorkflowNode({ data, selected }: any) {
  const { t } = useTranslation('automation')
  const nodeId = useNodeId()

  // Check if handle has an edge connected
  const hasMainEdge = useStore((s) =>
    nodeId ? s.edges.some((e) => e.source === nodeId) : false
  )

  const [isEditing, setIsEditing] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  // Standalone port: no live automation list — render the stored value only.
  const automations: Automation[] = []
  const loading = false
  const containerRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const [formData, setFormData] = useState<TransferWorkflowNodeData>(() => ({
    label: data.label || "Transfer to Automation",
    targetAutomationId: data.targetAutomationId,
    targetAutomationName: data.targetAutomationName,
  }))

  // Close menu and auto-save on outside click
  useEffect(() => {
    const onDocPointerDown = (e: Event) => {
      const t = e.target as HTMLElement

      // Close menu if clicking outside
      if (showMenu && menuRef.current && !menuRef.current.contains(t)) {
        setShowMenu(false)
      }

      // Auto-save if user clicks outside the node while editing
      if (isEditing && containerRef.current && !containerRef.current.contains(t)) {
        handleSave()
      }
    }
    document.addEventListener("pointerdown", onDocPointerDown, true)
    return () => document.removeEventListener("pointerdown", onDocPointerDown, true)
  }, [isEditing, showMenu, formData])

  const handleSave = () => {
    Object.assign(data, formData)
    setIsEditing(false)
    setShowMenu(false)
  }

  // Auto-save when node loses selection
  useEffect(() => {
    if (!selected && isEditing) {
      handleSave()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  // Standalone port: derive the "selected automation" from what the node data
  // already stores, instead of matching against a fetched list.
  const selectedAutomation: Automation | null = formData.targetAutomationId
    ? {
        id: formData.targetAutomationId,
        name: formData.targetAutomationName || formData.targetAutomationId,
        description: null,
        status: 'active',
      }
    : null

  return (
    <div
      ref={containerRef}
      onClick={(e) => {
        const t = e.target as HTMLElement
        if (t.closest(".react-flow__handle")) return
        if (!isEditing) setIsEditing(true)
      }}
      className={`relative rounded-3xl shadow-lg border-2 ${isEditing ? 'min-w-[520px]' : 'min-w-[380px]'} overflow-visible bg-black text-white ${
        selected ? "border-white" : "border-gray-800"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-8 h-8 bg-gray-600 border-4 border-white shadow-lg"
      />

      <div className="p-6">
        {/* Header */}
        <div className="flex items-center mb-3">
          <BooSendIcon className="w-10 h-10 mr-3" />
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-lg font-medium leading-none">{t('nodeDisplay.transferToAutomation')}</h3>
            {formData.targetAutomationName && (
              <span className="text-[11px] font-medium text-white/90 bg-white/10 px-2 py-0.5 rounded-md border border-white/20">
                {t('nodeDisplay.selected')}
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        {isEditing ? (
          <div className="space-y-4 w-full max-w-[520px] mx-auto">
            <div className="rounded-xl overflow-visible border border-white/10 bg-white/5 text-white p-4">
              <label className="text-xs text-white/70 mb-2 block">
                {t('nodeDisplay.selectTargetAutomation')}
              </label>

              {/* Workflow Selector */}
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setShowMenu(!showMenu)}
                  disabled={loading}
                  className="w-full inline-flex items-center justify-between gap-2 rounded-lg px-4 py-3 text-sm font-medium bg-white/10 text-white border border-white/10 hover:bg-white/15 hover:ring-2 hover:ring-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="truncate">
                    {loading ? t('nodeDisplay.loading') : (selectedAutomation?.name || t('nodeDisplay.selectAnAutomation'))}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-white/70 transition-transform flex-shrink-0 ${showMenu ? "rotate-180" : ""}`} />
                </button>

                {showMenu && !loading && (
                  <div className="absolute z-30 mt-2 left-0 right-0 bg-gray-900 border border-white/10 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                    {automations.length === 0 ? (
                      <div className="p-4 text-sm text-white/50 text-center">
                        {t('nodeDisplay.noAutomationsAvailable')}
                      </div>
                    ) : (
                      <div className="p-2">
                        {automations.map((automation) => (
                          <button
                            key={automation.id}
                            type="button"
                            onClick={() => {
                              setFormData({
                                ...formData,
                                targetAutomationId: automation.id,
                                targetAutomationName: automation.name,
                              })
                              setShowMenu(false)
                            }}
                            className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-white/10 transition-colors ${
                              formData.targetAutomationId === automation.id
                                ? 'bg-white/15 text-white'
                                : 'text-white/90'
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium">{automation.name}</span>
                              {automation.status === 'draft' && (
                                <Info className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
                              )}
                            </div>
                            {automation.description && (
                              <div className="text-xs text-white/50 mt-0.5 truncate">
                                {automation.description}
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                                automation.status === 'active'
                                  ? 'bg-green-500/20 text-green-300'
                                  : 'bg-gray-500/20 text-gray-300'
                              }`}>
                                {automation.status}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Description */}
              {selectedAutomation && (
                <div className="mt-3 space-y-2">
                  <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                    <p className="text-xs text-white/70">
                      {t('nodeDisplay.userWillBeTransferred', { name: selectedAutomation.name })}
                    </p>
                  </div>
                  {selectedAutomation.status === 'draft' && (
                    <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20 flex items-start gap-2">
                      <Info className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-yellow-200">
                        {t('nodeDisplay.automationInDraft')}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Note */}
            <p className="text-xs text-white/70">
              {t('nodeDisplay.contactWillContinue')}
            </p>
          </div>
        ) : (
          <div className="mt-1">
            {formData.targetAutomationName ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold text-white/90 border border-white/20 bg-white/10 backdrop-blur-sm shadow-sm">
                  <span className="truncate max-w-[240px]">{formData.targetAutomationName}</span>
                </span>
              </div>
            ) : (
              <p className="text-sm text-white/50">{t('nodeDisplay.noAutomationSelected')}</p>
            )}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="w-5 h-5 bg-gray-600 border-4 border-white shadow-lg rounded-full"
        style={{ top: "50%", right: -8, transform: "translateY(-50%)" }}
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

export default memo(TransferWorkflowNode)
