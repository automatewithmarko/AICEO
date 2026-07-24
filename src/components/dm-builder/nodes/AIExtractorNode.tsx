import { memo, useState, useEffect, useRef, useMemo } from "react"
import { Handle, Position, useNodeId, useStore } from "@xyflow/react"
import { ChevronDown, Check, Plus, Trash2, Phone, Mail, User, Building2 } from "lucide-react"
import { useTranslation } from '../i18n'
import BooSendIcon from "../icons/BooSendIcon"

export type ExtractFieldType =
  | "phone"
  | "email"
  | "first_name"
  | "last_name"
  | "company"
  | "contact_field"
  | "custom"

interface ExtractField {
  id: string
  type: ExtractFieldType
  customName?: string
  prompt?: string
  contactFieldKey?: string
}

interface AIExtractorNodeData {
  label?: string
  fields?: ExtractField[]
}

const FIELD_OPTION_VALUES: ExtractFieldType[] = [
  "phone",
  "email",
  "first_name",
  "last_name",
  "company",
  "contact_field",
  "custom",
]

function AIExtractorNode({ data, selected }: any) {
  const { t } = useTranslation('automation')
  const nodeId = useNodeId()

  // Translated field options
  const FIELD_OPTIONS = useMemo(() => [
    { value: "phone" as ExtractFieldType, label: t('nodeDisplay.phone').replace(':', '') },
    { value: "email" as ExtractFieldType, label: t('nodeDisplay.email') },
    { value: "first_name" as ExtractFieldType, label: t('nodeDisplay.firstName') },
    { value: "last_name" as ExtractFieldType, label: t('nodeDisplay.lastName') },
    { value: "company" as ExtractFieldType, label: t('nodeDisplay.company') },
    { value: "contact_field" as ExtractFieldType, label: t('nodeDisplay.contactFields') },
    { value: "custom" as ExtractFieldType, label: t('nodeDisplay.custom') },
  ], [t])

  // Translated contact field placeholders
  const CONTACT_FIELD_PLACEHOLDERS = useMemo(() => [
    t('nodeDisplay.selected'),
    t('nodeDisplay.company'),
    "Job Title",
    "Website",
  ], [t])

  // Check if handle has an edge connected
  const hasMainEdge = useStore((s) =>
    nodeId ? s.edges.some((e) => e.source === nodeId) : false
  )

  const [isEditing, setIsEditing] = useState(false)
  const [showMenuFor, setShowMenuFor] = useState<string | null>(null)
  const [showContactMenuFor, setShowContactMenuFor] = useState<string | null>(null)
  const [existingCustomFields, setExistingCustomFields] = useState<string[]>([])
  const [loadingCustomFields, setLoadingCustomFields] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const contactMenuRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const [formData, setFormData] = useState<AIExtractorNodeData>(() => ({
    label: data.label || "AI Extractor",
    fields: Array.isArray(data.fields) && data.fields.length > 0
      ? data.fields
      : [{ id: `f-${Date.now()}`, type: "phone" }],
  }))

  // Load existing custom fields when editing starts.
  // No backend in this app — fall back to any list provided on the node's data prop.
  useEffect(() => {
    if (isEditing && !loadingCustomFields && existingCustomFields.length === 0) {
      const fromData = (data as any).existingCustomFields
      if (Array.isArray(fromData) && fromData.length > 0) {
        setExistingCustomFields(fromData)
      }
    }
  }, [isEditing, loadingCustomFields, existingCustomFields.length])

  // Close menus and auto-save on outside click, mirroring ActionNode UX
  useEffect(() => {
    const onDocPointerDown = (e: Event) => {
      const t = e.target as HTMLElement
      // Close any open option menus
      if (showMenuFor) {
        const ref = menuRefs.current[showMenuFor]
        if (ref && !ref.contains(t)) setShowMenuFor(null)
      }
      if (showContactMenuFor) {
        const ref2 = contactMenuRefs.current[showContactMenuFor]
        if (ref2 && !ref2.contains(t)) setShowContactMenuFor(null)
      }
      // Auto-save if user clicks outside the node while editing
      if (isEditing && containerRef.current && !containerRef.current.contains(t)) {
        handleSave()
      }
    }
    document.addEventListener("pointerdown", onDocPointerDown, true)
    return () => document.removeEventListener("pointerdown", onDocPointerDown, true)
  }, [isEditing, showMenuFor, showContactMenuFor, formData])

  const handleSave = () => {
    Object.assign(data, formData)
    setIsEditing(false)
    setShowMenuFor(null)
    setShowContactMenuFor(null)
  }
  // Auto-save when node loses selection (matches ActionNode UX)
  useEffect(() => {
    if (!selected && isEditing) {
      handleSave()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  // Derived helpers
  const fieldsCount = useMemo(() => (formData.fields || []).length, [formData.fields])
  const needsWide = useMemo(
    () => (formData.fields || []).some(f => f.type === 'custom' || f.type === 'contact_field'),
    [formData.fields]
  )

  return (
    <div
      ref={containerRef}
      onClick={(e) => {
        const t = e.target as HTMLElement
        if (t.closest(".react-flow__handle")) return
        if (!isEditing) setIsEditing(true)
      }}
      className={`relative rounded-3xl shadow-lg border-2 ${isEditing ? (needsWide ? 'min-w-[760px]' : 'min-w-[520px]') : 'min-w-[380px]'} overflow-visible bg-black text-white ${
        selected ? "border-white" : "border-gray-800"
      }`}
    >
      {/* Removed blur overlay when dropdowns are open to avoid blurring the node */}
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
            <h3 className="text-lg font-medium leading-none">{t('nodeDisplay.aiExtractor')}</h3>
            <span className="text-[11px] font-medium text-white/90 bg-white/10 px-2 py-0.5 rounded-md border border-white/20">
              {fieldsCount} {fieldsCount === 1 ? t('nodeDisplay.field') : t('nodeDisplay.fields')}
            </span>
          </div>
        </div>

        {/* Body */}
        {isEditing ? (
          <div className={`space-y-4 w-full ${needsWide ? 'max-w-[760px]' : 'max-w-[520px]'} mx-auto`}>
            {/* Field rows */}
            <div className="rounded-xl overflow-visible border border-white/10 bg-white/5 text-white">
              <div className="divide-y divide-white/10">
                {(formData.fields || []).map((f, idx) => {
                  const selectedOption = FIELD_OPTIONS.find((o) => o.value === f.type)
                  const menuOpen = showMenuFor === f.id
                  return (
                    <div key={f.id} className="px-3 py-3">
                      <div className="text-xs text-white/70 mb-1">{t('nodeDisplay.fieldLabel', { number: idx + 1 })}</div>
                      <div className="flex items-center gap-3 flex-nowrap">
                        {/* Selector */}
                        <div className="relative" ref={(el) => { menuRefs.current[f.id] = el }}>
                          <button
                            type="button"
                            onClick={() => setShowMenuFor(menuOpen ? null : f.id)}
                            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold bg-white/10 text-white border border-white/10 hover:bg-white/15 hover:ring-2 hover:ring-white/20 whitespace-nowrap leading-none min-w-max"
                          >
                            <span className="whitespace-nowrap leading-none">{selectedOption?.label || t('nodeDisplay.selected')}</span>
                            <ChevronDown className={`w-4 h-4 text-white/70 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
                          </button>
                          {menuOpen && (
                            <div className="absolute z-30 mt-2 left-0 flex gap-2 flex-wrap">
                              {FIELD_OPTIONS.filter((opt) => opt.value !== f.type).map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => {
                                    const next = [...(formData.fields || [])]
                                    next[idx] = { ...next[idx], type: opt.value as ExtractFieldType }
                                    // Reset fields not applicable
                                    if (opt.value !== "custom") {
                                      delete (next[idx] as any).customName
                                      delete (next[idx] as any).prompt
                                    }
                                    if (opt.value !== "contact_field") {
                                      delete (next[idx] as any).contactFieldKey
                                    }
                                    setFormData({ ...formData, fields: next })
                                    setShowMenuFor(null)
                                  }}
                                  className="rounded-full px-3 py-1 text-sm bg-white text-gray-900 border border-gray-200 hover:bg-gray-100 shadow whitespace-nowrap leading-none"
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Right-side icon + label for non-custom and non-contact_field */}
                        {f.type !== "custom" && f.type !== "contact_field" && (
                          <div className="ml-auto mr-1">
                            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs bg-white/10 text-white border border-white/10 shadow-sm">
                              {(() => {
                                switch (f.type) {
                                  case 'phone':
                                    return <Phone className="w-3.5 h-3.5" />
                                  case 'email':
                                    return <Mail className="w-3.5 h-3.5" />
                                  case 'first_name':
                                  case 'last_name':
                                    return <User className="w-3.5 h-3.5" />
                                  case 'company':
                                    return <Building2 className="w-3.5 h-3.5" />
                                  default:
                                    return null
                                }
                              })()}
                              <span>{selectedOption?.label || ''}</span>
                            </span>
                          </div>
                        )}

                        {/* Custom inputs (only render wrapper for relevant types) */}
                        {(f.type === "custom" || f.type === "contact_field") && (
                          <div className={`${f.type === 'contact_field' ? 'flex items-center gap-1 w-full flex-nowrap' : 'grid grid-cols-1 md:grid-cols-2 gap-2 flex-1'}`}>
                            {f.type === "custom" && (
                              <>
                                <input
                                  type="text"
                                  value={f.customName || ""}
                                  onChange={(e) => {
                                    const next = [...(formData.fields || [])]
                                    next[idx] = { ...next[idx], customName: e.target.value }
                                    setFormData({ ...formData, fields: next })
                                  }}
                                  placeholder={t('nodeDisplay.namePlaceholder')}
                                  className="w-full text-sm bg-white/5 text-white placeholder-white/50 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-white/20"
                                />
                                <input
                                  type="text"
                                  value={f.prompt || ""}
                                  onChange={(e) => {
                                    const next = [...(formData.fields || [])]
                                    next[idx] = { ...next[idx], prompt: e.target.value }
                                    setFormData({ ...formData, fields: next })
                                  }}
                                  placeholder={t('nodeDisplay.promptPlaceholder')}
                                  className="w-full text-sm bg-white/5 text-white placeholder-white/50 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-white/20"
                                />
                              </>
                            )}
                            {f.type === "contact_field" && (
                              <>
                                {/* Contact field name dropdown (placeholder) */}
                                <div className="relative flex-shrink-0" ref={(el) => { contactMenuRefs.current[f.id] = el }}>
                                  <button
                                    type="button"
                                    onClick={() => setShowContactMenuFor(showContactMenuFor === f.id ? null : f.id)}
                                    className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold bg-white/10 text-white border border-white/10 hover:bg-white/15 hover:ring-2 hover:ring-white/20 whitespace-nowrap leading-none"
                                  >
                                    <span className="truncate max-w-[180px]">{f.contactFieldKey || t('nodeDisplay.selected')}</span>
                                    <ChevronDown className={`w-4 h-4 text-white/70 transition-transform ${showContactMenuFor === f.id ? 'rotate-180' : ''}`} />
                                  </button>
                                  {showContactMenuFor === f.id && (
                                    <div className="absolute z-30 mt-2 left-0 max-w-md">
                                      <div className="bg-gray-900 border border-white/10 rounded-lg shadow-xl p-3">
                                        {/* Existing custom fields */}
                                        {existingCustomFields.length > 0 && (
                                          <div className="mb-3">
                                            <p className="text-xs text-white/70 mb-2">{t('nodeDisplay.existingCustomFields')}</p>
                                            <div className="flex flex-wrap gap-1">
                                              {existingCustomFields
                                                .filter((fieldName) => fieldName !== f.contactFieldKey)
                                                .map((fieldName) => (
                                                  <button
                                                    key={`existing-${fieldName}`}
                                                    type="button"
                                                    onClick={() => {
                                                      const next = [...(formData.fields || [])]
                                                      next[idx] = { ...next[idx], contactFieldKey: fieldName }
                                                      setFormData({ ...formData, fields: next })
                                                      setShowContactMenuFor(null)
                                                    }}
                                                    className="rounded-full px-3 py-1 text-sm bg-white text-gray-900 border border-gray-200 hover:bg-gray-100 shadow whitespace-nowrap leading-none"
                                                  >
                                                    {fieldName}
                                                  </button>
                                                ))}
                                            </div>
                                          </div>
                                        )}

                                        {/* Common/suggested fields */}
                                        <div>
                                          <p className="text-xs text-white/70 mb-2">{t('nodeDisplay.commonFields')}</p>
                                          <div className="flex flex-wrap gap-1">
                                            {CONTACT_FIELD_PLACEHOLDERS
                                              .filter((opt, i) => i !== 0 && opt !== f.contactFieldKey)
                                              .map((opt, i) => (
                                                <button
                                                  key={`${f.id}-contact-${i}`}
                                                  type="button"
                                                  onClick={() => {
                                                    const next = [...(formData.fields || [])]
                                                    next[idx] = { ...next[idx], contactFieldKey: opt }
                                                    setFormData({ ...formData, fields: next })
                                                    setShowContactMenuFor(null)
                                                  }}
                                                  className="rounded-full px-3 py-1 text-sm bg-white text-gray-900 border border-gray-200 hover:bg-gray-100 shadow whitespace-nowrap leading-none"
                                                >
                                                  {opt}
                                                </button>
                                              ))}
                                          </div>
                                        </div>

                                        {loadingCustomFields && (
                                          <div className="mt-2 text-xs text-white/50">{t('nodeDisplay.loadingCustomFields')}</div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <input
                                  type="text"
                                  value={f.prompt || ""}
                                  onChange={(e) => {
                                    const next = [...(formData.fields || [])]
                                    next[idx] = { ...next[idx], prompt: e.target.value }
                                    setFormData({ ...formData, fields: next })
                                  }}
                                  placeholder={t('nodeDisplay.promptPlaceholder')}
                                  className="flex-1 min-w-0 text-sm bg-white/5 text-white placeholder-white/50 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-white/20"
                                />
                              </>
                            )}
                          </div>
                        )}

                        {/* Remove */}
                        {(formData.fields || []).length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const next = [...(formData.fields || [])]
                              next.splice(idx, 1)
                              setFormData({ ...formData, fields: next })
                            }}
                            className="p-2 rounded-md border border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                            title={t('nodeDisplay.removeField')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Add field */}
            <div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, fields: [...(formData.fields || []), { id: `f-${Date.now()}`, type: "phone" }] })}
                className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md border border-white/30 text-white hover:bg-white/10"
              >
                <Plus className="w-4 h-4" /> {t('nodeDisplay.addField')}
              </button>
            </div>

            {/* Note */}
            <p className="text-xs text-white/70">
              {t('nodeDisplay.customFieldsNote')}
            </p>
          </div>
        ) : (
          <div className="mt-1">
            <div className="flex flex-wrap gap-2">
              {((formData.fields || []).slice(0, 6)).map((f) => {
                const opt = FIELD_OPTIONS.find(o => o.value === f.type)
                const label = f.type === 'custom'
                  ? (f.customName || t('nodeDisplay.custom'))
                  : f.type === 'contact_field'
                    ? (f.contactFieldKey || t('nodeDisplay.contactField'))
                    : (opt?.label || t('nodeDisplay.field'))
                return (
                  <span key={`pill-${f.id}`} className="relative inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold text-white/90 border border-white/20 bg-white/10 backdrop-blur-sm shadow-sm overflow-hidden glare">
                    {(() => {
                      switch (f.type) {
                        case 'phone':
                          return <Phone className="w-3.5 h-3.5" />
                        case 'email':
                          return <Mail className="w-3.5 h-3.5" />
                        case 'first_name':
                        case 'last_name':
                          return <User className="w-3.5 h-3.5" />
                        case 'company':
                          return <Building2 className="w-3.5 h-3.5" />
                        default:
                          return null
                      }
                    })()}
                    <span className="whitespace-nowrap">{label}</span>
                  </span>
                )
              })}
              {(formData.fields || []).length > 6 && (
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold text-white/80 border border-white/20 bg-white/5">
                  +{(formData.fields || []).length - 6}
                </span>
              )}
            </div>
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
      <style>{`
        @keyframes glareMove {
          0% { transform: translateX(-120%) skewX(-20deg); opacity: 0; }
          20% { opacity: 0.6; }
          50% { opacity: 0.8; }
          100% { transform: translateX(220%) skewX(-20deg); opacity: 0; }
        }
        .glare::before {
          content: '';
          position: absolute;
          top: 0; left: -30%;
          height: 100%; width: 45%;
          background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0) 100%);
          filter: blur(0.5px);
          animation: glareMove 2.4s linear infinite;
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}

export default memo(AIExtractorNode)
