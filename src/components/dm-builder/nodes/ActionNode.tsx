import { memo, useState, useEffect, useRef } from 'react'
import { Handle, Position, useReactFlow, type Node, useNodeId, useStore, useUpdateNodeInternals } from '@xyflow/react'
import { Zap, Tag, Mail, Webhook, Database, ChevronDown, ChevronRight, Check, PlusCircle, Trash2, Link2, Braces, X } from 'lucide-react'
import { useTranslation } from '../i18n'

interface ActionNodeData {
  actionType?: 'tag' | 'subscribe' | 'notify' | 'webhook' | 'custom_field' | 'email' | 'airtable' | 'zapier' | 'google_sheets'
  toolType?: 'email' | 'webhook' | 'airtable' | 'zapier' | 'google_sheets'
  value?: string
  listId?: string
  webhookUrl?: string
  webhookMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  webhookHeaders?: Array<{ id: string; key: string; value: string }>
  webhookBodyType?: 'form' | 'json' | 'none'
  webhookBodyJson?: string
  webhookBodyForm?: Array<{ id: string; key: string; value: string }>
  fieldName?: string
  fieldValue?: string
  label?: string
  // Notify fields
  recipients?: string[]
  notifySubject?: string
  notifyBody?: string
  notifyBodyDesign?: any // Store Unlayer JSON design for re-editing
  teamMembers?: Array<{ id: string; name: string; email: string }>
}

// Email validator used to ensure only real emails are shown as recipient pills
const EMAIL_RE = /^(?:[a-zA-Z0-9_'^&/+-])+(?:\.(?:[a-zA-Z0-9_'^&/+-])+)*@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/

const sanitizeEmails = (list?: string[]) => {
  if (!Array.isArray(list)) return []
  const unique = Array.from(new Set(list.filter((e) => typeof e === 'string')))
  // Allow valid emails OR variables (e.g., {email}, {contact_email})
  return unique.filter((e) => EMAIL_RE.test(e) || (e.startsWith('{') && e.endsWith('}')))
}

