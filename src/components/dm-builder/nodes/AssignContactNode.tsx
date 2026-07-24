import { memo, useEffect, useRef, useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import { UserPlus, ChevronDown } from 'lucide-react'

interface AssignableMember {
  user_id: string
  name: string
  email: string
  avatar_url: string | null
  is_current_user: boolean
}

interface AssignContactNodeData {
  assignToUserId?: string
  assignToUserName?: string
  label?: string
}

function AssignContactNode({ data, selected }: any) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  const [isEditing, setIsEditing] = useState(false)
  // Standalone port: no workspace member list — render the stored value only.
  const members: AssignableMember[] = []
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState(data.assignToUserId || '')

  // Sync from data when node data changes externally
  useEffect(() => {
    setSelectedUserId(data.assignToUserId || '')
  }, [data.assignToUserId])

  // Auto-save when node loses selection
  useEffect(() => {
    if (!selected && isEditing) {
      save()
    }
  }, [selected])

  // Auto-save on click outside
  useEffect(() => {
    const onPointerDown = (e: Event) => {
      const target = e.target as HTMLElement
      if (isEditing && containerRef.current && !containerRef.current.contains(target)) {
        save()
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [isEditing, selectedUserId])

  const save = () => {
    const member = members.find(m => m.user_id === selectedUserId)
    Object.assign(data, {
      ...data,
      assignToUserId: selectedUserId || '',
      assignToUserName: member?.name || data.assignToUserName || '',
      label: member ? `Assign: ${member.name}` : data.label || '',
    })
    setIsEditing(false)
    setDropdownOpen(false)
  }

  const selectedMember = members.find(m => m.user_id === selectedUserId)
  const displayName = selectedMember?.name || data.assignToUserName || ''

  return (
    <div
      ref={containerRef}
      onClick={(e) => {
        const target = e.target as HTMLElement
        if (target.closest('.react-flow__handle')) return
        if (!isEditing) setIsEditing(true)
      }}
      className={`relative rounded-3xl shadow-lg border-2 overflow-visible bg-white ${
        isEditing ? 'min-w-[340px]' : 'min-w-[280px]'
      } ${selected ? 'border-gray-900' : 'border-gray-300 hover:border-gray-400'}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-8 h-8 border-4 border-white shadow-lg"
        style={{ background: '#111827' }}
      />

      <div className="px-4 py-3">
        {/* Header */}
        <div className="flex items-center mb-2 min-w-0">
          <UserPlus className="w-5 h-5 mr-3 text-gray-900 flex-shrink-0" />
          <h3 className="text-lg font-medium text-gray-900 break-words flex-1 min-w-0">
            Assign Team Member
          </h3>
        </div>

        {/* Body */}
        {isEditing ? (
          <div className="mt-2">
            {members.length === 0 && !displayName ? (
              <p className="text-sm text-gray-500 py-2">No team members found.</p>
            ) : (
              <div className="relative custom-dropdown">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDropdownOpen(!dropdownOpen)
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm text-left focus:outline-none focus:ring-2 focus:ring-gray-900 flex items-center justify-between"
                >
                  <span className={selectedUserId || displayName ? 'text-gray-900' : 'text-gray-500'}>
                    {displayName || 'Select team member'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {dropdownOpen && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-auto">
                    <p className="w-full px-3 py-2 text-left text-sm text-gray-500">No team members found.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-1 text-sm text-gray-500 break-words">
            {displayName || 'Click to select team member'}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="default"
        className="w-8 h-8 border-4 border-white shadow-lg"
        style={{ background: '#111827' }}
      />
    </div>
  )
}

export default memo(AssignContactNode)