function ActionNode({ data, selected, id }: any) {
  const { t } = useTranslation('automation')
  const nodeId = useNodeId()
  // Standalone port: no live tag list — the free-text input below still works.
  const availableTags: string[] = []

  // Check if handle has an edge connected
  const hasMainEdge = useStore((s) =>
    nodeId ? s.edges.some((e) => e.source === nodeId) : false
  )

  const { getNodes, getEdges, setNodes } = useReactFlow()
  const updateNodeInternals = useUpdateNodeInternals()
  const [isEditing, setIsEditing] = useState(false)
  const [showTypeMenu, setShowTypeMenu] = useState(false)
  const typeMenuRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const recipientsMenuRef = useRef<HTMLDivElement | null>(null)
  const [showRecipientsMenu, setShowRecipientsMenu] = useState(false)
  const [showTagDropdown, setShowTagDropdown] = useState(false)
  const tagDropdownRef = useRef<HTMLDivElement | null>(null)
  const [customEmailInput, setCustomEmailInput] = useState('')
  // Standalone port: team members come from whatever the node data stored.
  const [teamMembers] = useState<Array<{ id: string; name: string; email: string }>>(
    Array.isArray(data.teamMembers) ? data.teamMembers : []
  )
  const [showMethodPicker, setShowMethodPicker] = useState(false)
  const [showHeadersSection, setShowHeadersSection] = useState(false)
  const [showBodySection, setShowBodySection] = useState(false)
  const [testingRequest, setTestingRequest] = useState(false)
  const [testResponse, setTestResponse] = useState<any>(null)
  const [showTestResponse, setShowTestResponse] = useState(false)
  const editorContainerId = `editor-${id}`
  const [formData, setFormData] = useState({
    actionType: (data.actionType === 'subscribe' ? 'notify' : (data.actionType || 'tag')) as any,
    value: data.value || '',
    listId: data.listId || '',
    webhookUrl: data.webhookUrl || '',
    webhookMethod: (data.webhookMethod || 'POST') as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    webhookHeaders: Array.isArray(data.webhookHeaders) ? data.webhookHeaders : [],
    webhookBodyType: (data.webhookBodyType || 'form') as 'form' | 'json' | 'none',
    webhookBodyJson: data.webhookBodyJson || '',
    webhookBodyForm: Array.isArray(data.webhookBodyForm) ? data.webhookBodyForm : [],
    fieldName: data.fieldName || '',
    fieldValue: data.fieldValue || '',
    recipients: sanitizeEmails(data.recipients as string[]),
    notifySubject: data.notifySubject || '',
    notifyBody: data.notifyBody || '',
    notifyBodyDesign: data.notifyBodyDesign || null
  })

  // Keep recipients sanitized if older graphs bring legacy placeholder entries
  useEffect(() => {
    const cleaned = sanitizeEmails(formData.recipients as string[])
    if (cleaned.length !== (formData.recipients || []).length) {
      setFormData({ ...formData, recipients: cleaned })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.recipients])

  // Update node internals when action type changes to recalculate node size
  useEffect(() => {
    if (nodeId) {
      // Use double requestAnimationFrame + small timeout to ensure DOM has fully updated
      // First frame: wait for React to apply className changes
      // Second frame: ensure DOM has been painted with new styles
      // Small timeout: ensure browser has applied CSS changes
      let frameId2: number | null = null
      let timeoutId: ReturnType<typeof setTimeout> | null = null
      const frameId1 = requestAnimationFrame(() => {
        frameId2 = requestAnimationFrame(() => {
          timeoutId = setTimeout(() => {
            updateNodeInternals(nodeId)
          }, 10)
        })
      })
      return () => {
        cancelAnimationFrame(frameId1)
        if (frameId2 !== null) {
          cancelAnimationFrame(frameId2)
        }
        if (timeoutId !== null) {
          clearTimeout(timeoutId)
        }
      }
    }
  }, [formData.actionType, nodeId, updateNodeInternals])

  // Helpers to keep headers in sync with body type like iOS Shortcuts does
  const upsertContentType = (mime: string) => {
    const list = [...(formData.webhookHeaders || [])]
    const idx = list.findIndex(h => h.key?.toLowerCase() === 'content-type')
    if (idx >= 0) list[idx] = { ...list[idx], key: list[idx].key || 'Content-Type', value: mime }
    else list.push({ id: `h-${Date.now()}`, key: 'Content-Type', value: mime })
    setFormData({ ...formData, webhookHeaders: list })
  }

  const removeContentTypeIf = (predicate: (v: string) => boolean) => {
    const list = [...(formData.webhookHeaders || [])]
    const filtered = list.filter(h => h.key?.toLowerCase() !== 'content-type' || !predicate(String(h.value || '')))
    if (filtered.length !== list.length) setFormData({ ...formData, webhookHeaders: filtered })
  }

  const handleBodyTypeChange = (t: 'form' | 'json' | 'none') => {
    // Update body type and adjust Content-Type accordingly
    if (t === 'json') {
      upsertContentType('application/json')
    } else if (t === 'form') {
      upsertContentType('application/x-www-form-urlencoded')
    } else {
      // If no body, remove JSON/form content-type if present
      removeContentTypeIf(v => /json|x-www-form-urlencoded/i.test(v))
    }
    setFormData({ ...formData, webhookBodyType: t })
  }

  // Get available variables from contact fields and preceding AI Extractor nodes
  const getAvailableVariables = (): Array<{ value: string; label: string; category: string }> => {
    const variables: Array<{ value: string; label: string; category: string }> = []

    // Add contact field variables (always available)
    const contactFields = [
      { value: '{username}', label: 'Username', category: 'Contact' },
      { value: '{first_name}', label: 'First Name', category: 'Contact' },
      { value: '{last_name}', label: 'Last Name', category: 'Contact' },
      { value: '{full_name}', label: 'Full Name', category: 'Contact' },
      { value: '{email}', label: 'Email', category: 'Contact' },
      { value: '{phone}', label: 'Phone', category: 'Contact' },
      { value: '{company}', label: 'Company', category: 'Contact' },
      { value: '{chatlog}', label: 'Chat Log', category: 'System' },
    ]
    variables.push(...contactFields)

    // Find preceding AI Extractor nodes by traversing edges backwards
    const nodes = getNodes()
    const edges = getEdges()

    const findPrecedingNodes = (nodeId: string, targetType: string): Node[] => {
      const visited = new Set<string>()
      const precedingNodes: Node[] = []

      const traverse = (currentId: string) => {
        if (visited.has(currentId)) return
        visited.add(currentId)

        // Find all edges that point to the current node
        const incomingEdges = edges.filter(edge => edge.target === currentId)

        for (const edge of incomingEdges) {
          const sourceNode = nodes.find(n => n.id === edge.source)
          if (sourceNode) {
            if (sourceNode.type === targetType) {
              precedingNodes.push(sourceNode)
            }
            // Continue traversing backwards
            traverse(sourceNode.id)
          }
        }
      }

      traverse(nodeId)
      return precedingNodes
    }

    const precedingExtractorNodes = findPrecedingNodes(id, 'aiExtractor')

    precedingExtractorNodes.forEach((extractorNode) => {
      const fields = (extractorNode.data?.fields || []) as any[]
      fields.forEach((field: any) => {
        let fieldName = ''
        if (field.type === 'custom' && field.customName) {
          fieldName = field.customName
        } else if (field.type === 'contact_field' && field.contactFieldKey) {
          fieldName = field.contactFieldKey
        } else if (field.type === 'phone') {
          fieldName = 'Phone'
        } else if (field.type === 'email') {
          fieldName = 'Email'
        } else if (field.type === 'first_name') {
          fieldName = 'First Name'
        } else if (field.type === 'last_name') {
          fieldName = 'Last Name'
        } else if (field.type === 'company') {
          fieldName = 'Company'
        }

        if (fieldName) {
          variables.push({
            value: `{${fieldName.toLowerCase().replace(/\s+/g, '_')}}`,
            label: fieldName,
            category: 'AI Extracted'
          })
        }
      })
    })

    return variables
  }

  const actionTypes = [
    {
      value: 'tag',
      label: t('actionNode.addTag'),
      icon: Tag,
      description: t('actionNode.addTagDescription')
    },
    {
      value: 'notify',
      label: t('actionNode.sendNotification'),
      icon: Mail,
      description: t('actionNode.sendNotificationDescription')
    },
    {
      value: 'webhook',
      label: t('actionNode.callWebhook'),
      icon: Zap,
      description: t('actionNode.callWebhookDescription')
    },
    {
      value: 'custom_field',
      label: t('actionNode.setCustomField'),
      icon: Tag,
      description: t('actionNode.setCustomFieldDescription')
    }
  ];

  // Close menus and auto-save when clicking outside the node
  useEffect(() => {
    const onDocPointerDown = (e: Event) => {
      const target = e.target as HTMLElement
      if (showTypeMenu && typeMenuRef.current && !typeMenuRef.current.contains(target)) {
        setShowTypeMenu(false)
      }
      if (showRecipientsMenu && recipientsMenuRef.current && !recipientsMenuRef.current.contains(target)) {
        setShowRecipientsMenu(false)
      }
    }
    document.addEventListener('pointerdown', onDocPointerDown, true)
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true)
  }, [showTypeMenu, showRecipientsMenu, isEditing, formData])

  const handleTestRequest = async () => {
    if (!formData.webhookUrl) {
      alert(t('actionNode.pleaseEnterUrlFirst'))
      return
    }

    setTestingRequest(true)
    setTestResponse(null)

    try {
      const response = await fetch('/api/test-webhook-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: formData.webhookUrl,
          method: formData.webhookMethod,
          headers: formData.webhookHeaders,
          bodyType: formData.webhookBodyType,
          bodyJson: formData.webhookBodyJson,
          bodyForm: formData.webhookBodyForm
        })
      })

      const data = await response.json()
      setTestResponse(data)
      setShowTestResponse(true)
    } catch (error: any) {
      setTestResponse({
        success: false,
        error: error.message || 'Failed to test request'
      })
      setShowTestResponse(true)
    } finally {
      setTestingRequest(false)
    }
  }

  const handleSave = async () => {
    // Update the node in React Flow immutably
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                ...formData,
              },
            }
          : n
      )
    )

    setIsEditing(false)
    setShowMethodPicker(false)
    setShowHeadersSection(false)
    setShowBodySection(false)
  }

  // If this node loses selection while editing (e.g., user clicks canvas or another node), auto-save and exit edit
  useEffect(() => {
    if (!selected && isEditing) {
      handleSave()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const getActionIcon = () => {
    // If it's a tool node, show tool-specific icon
    if (data.toolType) {
      switch (data.toolType) {
        case 'google_sheets':
          return <Database className="w-5 h-5 text-green-600" />
        case 'email':
          return <Mail className="w-5 h-5 text-gray-600" />
        case 'webhook':
          return <Webhook className="w-5 h-5 text-gray-600" />
        case 'airtable':
          return <Database className="w-5 h-5 text-gray-600" />
        case 'zapier':
          return <Zap className="w-5 h-5 text-gray-600" />
        default:
          return <Zap className="w-5 h-5 text-gray-600" />
      }
    }
    const currentType = isEditing ? formData.actionType : (data.actionType === 'subscribe' ? 'notify' : data.actionType)
    const actionType = actionTypes.find(t => t.value === (currentType as any))
    const Icon = actionType?.icon || Zap
    return <Icon className="w-5 h-5 text-gray-600" />
  }

  const getActionDescription = () => {
    // If it's a tool node, show tool-specific description
    if (data.toolType) {
      switch (data.toolType) {
        case 'google_sheets':
          return t('actionNode.googleSheetsDescription')
        case 'email':
          return t('actionNode.emailDescription')
        case 'webhook':
          return t('actionNode.webhookDescription')
        case 'airtable':
          return t('actionNode.airtableDescription')
        case 'zapier':
          return t('actionNode.zapierDescription')
        default:
          return t('actionNode.toolIntegration')
      }
    }

    const effType = data.actionType === 'subscribe' ? 'notify' : data.actionType
    switch (effType) {
      case 'tag':
        return `${t('actionNode.tag')} ${data.value || t('actionNode.noTagSpecified')}`
      case 'notify':
        const validCount = Array.isArray(data.recipients) ? data.recipients.filter((e: string) => EMAIL_RE.test(e) || (e.startsWith('{') && e.endsWith('}'))).length : 0
        return `${t('actionNode.notify')} ${validCount > 0 ? `${validCount} ${t('actionNode.recipient')}` : t('actionNode.recipient')}${data.notifySubject ? ` • ${t('actionNode.subject')} ${data.notifySubject}` : ''}`
      case 'webhook':
        const method = (data.webhookMethod || 'POST')
        const raw = typeof data.webhookUrl === 'string' ? data.webhookUrl.trim() : ''
        let host = ''
        if (raw) {
          try {
            host = new URL(raw).hostname
          } catch {
            // Try with protocol prefix
            try { host = new URL(`https://${raw}`).hostname } catch { host = raw }
          }
        }
        return `${t('actionNode.webhook')} ${method}${host ? ` ${host}` : ''}`
      case 'custom_field':
        return `${t('actionNode.set')} ${data.fieldName || 'field'}: ${data.fieldValue || 'value'}`
      default:
        return t('actionNode.noActionConfigured')
    }
  }

  // Check if this is a tag action for conditional styling
  const isTagAction = data.actionType === 'tag' || formData.actionType === 'tag'

  return (
    <div
      ref={containerRef}
      onClick={(e) => {
        const t = e.target as HTMLElement
        if (t.closest('.react-flow__handle')) return
        if (!isEditing) setIsEditing(true)
      }}
      className={`relative bg-white rounded-3xl shadow-lg border-2 overflow-visible ${
        isTagAction ? 'min-w-[320px] max-w-[400px]' : 'min-w-[520px] max-w-[700px]'
      } ${
      selected ? 'border-gray-900' : 'border-gray-200'
    }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-8 h-8 bg-gray-600 border-4 border-white shadow-lg"
      />

      <div className={isTagAction ? 'p-4 pr-6' : 'p-6 pr-10'}>
        {/* Header with action icon and heading */}
        <div className={`flex items-center justify-between relative ${isTagAction ? 'mb-3' : 'mb-4'}`}>
          <div className="flex items-center pr-10">
            {getActionIcon()}
            <h3 className="text-xl font-semibold text-gray-900 ml-3">
              {data.toolType ? t('actionNode.toolType', { type: data.toolType.charAt(0).toUpperCase() + data.toolType.slice(1) }) : t('actionNode.action')}
            </h3>
          </div>
          {isEditing && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleSave()
              }}
              className="nodrag nopan absolute top-0 right-0 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              title={t('actionNode.close')}
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="space-y-4">
        {isEditing ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('actionNode.actionType')}
              </label>
              <div className="relative -mr-2" ref={typeMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowTypeMenu((s) => !s)}
                  className="nodrag nopan w-full text-left text-base border border-gray-300 rounded-md px-3 py-2 pr-10 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent hover:border-gray-400 flex items-center"
                >
                  <span className="flex-1">{actionTypes.find(t => t.value === formData.actionType)?.label}</span>
                  <span className={`absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none`}>
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showTypeMenu ? 'rotate-180' : ''}`} />
                  </span>
                </button>
                {showTypeMenu && (
                  <div className="absolute z-30 mt-1 w-[360px] right-[-8px] bg-white border border-gray-200 rounded-md shadow-lg">
                    <div className="max-h-72 overflow-auto py-1">
                      {actionTypes.map((type) => {
                        const Icon = type.icon
                        const selected = formData.actionType === type.value
                        return (
                          <button
                            key={type.value}
                            type="button"
                            onClick={() => { setFormData({ ...formData, actionType: type.value as any }); setShowTypeMenu(false) }}
                            className={`w-full px-4 py-3 text-left text-sm hover:bg-gray-50 flex items-center justify-between ${selected ? 'bg-gray-50' : ''}`}
                          >
                            <span className="flex items-center gap-2">
                              <Icon className="w-4 h-4 text-gray-600" />
                              <span className="text-gray-900">{type.label}</span>
                            </span>
                            {selected && <Check className="w-4 h-4 text-blue-600" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {actionTypes.find(t => t.value === formData.actionType)?.description}
              </p>
            </div>

            {formData.actionType === 'tag' && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {t('actionNode.tagName')}
                </label>
                <div className="relative" ref={tagDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowTagDropdown((s) => !s)}
                    className="nodrag nopan w-full flex items-center gap-2 px-3 py-2 text-left text-sm border border-gray-300 rounded-md bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  >
                    <Tag className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <span className="flex-1 truncate text-gray-700">
                      {formData.value && availableTags.includes(formData.value)
                        ? formData.value
                        : availableTags.length > 0
                          ? t('actionNode.selectTag')
                          : t('actionNode.noTagsAvailable')}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${showTagDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showTagDropdown && (
                    <>
                      <div
                        className="fixed inset-0 z-[60]"
                        onClick={() => setShowTagDropdown(false)}
                        aria-hidden="true"
                      />
                      <div className="absolute left-0 right-0 top-full mt-1 z-[70] w-full min-w-0 max-h-48 overflow-y-auto bg-white rounded-lg shadow-lg border border-gray-200">
                        <div className="p-1.5">
                          {availableTags.length > 0 ? (
                            availableTags.map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => {
                                  setFormData({ ...formData, value: tag })
                                  setShowTagDropdown(false)
                                }}
                                className={`nodrag nopan w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                                  formData.value === tag
                                    ? 'bg-gray-900 text-white'
                                    : 'text-gray-700 hover:bg-gray-50'
                                }`}
                              >
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${formData.value === tag ? 'bg-white' : 'bg-gray-300'}`} />
                                <span className="truncate">{tag}</span>
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-4 text-center text-sm text-gray-400">
                              {t('actionNode.noTagsAvailable')}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <input
                  type="text"
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                  placeholder={t('actionNode.tagPlaceholder')}
                  className="nodrag nopan w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            )}

            {/* Removed 'subscribe' option and its fields */}

            {formData.actionType === 'notify' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-1">{t('actionNode.whoShouldGetNotification')}</label>
                  {/* Selected recipient pills */}
                  {Array.isArray(formData.recipients) && formData.recipients.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {formData.recipients.map((email, idx) => (
                        <span key={idx} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                          {email}
                          <button className="ml-2 text-red-700 hover:text-red-900" onClick={() => setFormData({ ...formData, recipients: formData.recipients!.filter(e => e !== email) })}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="relative" ref={recipientsMenuRef}>
                    <button
                      type="button"
                      onClick={() => setShowRecipientsMenu((s) => !s)}
                      className="nodrag nopan w-full text-left text-sm border border-gray-300 rounded-md px-3 py-2 pr-10 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent hover:border-gray-400 flex items-center justify-between"
                    >
                      <span className="text-gray-700">{t('actionNode.selectRecipients')}</span>
                      <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showRecipientsMenu ? 'rotate-180' : ''}`} />
                    </button>
                    {showRecipientsMenu && (
                      <div className="absolute z-30 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-4 space-y-4 max-h-[500px] overflow-y-auto">
                        {/* Variables Section - Now First and More Prominent */}
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                          <p className="text-sm font-semibold text-gray-800 mb-2">📧 {t('actionNode.insertVariableAsRecipient')}</p>
                          <p className="text-xs text-gray-600 mb-3">{t('actionNode.insertVariableDescription')}</p>
                          <div className="space-y-2">
                            {(() => {
                              const allVariables = getAvailableVariables()
                              const categories = Array.from(new Set(allVariables.map(v => v.category)))
                              return categories.map((category) => {
                                const categoryVars = allVariables.filter(v => v.category === category)
                                return (
                                  <div key={category}>
                                    <p className="text-[10px] text-gray-500 mb-1.5 uppercase tracking-wide font-medium">{category}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {categoryVars.map((v) => (
                                        <button
                                          key={v.value}
                                          type="button"
                                          onClick={() => {
                                            // Add variable directly as recipient
                                            const variableValue = v.value
                                            if (!(formData.recipients || []).includes(variableValue)) {
                                              setFormData({ ...formData, recipients: [...(formData.recipients || []), variableValue] })
                                            }
                                          }}
                                          className="px-2.5 py-1.5 text-xs rounded-md border border-blue-300 bg-white text-blue-700 hover:bg-blue-100 font-mono shadow-sm"
                                        >
                                          {v.value}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )
                              })
                            })()}
                          </div>
                        </div>

                        {/* Custom Email Input */}
                        <div>
                          <p className="text-xs font-medium text-gray-700 mb-2">✉️ {t('actionNode.customEmailOrVariable')}</p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={customEmailInput}
                              onChange={(e) => setCustomEmailInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const v = customEmailInput.trim()
                                  // Allow variables (starting with {) or valid emails
                                  const isVariable = v.startsWith('{') && v.endsWith('}')
                                  const isEmail = /^(?:[a-zA-Z0-9_'^&/+-])+(?:\.(?:[a-zA-Z0-9_'^&/+-])+)*@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/.test(v)
                                  if ((isEmail || isVariable) && !(formData.recipients || []).includes(v)) {
                                    setFormData({ ...formData, recipients: [...(formData.recipients || []), v] })
                                    setCustomEmailInput('')
                                  }
                                }
                              }}
                              placeholder={t('actionNode.customEmailPlaceholder')}
                              className="nodrag nopan flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const v = customEmailInput.trim()
                                // Allow variables (starting with {) or valid emails
                                const isVariable = v.startsWith('{') && v.endsWith('}')
                                const isEmail = /^(?:[a-zA-Z0-9_'^&/+-])+(?:\.(?:[a-zA-Z0-9_'^&/+-])+)*@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/.test(v)
                                if ((isEmail || isVariable) && !(formData.recipients || []).includes(v)) {
                                  setFormData({ ...formData, recipients: [...(formData.recipients || []), v] })
                                  setCustomEmailInput('')
                                }
                              }}
                              className="px-3 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 text-sm"
                            >
                              {t('actionNode.add')}
                            </button>
                          </div>
                        </div>

                        {/* Team members multi-select */}
                        <div>
                          <p className="text-xs font-medium text-gray-700 mb-2">👥 {t('actionNode.teamMembers')}</p>
                          <div className="max-h-48 overflow-auto divide-y divide-gray-100 border border-gray-200 rounded-md">
                            {(teamMembers.length > 0 ? teamMembers : []).map(tm => {
                              const checked = (formData.recipients || []).includes(tm.email)
                              return (
                                <label key={tm.id} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                                  <span className="text-gray-800">{tm.name} <span className="text-gray-500">• {tm.email}</span></span>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                      const list = new Set(formData.recipients || [])
                                      if (e.target.checked) list.add(tm.email); else list.delete(tm.email)
                                      setFormData({ ...formData, recipients: Array.from(list) })
                                    }}
                                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                  />
                                </label>
                              )
                            })}
                            {teamMembers.length === 0 && (
                              <div className="px-3 py-2 text-xs text-gray-500">{t('actionNode.noTeamMembers')}</div>
                            )}
                          </div>
                        </div>

                        <div className="flex justify-end pt-2 border-t border-gray-200">
                          <button type="button" onClick={() => setShowRecipientsMenu(false)} className="text-sm px-4 py-2 rounded-md bg-gray-900 text-white hover:bg-gray-800">{t('actionNode.done')}</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-1">{t('actionNode.subjectLine')}</label>
                  <div className="mb-2">
                    <p className="text-xs text-gray-500 mb-2">{t('actionNode.availableVariables')}</p>
                    <div className="space-y-2">
                      {(() => {
                        const allVariables = getAvailableVariables()
                        const categories = Array.from(new Set(allVariables.map(v => v.category)))
                        return categories.map((category) => {
                          const categoryVars = allVariables.filter(v => v.category === category)
                          return (
                            <div key={category}>
                              <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">{category}</p>
                              <div className="flex flex-wrap gap-1">
                                {categoryVars.map((v) => (
                                  <button
                                    key={v.value}
                                    type="button"
                                    onClick={() => setFormData({
                                      ...formData,
                                      notifySubject: (formData.notifySubject || '') + v.value
                                    })}
                                    className="px-2.5 py-1 text-xs font-medium rounded-full bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 border border-blue-200 hover:from-blue-100 hover:to-blue-200 hover:shadow-sm transition-all font-mono"
                                  >
                                    {v.value}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  </div>
                  <textarea rows={2}

                    value={formData.notifySubject}
                    onChange={(e) => setFormData({ ...formData, notifySubject: e.target.value })}
                    placeholder={t('actionNode.subjectLinePlaceholder')}
                    className="nodrag nopan w-full text-base resize-y border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-2">{t('actionNode.emailBody')}</label>

                  {/* Editor.js container (standalone port: Editor.js not bundled) */}
                  <div className="nodrag nopan">
                    <div id={editorContainerId} className="bg-white" />
                  </div>
                </div>
              </div>
            )}

            {formData.actionType === 'webhook' && (
              <div className="space-y-3">
                <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                  <div className="divide-y divide-gray-100">
                    {/* URL Row */}
                    <div className="px-3 py-2">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-blue-50 text-blue-600">
                          <Link2 className="w-3.5 h-3.5" />
                        </span>
                        <span className="text-sm text-gray-700">{t('actionNode.url')}</span>
                      </div>
                      <input
                        type="url"
                        value={formData.webhookUrl}
                        onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
                        placeholder={t('actionNode.urlPlaceholder')}
                        className={`nodrag nopan w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-2 ${(() => { const v=(formData.webhookUrl||'').trim(); if (!v) return 'border-gray-300 focus:ring-blue-600'; try { new URL(v); return 'border-gray-300 focus:ring-blue-600'; } catch { return 'border-rose-300 focus:ring-rose-500'; } })()}`}
                      />
                      <div className="mt-2">
                        <p className="text-xs text-gray-500 mb-2">{t('actionNode.availableVariables')}</p>
                        <div className="space-y-2">
                          {(() => {
                            const allVariables = getAvailableVariables()
                            const categories = Array.from(new Set(allVariables.map(v => v.category)))
                            return categories.map((category) => {
                              const categoryVars = allVariables.filter(v => v.category === category)
                              return (
                                <div key={category}>
                                  <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">{category}</p>
                                  <div className="flex flex-wrap gap-1">
                                    {categoryVars.map((v) => (
                                      <button
                                        key={v.value}
                                        type="button"
                                        onClick={() => setFormData({
                                          ...formData,
                                          webhookUrl: (formData.webhookUrl || '') + v.value
                                        })}
                                        className="px-1.5 py-0.5 text-[10px] rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 font-mono"
                                      >
                                        {v.value}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )
                            })
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Method Row (compact) */}
                    <button
                      type="button"
                      className="nodrag nopan w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50"
                      onClick={() => setShowMethodPicker((s) => !s)}
                    >
                      <span className="flex items-center gap-2 text-sm text-gray-700">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-gray-100 text-gray-600">
                          <Zap className="w-3.5 h-3.5" />
                        </span>
                        {t('actionNode.method')}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-xs rounded-full border ${(() => { switch(formData.webhookMethod){ case 'POST': return 'bg-blue-50 text-blue-700 border-blue-200'; case 'PUT': return 'bg-amber-50 text-amber-700 border-amber-200'; case 'PATCH': return 'bg-teal-50 text-teal-700 border-teal-200'; case 'DELETE': return 'bg-rose-50 text-rose-700 border-rose-200'; default: return 'bg-gray-100 text-gray-800 border-gray-200'; } })()}`}>{formData.webhookMethod}</span>
                        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showMethodPicker ? 'rotate-90' : ''}`} />
                      </span>
                    </button>
                    {showMethodPicker && (
                      <div className="px-3 pb-2 pt-1 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="flex flex-wrap gap-2">
                          {(['GET','POST','PUT','PATCH','DELETE'] as const).map(m => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => {
                                const next = { ...formData, webhookMethod: m } as typeof formData
                                // Adjust body type
                                if (m === 'GET') {
                                  (next as any).webhookBodyType = 'none'
                                } else if (next.webhookBodyType === 'none') {
                                  next.webhookBodyType = 'form'
                                }
                                // Sync Content-Type header based on body
                                let headers = [...(next.webhookHeaders || [])]
                                const idx = headers.findIndex(h => h.key?.toLowerCase() === 'content-type')
                                const setHeader = (mime: string) => {
                                  if (idx >= 0) headers[idx] = { ...headers[idx], key: headers[idx].key || 'Content-Type', value: mime }
                                  else headers.push({ id: `h-${Date.now()}`, key: 'Content-Type', value: mime })
                                }
                                const removeIf = (re: RegExp) => {
                                  headers = headers.filter(h => h.key?.toLowerCase() !== 'content-type' || !re.test(String(h.value || '')))
                                }
                                if (m === 'GET') {
                                  removeIf(/json|x-www-form-urlencoded/i)
                                } else if (next.webhookBodyType === 'json') {
                                  setHeader('application/json')
                                } else if (next.webhookBodyType === 'form') {
                                  setHeader('application/x-www-form-urlencoded')
                                }
                                next.webhookHeaders = headers
                                setFormData(next)
                                setShowMethodPicker(false)
                              }}
                              className={`px-2.5 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                                formData.webhookMethod === m
                                  ? (() => { switch(m){ case 'POST': return 'bg-blue-600 text-white border-blue-600'; case 'PUT': return 'bg-amber-600 text-white border-amber-600'; case 'PATCH': return 'bg-teal-600 text-white border-teal-600'; case 'DELETE': return 'bg-rose-600 text-white border-rose-600'; default: return 'bg-gray-900 text-white border-gray-900'; } })()
                                  : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Headers Row */}
                    <button
                      type="button"
                      className="nodrag nopan w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50"
                      onClick={() => setShowHeadersSection((s) => !s)}
                    >
                      <span className="flex items-center gap-2 text-sm text-gray-700">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-gray-100 text-gray-600">
                          <Tag className="w-3.5 h-3.5" />
                        </span>
                        {t('actionNode.headers')}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{
                          (formData.webhookHeaders || []).length > 0
                            ? `${(formData.webhookHeaders || [])[0]?.key || '1 header'}${(formData.webhookHeaders || []).length > 1 ? `, +${(formData.webhookHeaders || []).length - 1}` : ''}`
                            : t('actionNode.none')
                        }</span>
                        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showHeadersSection ? 'rotate-90' : ''}`} />
                      </span>
                    </button>
                    {showHeadersSection && (
                      <div className="px-3 pb-3 pt-2 bg-gray-50 space-y-3 rounded-lg border border-gray-100">
                        {(formData.webhookHeaders || []).map((h, idx) => (
                          <div key={h.id || idx} className="space-y-1">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={h.key}
                                onChange={(e) => {
                                  const list = [...(formData.webhookHeaders || [])]
                                  list[idx] = { ...list[idx], key: e.target.value }
                                  setFormData({ ...formData, webhookHeaders: list })
                                }}
                                placeholder={t('actionNode.headerNamePlaceholder')}
                                className="nodrag nopan flex-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                              />
                              <input
                                type="text"
                                value={h.value}
                                onChange={(e) => {
                                  const list = [...(formData.webhookHeaders || [])]
                                  list[idx] = { ...list[idx], value: e.target.value }
                                  setFormData({ ...formData, webhookHeaders: list })
                                }}
                                placeholder={t('actionNode.valuePlaceholder')}
                                className="nodrag nopan flex-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const list = [...(formData.webhookHeaders || [])]
                                  list.splice(idx, 1)
                                  setFormData({ ...formData, webhookHeaders: list })
                                }}
                                className="p-2 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
                                title={t('actionNode.removeHeader')}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="space-y-1 pl-1">
                              {(() => {
                                const allVariables = getAvailableVariables()
                                const categories = Array.from(new Set(allVariables.map(v => v.category)))
                                return categories.map((category) => {
                                  const categoryVars = allVariables.filter(v => v.category === category)
                                  return (
                                    <div key={category}>
                                      <p className="text-[9px] text-gray-400 mb-0.5 uppercase tracking-wide">{category}</p>
                                      <div className="flex flex-wrap gap-1">
                                        {categoryVars.map((v) => (
                                          <button
                                            key={v.value}
                                            type="button"
                                            onClick={() => {
                                              const list = [...(formData.webhookHeaders || [])]
                                              list[idx] = { ...list[idx], value: (list[idx].value || '') + v.value }
                                              setFormData({ ...formData, webhookHeaders: list })
                                            }}
                                            className="px-1.5 py-0.5 text-[10px] rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 font-mono"
                                          >
                                            {v.value}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )
                                })
                              })()}
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 font-medium rounded-full bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 border border-blue-200 hover:from-blue-100 hover:to-blue-200 hover:shadow-sm transition-all"
                          onClick={() => setFormData({
                            ...formData,
                            webhookHeaders: [...(formData.webhookHeaders || []), { id: `h-${Date.now()}`, key: '', value: '' }]
                          })}
                        >
                          <PlusCircle className="w-3.5 h-3.5" /> {t('actionNode.addHeader')}
                        </button>
                      </div>
                    )}

                    {/* Request Body Row */}
                    <button
                      type="button"
                      className={`nodrag nopan w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 ${formData.webhookMethod === 'GET' ? 'opacity-60 cursor-not-allowed' : ''}`}
                      onClick={() => { if (formData.webhookMethod !== 'GET') setShowBodySection((s) => !s) }}
                    >
                      <span className="flex items-center gap-2 text-sm text-gray-700">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-gray-100 text-gray-600">
                          <Braces className="w-3.5 h-3.5" />
                        </span>
                        {t('actionNode.requestBody')}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={`text-xs ${formData.webhookBodyType === 'none' ? 'text-gray-500' : 'text-gray-900'}`}>{formData.webhookBodyType === 'form' ? `${t('actionNode.form')} • ${(formData.webhookBodyForm || []).length}` : formData.webhookBodyType === 'json' ? t('actionNode.json') : t('actionNode.none')}</span>
                        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showBodySection ? 'rotate-90' : ''}`} />
                      </span>
                    </button>
                    {showBodySection && (
                      <div className="px-3 pb-3 pt-2 bg-gray-50 rounded-lg border border-gray-100">
                        {formData.webhookBodyType !== 'none' && (
                          <div className="mb-2 flex gap-2">
                            {(['form','json'] as const).map(bodyType => (
                              <button
                                key={bodyType}
                                type="button"
                                onClick={() => handleBodyTypeChange(bodyType)}
                                className={`px-2.5 py-1.5 rounded-full border text-xs font-medium ${
                                  formData.webhookBodyType === bodyType ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
                                }`}
                              >
                                {bodyType === 'form' ? t('actionNode.form') : t('actionNode.json')}
                              </button>
                            ))}
                          </div>
                        )}

                        {formData.webhookBodyType === 'none' ? (
                          <p className="text-xs text-gray-500">{t('actionNode.getIgnoresBody')}</p>
                        ) : formData.webhookBodyType === 'json' ? (
                          <div>
                            <div className="mb-2">
                              <p className="text-xs text-gray-500 mb-2">{t('actionNode.availableVariables')}</p>
                              <div className="space-y-2">
                                {(() => {
                                  const allVariables = getAvailableVariables()
                                  const categories = Array.from(new Set(allVariables.map(v => v.category)))
                                  return categories.map((category) => {
                                    const categoryVars = allVariables.filter(v => v.category === category)
                                    return (
                                      <div key={category}>
                                        <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">{category}</p>
                                        <div className="flex flex-wrap gap-1">
                                          {categoryVars.map((v) => (
                                            <button
                                              key={v.value}
                                              type="button"
                                              onClick={() => setFormData({
                                                ...formData,
                                                webhookBodyJson: (formData.webhookBodyJson || '') + v.value
                                              })}
                                              className="px-2.5 py-1 text-xs font-medium rounded-full bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 border border-blue-200 hover:from-blue-100 hover:to-blue-200 hover:shadow-sm transition-all font-mono"
                                            >
                                              {v.value}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )
                                  })
                                })()}
                              </div>
                            </div>
                            <textarea
                              value={formData.webhookBodyJson}
                              onChange={(e) => setFormData({ ...formData, webhookBodyJson: e.target.value })}
                              placeholder='{"key":"value"}'
                              rows={5}
                              className={`nodrag nopan w-full font-mono text-xs resize-none border rounded-md px-3 py-2 focus:outline-none focus:ring-2 ${(() => { try { if (!formData.webhookBodyJson) return 'border-gray-300 focus:ring-blue-600'; JSON.parse(formData.webhookBodyJson); return 'border-gray-300 focus:ring-blue-600'; } catch { return 'border-rose-300 focus:ring-rose-500'; } })()}`}
                            />
                            <p className="mt-1 text-[11px] text-gray-500">
                              {t('actionNode.pasteRawJson')}
                            </p>
                          </div>
                        ) : (
                          <div>
                            <div className="space-y-3">
                              {(formData.webhookBodyForm || []).map((f, idx) => (
                                <div key={f.id || idx} className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={f.key}
                                      onChange={(e) => {
                                        const list = [...(formData.webhookBodyForm || [])]
                                        list[idx] = { ...list[idx], key: e.target.value }
                                        setFormData({ ...formData, webhookBodyForm: list })
                                      }}
                                      placeholder={t('actionNode.fieldNamePlaceholder')}
                                      className="nodrag nopan flex-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                                    />
                                    <input
                                      type="text"
                                      value={f.value}
                                      onChange={(e) => {
                                        const list = [...(formData.webhookBodyForm || [])]
                                        list[idx] = { ...list[idx], value: e.target.value }
                                        setFormData({ ...formData, webhookBodyForm: list })
                                      }}
                                      placeholder={t('actionNode.valuePlaceholder')}
                                      className="nodrag nopan flex-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const list = [...(formData.webhookBodyForm || [])]
                                        list.splice(idx, 1)
                                        setFormData({ ...formData, webhookBodyForm: list })
                                      }}
                                      className="p-2 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
                                      title={t('actionNode.removeField')}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                  <div className="space-y-1 pl-1">
                                    {(() => {
                                      const allVariables = getAvailableVariables()
                                      const categories = Array.from(new Set(allVariables.map(v => v.category)))
                                      return categories.map((category) => {
                                        const categoryVars = allVariables.filter(v => v.category === category)
                                        return (
                                          <div key={category}>
                                            <p className="text-[9px] text-gray-400 mb-0.5 uppercase tracking-wide">{category}</p>
                                            <div className="flex flex-wrap gap-1">
                                              {categoryVars.map((v) => (
                                                <button
                                                  key={v.value}
                                                  type="button"
                                                  onClick={() => {
                                                    const list = [...(formData.webhookBodyForm || [])]
                                                    list[idx] = { ...list[idx], value: (list[idx].value || '') + v.value }
                                                    setFormData({ ...formData, webhookBodyForm: list })
                                                  }}
                                                  className="px-1.5 py-0.5 text-[10px] rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 font-mono"
                                                >
                                                  {v.value}
                                                </button>
                                              ))}
                                            </div>
                                          </div>
                                        )
                                      })
                                    })()}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() => setFormData({ ...formData, webhookBodyForm: [...(formData.webhookBodyForm || []), { id: `f-${Date.now()}`, key: '', value: '' }] })}
                                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 font-medium rounded-full bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 border border-blue-200 hover:from-blue-100 hover:to-blue-200 hover:shadow-sm transition-all"
                              >
                                <PlusCircle className="w-3.5 h-3.5" /> {t('actionNode.addField')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Test Request Button */}
                    <div className="px-3 pb-3 pt-2 border-t border-gray-200">
                      <button
                        type="button"
                        onClick={handleTestRequest}
                        disabled={testingRequest || !formData.webhookUrl}
                        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center justify-center gap-2"
                      >
                        {testingRequest ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            {t('actionNode.testing')}
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4" />
                            {t('actionNode.testRequest')}
                          </>
                        )}
                      </button>
                    </div>

                    {/* Test Response Display */}
                    {showTestResponse && testResponse && (
                      <div className="px-3 pb-3">
                        <div className="bg-gray-900 rounded-lg p-3 text-white">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-300">{t('actionNode.response')}</span>
                            <button
                              type="button"
                              onClick={() => setShowTestResponse(false)}
                              className="text-gray-400 hover:text-white text-xs"
                            >
                              ✕
                            </button>
                          </div>
                          {testResponse.success === false ? (
                            <div className="text-xs text-red-400">
                              <p className="font-medium mb-1">{t('actionNode.error')}</p>
                              <p>{testResponse.error}</p>
                            </div>
                          ) : (
                            <>
                              <div className="text-xs mb-2">
                                <span className={`inline-block px-2 py-0.5 rounded ${testResponse.status >= 200 && testResponse.status < 300 ? 'bg-green-600' : 'bg-red-600'}`}>
                                  {testResponse.status}
                                </span>
                                <span className="ml-2 text-gray-400">{testResponse.statusText}</span>
                              </div>
                              <div className="max-h-40 overflow-auto">
                                <pre className="text-xs text-gray-300 whitespace-pre-wrap break-words">
                                  {typeof testResponse.data === 'string'
                                    ? testResponse.data
                                    : JSON.stringify(testResponse.data, null, 2)}
                                </pre>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {formData.actionType === 'custom_field' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('actionNode.fieldName')}
                  </label>
                  <input
                    type="text"
                    value={formData.fieldName}
                    onChange={(e) => setFormData({...formData, fieldName: e.target.value})}
                    placeholder={t('actionNode.fieldNameInputPlaceholder')}
                    className="nodrag nopan w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('actionNode.fieldValue')}
                  </label>
                  <input
                    type="text"
                    value={formData.fieldValue}
                    onChange={(e) => setFormData({...formData, fieldValue: e.target.value})}
                    placeholder={t('actionNode.fieldValuePlaceholder')}
                    className="nodrag nopan w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </>
            )}

            {/* Auto-saves on outside click; no explicit Save/Cancel buttons */}
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-gray-900 mb-1">
              {data.actionType === 'subscribe' ? t('actionNode.sendNotification') : (actionTypes.find(actionType => actionType.value === (data.actionType as any))?.label || t('actionNode.action'))}
            </p>
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 break-words border border-gray-200">
              {getActionDescription()}
            </div>
          </div>
        )}
        </div>
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
          {t('actionNode.nextStep')}
        </div>
      )}
    </div>
  )
}

export default memo(ActionNode)
