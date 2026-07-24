import { memo, useEffect, useRef, useState } from 'react'
import { Handle, Position, useNodeId, useStore } from '@xyflow/react'
import { Clock } from 'lucide-react'
import { useTranslation } from '../i18n'

interface SmartDelayNodeData {
  delayType?: 'fixed' | 'random' | 'schedule' | 'optimal' | 'business_hours'
  duration?: number
  unit?: 'seconds' | 'minutes' | 'hours' | 'days'
  minDuration?: number
  maxDuration?: number
  timezone?: string
  businessStart?: string
  businessEnd?: string
}

function SmartDelayNode({ data, selected }: any) {
  const { t } = useTranslation('automation')
  const nodeId = useNodeId()

  // Check if handle has an edge connected
  const hasMainEdge = useStore((s) =>
    nodeId ? s.edges.some((e) => e.source === nodeId) : false
  )

  const [isEditing] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [formData, setFormData] = useState<{
    delayType: 'fixed' | 'random' | 'schedule' | 'optimal' | 'business_hours'
    duration: number | undefined
    unit: 'seconds' | 'minutes' | 'hours' | 'days'
    minDuration: number | undefined
    maxDuration: number | undefined
    timezone: string
    businessStart: string
    businessEnd: string
    minTime: string
    maxTime: string
    scheduleTime: string
    scheduleDay: string
  }>({
    delayType: data.delayType || 'fixed',
    duration: data.duration,  // Don't use fallback - let it be undefined if not set
    unit: data.unit || 'seconds',
    minDuration: data.minDuration,  // Don't use fallback - let it be undefined if not set
    maxDuration: data.maxDuration,  // Don't use fallback - let it be undefined if not set
    timezone: data.timezone || 'UTC',
    businessStart: data.businessStart || '09:00',
    businessEnd: data.businessEnd || '17:00',
    // New time-of-day fields for randomized UX (24h "HH:MM")
    minTime: (data as any).minTime || '00:00',
    maxTime: (data as any).maxTime || '02:00',
    // Scheduled mode
    scheduleTime: (data as any).scheduleTime || '09:00',
    scheduleDay: (data as any).scheduleDay || 'any'
  })

  const typeMenuRef = useRef<HTMLDivElement | null>(null)
  const unitMenuRef = useRef<HTMLDivElement | null>(null)
  const dayMenuRef = useRef<HTMLDivElement | null>(null)
  const timezoneMenuRef = useRef<HTMLDivElement | null>(null)
  const [showTypeMenu, setShowTypeMenu] = useState(false)
  const [showUnitMenu, setShowUnitMenu] = useState(false)
  const [showDayMenu, setShowDayMenu] = useState(false)
  const [showTimezoneMenu, setShowTimezoneMenu] = useState(false)
  const timePickerRef = useRef<HTMLDivElement | null>(null)
  const [openTimePicker, setOpenTimePicker] = useState<null | 'min' | 'max' | 'schedule'>(null)

  const delayTypes = [
    {
      value: 'fixed',
      label: t('delayType.fixed'),
      description: t('delayType.fixedDesc')
    },
    {
      value: 'random',
      label: t('delayType.randomized'),
      description: t('delayType.randomizedDesc')
    },
    {
      value: 'schedule',
      label: t('delayType.scheduled'),
      description: t('delayType.scheduledDesc')
    }
  ]

  const timeUnits = [
    { value: 'seconds', label: t('nodeDisplay.seconds') },
    { value: 'minutes', label: t('nodeDisplay.minutes') },
    { value: 'hours', label: t('nodeDisplay.hours') }
  ]

  const handleSave = () => {
    Object.assign(data, formData)
  }

  const updateData = (patch: Partial<typeof formData>) => {
    setFormData((prev) => {
      const next = { ...prev, ...patch }
      Object.assign(data, next)
      return next
    })
  }

  // Sync formData with data prop when it changes (important for agent updates)
  // This ensures when the agent updates delay node data, the UI reflects the changes
  // FIX: Remove the fallback values ?? 30 and ?? 120 to allow undefined values
  useEffect(() => {
    // Convert 0 to 1 for minDuration (0 is not valid)
    let minDuration = data.minDuration === 0 ? 1 : data.minDuration

    // Ensure maxDuration is at least 120 if it's undefined, null, or less than minDuration
    let maxDuration = data.maxDuration
    const effectiveMin = minDuration ?? 1
    if (maxDuration === undefined || maxDuration === null || maxDuration < effectiveMin) {
      maxDuration = 120
    }

    // If we had to fix values, update the data prop (but only if values actually changed)
    const needsFix = data.minDuration === 0 ||
                     (data.maxDuration !== undefined && data.maxDuration !== null && data.maxDuration < effectiveMin) ||
                     (data.maxDuration === undefined || data.maxDuration === null)

    if (needsFix) {
      const fixedMin = minDuration ?? 1
      const fixedMax = maxDuration
      // Only update if values are actually different to avoid loops
      if (data.minDuration !== fixedMin || data.maxDuration !== fixedMax) {
        updateData({ minDuration: fixedMin, maxDuration: fixedMax })
      }
    }

    const newFormData = {
      delayType: data.delayType || 'fixed',
      duration: data.duration,  // No fallback - allow undefined
      unit: data.unit || 'seconds',
      minDuration: minDuration,  // Converted 0 to 1 if needed
      maxDuration: maxDuration,  // Ensured at least 120 if needed
      timezone: data.timezone || 'UTC',
      businessStart: data.businessStart || '09:00',
      businessEnd: data.businessEnd || '17:00',
      minTime: (data as any).minTime || '00:00',
      maxTime: (data as any).maxTime || '02:00',
      scheduleTime: (data as any).scheduleTime || '09:00',
      scheduleDay: (data as any).scheduleDay || 'any'
    }

    // Only update if something actually changed to avoid infinite loops
    // Use strict equality check that works with undefined
    const hasChanged =
      formData.delayType !== newFormData.delayType ||
      formData.duration !== newFormData.duration ||
      formData.unit !== newFormData.unit ||
      formData.minDuration !== newFormData.minDuration ||
      formData.maxDuration !== newFormData.maxDuration

    if (hasChanged) {
      setFormData(newFormData)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.delayType, data.duration, data.unit, data.minDuration, data.maxDuration])

  // If an older canvas has "business_hours" or "optimal", coerce to fixed for the new UX
  useEffect(() => {
    if (formData.delayType !== 'fixed' && formData.delayType !== 'random' && formData.delayType !== 'schedule') {
      updateData({ delayType: 'fixed' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-save when clicking outside the node while editing (capture phase for reliability)
  useEffect(() => {
    const onDocPointerDown = (e: Event) => {
      const target = e.target as HTMLElement
      if (isEditing && containerRef.current && !containerRef.current.contains(target)) {
        handleSave()
      }
      if (showTypeMenu && typeMenuRef.current && !typeMenuRef.current.contains(target)) setShowTypeMenu(false)
      if (showUnitMenu && unitMenuRef.current && !unitMenuRef.current.contains(target)) setShowUnitMenu(false)
      if (showDayMenu && dayMenuRef.current && !dayMenuRef.current.contains(target)) setShowDayMenu(false)
      if (openTimePicker && timePickerRef.current && !timePickerRef.current.contains(target)) setOpenTimePicker(null)
    }
    document.addEventListener('pointerdown', onDocPointerDown, true)
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true)
  }, [isEditing, formData, showTypeMenu, showUnitMenu, showDayMenu])

  // If node loses selection while editing (user clicks canvas/another node), auto-save and exit edit
  useEffect(() => {
    if (!selected && isEditing) {
      handleSave()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const unitLabel = (u?: string) => {
    const val = u || 'minutes'
    const unit = timeUnits.find(tu => tu.value === val)
    return unit ? unit.label : val.charAt(0).toUpperCase() + val.slice(1)
  }

  // Time helpers for custom picker
  const hours12 = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
  const minutes60 = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))
  const parseTo12 = (time: string) => {
    const [hh = '00', mm = '00'] = (time || '00:00').split(':')
    let h = Math.max(0, Math.min(23, parseInt(hh, 10) || 0))
    const period: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM'
    h = h % 12
    if (h === 0) h = 12
    return { hour: String(h).padStart(2, '0'), minute: String(parseInt(mm, 10) || 0).padStart(2, '0'), period }
  }
  const to24 = (hour12: string, minute: string, period: 'AM' | 'PM') => {
    let h = Math.max(1, Math.min(12, parseInt(hour12, 10) || 12))
    if (period === 'AM') {
      h = h % 12
    } else {
      if (h !== 12) h = h + 12
    }
    return `${String(h).padStart(2, '0')}:${String(parseInt(minute, 10) || 0).padStart(2, '0')}`
  }
  const format12 = (time: string) => {
    const t = parseTo12(time)
    return `${t.hour}:${t.minute} ${t.period}`
  }

  // Prevent React Flow canvas from zooming/panning when interacting with the time popover,
  // but still allow native scrolling inside the lists.
  const stopWheel = (e: any) => {
    e.stopPropagation()
  }
  const stopPointer = (e: any) => {
    e.stopPropagation()
  }

  return (
    <div
      ref={containerRef}
      className={`relative inline-block overflow-visible bg-white rounded-3xl shadow-lg border-2 px-4 py-3 ${
      selected ? 'border-gray-900' : 'border-gray-200'
    }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-8 h-8 bg-gray-600 border-4 border-white shadow-lg"
      />

      <div className="px-2">
        {/* Header with clock icon and heading */}
        <div className="flex items-center mb-1">
          <div className="flex items-center">
            <Clock className="w-5 h-5 text-gray-600 mr-2" />
            <h3 className="text-lg font-medium text-gray-900">{t('nodeDisplay.delay')}</h3>
          </div>
        </div>

        <div className="space-y-1.5">
          {/* Single always-on view with interactive inline controls */}
          <div className="text-[16px] leading-7 text-gray-900">
            {t('delayNode.thisIsA')}{' '}
            <span className="relative inline-block" ref={typeMenuRef}>
              <button
                type="button"
                onClick={() => { setShowTypeMenu((s) => !s); setShowUnitMenu(false); setShowDayMenu(false) }}
                className={`bg-gray-900 text-white hover:bg-gray-800 hover:ring-2 hover:ring-gray-700 rounded-full px-3 py-1 text-sm font-semibold transition-colors cursor-pointer`}
              >
                {formData.delayType === 'random' ? t('delayType.randomized') : formData.delayType === 'schedule' ? t('delayType.scheduled') : t('delayType.fixed')}
              </button>
              {showTypeMenu && (
                <div className="absolute z-30 mt-2 left-0 flex gap-2 flex-wrap">
                  {delayTypes.filter(dt => dt.value !== formData.delayType).map((dt) => (
                    <button
                      key={dt.value}
                      type="button"
                      onClick={() => { updateData({ delayType: dt.value as any }); setShowTypeMenu(false) }}
                      className="rounded-full px-3 py-1 text-sm bg-white text-gray-900 border border-gray-300 hover:bg-gray-50 hover:ring-2 hover:ring-gray-300 shadow transition-colors cursor-pointer"
                      title={dt.description}
                    >
                      {dt.label}
                    </button>
                  ))}
                </div>
              )}
            </span>{' '}
            {t('delayNode.delay')}{' '}

            {formData.delayType === 'random' ? (
              <>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span>{t('nodeDisplay.delayBetween')}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={formData.minDuration === undefined ? '' : String(formData.minDuration)}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '')
                      if (raw === '') {
                        // Allow empty during typing
                        setFormData((prev) => ({ ...prev, minDuration: undefined }))
                        return
                      }
                      const min = parseInt(raw, 10)
                      const patch: any = { minDuration: min }
                      // Only auto-adjust maxDuration if it's currently defined and would be invalid
                      if (formData.maxDuration !== undefined && formData.maxDuration < min) {
                        patch.maxDuration = min
                      }
                      updateData(patch)
                    }}
                    onBlur={() => {
                      // On blur, only set default if undefined (truly empty), set to 1 (minimum valid value)
                      if (formData.minDuration === undefined) {
                        updateData({ minDuration: 1 })
                      }
                    }}
                    className="w-14 text-center border-b border-blue-400 bg-transparent focus:outline-none selection:bg-gray-900 selection:text-white"
                  />
                  <span>{t('nodeDisplay.and')}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={formData.maxDuration === undefined ? '' : String(formData.maxDuration)}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '')
                      if (raw === '') {
                        // Allow empty during typing
                        setFormData((prev) => ({ ...prev, maxDuration: undefined }))
                        return
                      }
                      const max = parseInt(raw, 10)
                      // Ensure max is at least as large as min (if min is defined)
                      const minVal = formData.minDuration !== undefined ? formData.minDuration : 1
                      updateData({ maxDuration: Math.max(max, minVal) })
                    }}
                    onBlur={() => {
                      // On blur, only set default if undefined (truly empty), default to 120
                      if (formData.maxDuration === undefined) {
                        updateData({ maxDuration: 120 })
                      }
                    }}
                    className="w-14 text-center border-b border-blue-400 bg-transparent focus:outline-none selection:bg-gray-900 selection:text-white"
                  />
                  <span className="relative inline-block" ref={unitMenuRef}>
                    <button
                      type="button"
                      onClick={() => { setShowUnitMenu((s) => !s); setShowTypeMenu(false); setShowDayMenu(false) }}
                      className={`bg-gray-900 text-white hover:bg-gray-800 hover:ring-2 hover:ring-gray-700 rounded-full px-3 py-1 text-sm font-medium transition-colors cursor-pointer`}
                    >
                      {unitLabel(formData.unit)}
                    </button>
                    {showUnitMenu && (
                      <div className="absolute z-30 mt-2 left-0 flex gap-2 flex-wrap">
                        {timeUnits.filter(u => u.value !== formData.unit).map((u) => (
                          <button
                            key={u.value}
                            type="button"
                            onClick={() => { updateData({ unit: u.value as any }); setShowUnitMenu(false) }}
                            className="rounded-full px-3 py-1 text-sm bg-white text-gray-900 border border-gray-300 hover:bg-gray-50 hover:ring-2 hover:ring-gray-300 shadow transition-colors cursor-pointer"
                          >
                            {u.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </span>
                  <span>.</span>
                </div>
              </>
            ) : formData.delayType === 'schedule' ? (
              <>
                <div className="mt-1 flex items-center gap-2 whitespace-nowrap">
                  <span>{t('nodeDisplay.delayedUntil')}</span>
                  <span className="relative inline-block">
                    <button
                      type="button"
                      onClick={() => { setOpenTimePicker(openTimePicker === 'schedule' ? null : 'schedule'); setShowDayMenu(false); setShowTypeMenu(false); setShowUnitMenu(false) }}
                      className="px-3 py-1 rounded-md text-sm border border-gray-300 bg-white hover:border-gray-400 focus:outline-none"
                    >
                      {format12(formData.scheduleTime)}
                    </button>
                    {openTimePicker === 'schedule' && (
                      <div
                        ref={timePickerRef}
                        className="absolute z-50 mt-2 min-w-[240px] bg-white text-gray-900 border border-gray-200 rounded-lg shadow-lg p-2 whitespace-normal overflow-x-hidden"
                        onWheel={stopWheel}
                        onWheelCapture={stopWheel}
                        onPointerDown={stopPointer}
                        onPointerDownCapture={stopPointer}
                        onPointerMoveCapture={stopPointer}
                        onTouchMoveCapture={stopPointer}
                      >
                        <div className="flex gap-2">
                          <div
                            className="max-h-56 h-40 w-14 overflow-y-auto overscroll-contain pr-1 ring-1 ring-gray-200 rounded-md"
                            onWheel={stopWheel}
                            onWheelCapture={stopWheel}
                            onPointerDown={stopPointer}
                            onPointerDownCapture={stopPointer}
                            onPointerMoveCapture={stopPointer}
                            onTouchMoveCapture={stopPointer}
                          >
                            {hours12.map(h => (
                              <button key={`hs-${h}`} onClick={() => updateData({ scheduleTime: to24(h, parseTo12(formData.scheduleTime).minute, parseTo12(formData.scheduleTime).period) })} className={`${parseTo12(formData.scheduleTime).hour===h ? 'bg-gray-900 text-white' : 'bg-white text-gray-900 hover:bg-gray-100'} block w-full px-2 py-1 rounded-md text-sm font-mono tabular-nums`}>{h}</button>
                            ))}
                          </div>
                          <div
                            className="max-h-56 h-40 w-14 overflow-y-auto overscroll-contain pr-1 ring-1 ring-gray-200 rounded-md"
                            onWheel={stopWheel}
                            onWheelCapture={stopWheel}
                            onPointerDown={stopPointer}
                            onPointerDownCapture={stopPointer}
                            onPointerMoveCapture={stopPointer}
                            onTouchMoveCapture={stopPointer}
                          >
                          {minutes60.map(m => (
                            <button key={`ms-${m}`} onClick={() => updateData({ scheduleTime: to24(parseTo12(formData.scheduleTime).hour, m, parseTo12(formData.scheduleTime).period) })} className={`${parseTo12(formData.scheduleTime).minute===m ? 'bg-gray-900 text-white' : 'bg-white text-gray-900 hover:bg-gray-100'} block w-full px-2 py-1 rounded-md text-sm font-mono tabular-nums`}>{m}</button>
                          ))}
                          </div>
                          <div
                            className="max-h-56 h-40 w-16 overflow-y-auto overscroll-contain pr-1 ring-1 ring-gray-200 rounded-md"
                            onWheel={stopWheel}
                            onWheelCapture={stopWheel}
                            onPointerDown={stopPointer}
                            onPointerDownCapture={stopPointer}
                            onPointerMoveCapture={stopPointer}
                            onTouchMoveCapture={stopPointer}
                          >
                            {(['AM','PM'] as const).map(p => (
                              <button key={`ps-${p}`} onClick={() => updateData({ scheduleTime: to24(parseTo12(formData.scheduleTime).hour, parseTo12(formData.scheduleTime).minute, p) })} className={`${parseTo12(formData.scheduleTime).period===p ? 'bg-gray-900 text-white' : 'bg-white text-gray-900 hover:bg-gray-100'} block w-full px-2 py-1 rounded-md text-sm`}>{p}</button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </span>
                  <span>{t('nodeDisplay.on')}</span>
                  <span className="relative inline-block" ref={dayMenuRef}>
                    <button
                      type="button"
                      onClick={() => { setShowDayMenu((s) => !s); setShowTypeMenu(false); setShowUnitMenu(false) }}
                      className={`bg-gray-900 text-white hover:bg-gray-800 hover:ring-2 hover:ring-gray-700 rounded-full px-3 py-1 text-sm font-medium transition-colors cursor-pointer`}
                    >
                      {(
                        { any: t('days.anyDay'), mon: t('days.monday'), tue: t('days.tuesday'), wed: t('days.wednesday'), thu: t('days.thursday'), fri: t('days.friday'), sat: t('days.saturday'), sun: t('days.sunday') } as Record<string, string>
                      )[formData.scheduleDay] || t('days.anyDay')}
                    </button>
                    {showDayMenu && (
                      <div className="absolute z-30 mt-2 left-0 flex gap-2 flex-wrap">
                        {[
                          { value: 'any', label: t('days.anyDay') },
                          { value: 'mon', label: t('days.monday') },
                          { value: 'tue', label: t('days.tuesday') },
                          { value: 'wed', label: t('days.wednesday') },
                          { value: 'thu', label: t('days.thursday') },
                          { value: 'fri', label: t('days.friday') },
                          { value: 'sat', label: t('days.saturday') },
                          { value: 'sun', label: t('days.sunday') }
                        ].filter(o => o.value !== formData.scheduleDay).map(o => (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => { updateData({ scheduleDay: o.value as any }); setShowDayMenu(false) }}
                            className="rounded-full px-3 py-1 text-sm bg-white text-gray-900 border border-gray-300 hover:bg-gray-50 hover:ring-2 hover:ring-gray-300 shadow transition-colors cursor-pointer"
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </span>
                  <span className="relative inline-block" ref={timezoneMenuRef}>
                    <button
                      type="button"
                      onClick={() => { setShowTimezoneMenu((s) => !s); setShowTypeMenu(false); setShowUnitMenu(false); setShowDayMenu(false) }}
                      className="px-2 py-1 rounded-md text-xs border border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-600"
                      title={t('voiceCall.timezone')}
                    >
                      {formData.timezone || 'UTC'}
                    </button>
                    {showTimezoneMenu && (
                      <div
                        className="absolute z-30 mt-2 left-0 w-48 max-h-64 overflow-y-auto overscroll-contain bg-white border border-gray-200 rounded-lg shadow-lg"
                        onWheel={stopWheel}
                        onWheelCapture={stopWheel}
                        onPointerDown={stopPointer}
                        onPointerDownCapture={stopPointer}
                        onPointerMoveCapture={stopPointer}
                        onTouchMoveCapture={stopPointer}
                      >
                        {[
                          { value: 'UTC', label: 'UTC (Default)' },
                          { value: 'America/New_York', label: 'Eastern (US)' },
                          { value: 'America/Chicago', label: 'Central (US)' },
                          { value: 'America/Denver', label: 'Mountain (US)' },
                          { value: 'America/Los_Angeles', label: 'Pacific (US)' },
                          { value: 'America/Toronto', label: 'Toronto (EST)' },
                          { value: 'America/Mexico_City', label: 'Mexico City' },
                          { value: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
                          { value: 'Europe/London', label: 'London (GMT)' },
                          { value: 'Europe/Paris', label: 'Paris (CET)' },
                          { value: 'Europe/Berlin', label: 'Berlin (CET)' },
                          { value: 'Europe/Istanbul', label: 'Istanbul (TRT)' },
                          { value: 'Europe/Moscow', label: 'Moscow (MSK)' },
                          { value: 'Africa/Cairo', label: 'Cairo (EET)' },
                          { value: 'Africa/Lagos', label: 'Lagos (WAT)' },
                          { value: 'Asia/Dubai', label: 'Dubai (GST)' },
                          { value: 'Asia/Karachi', label: 'Pakistan (PKT)' },
                          { value: 'Asia/Kolkata', label: 'India (IST)' },
                          { value: 'Asia/Dhaka', label: 'Bangladesh (BST)' },
                          { value: 'Asia/Bangkok', label: 'Bangkok (ICT)' },
                          { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
                          { value: 'Asia/Shanghai', label: 'China (CST)' },
                          { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)' },
                          { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
                          { value: 'Asia/Seoul', label: 'Seoul (KST)' },
                          { value: 'Australia/Sydney', label: 'Sydney (AEDT)' },
                          { value: 'Australia/Melbourne', label: 'Melbourne (AEDT)' },
                          { value: 'Pacific/Auckland', label: 'Auckland (NZDT)' }
                        ].map(tz => (
                          <button
                            key={tz.value}
                            type="button"
                            onClick={() => { updateData({ timezone: tz.value }); setShowTimezoneMenu(false) }}
                            className={`block w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${formData.timezone === tz.value ? 'bg-gray-100 font-medium' : ''}`}
                          >
                            {tz.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </span>
                  <span>.</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span>{t('nodeDisplay.delayIs')}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={formData.duration === undefined ? '' : String(formData.duration)}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '')
                      if (raw === '') {
                        // Allow empty during typing
                        setFormData((prev) => ({ ...prev, duration: undefined }))
                        return
                      }
                      const num = parseInt(raw, 10)
                      updateData({ duration: num })
                    }}
                    onBlur={() => {
                      // On blur, only set default if undefined (truly empty) or 0, set to 1
                      if (formData.duration === undefined || formData.duration === 0) {
                        updateData({ duration: 1 })
                      }
                    }}
                    className="w-14 text-center border-b border-blue-400 bg-transparent focus:outline-none selection:bg-gray-900 selection:text-white"
                  />
                  <span className="relative inline-block" ref={unitMenuRef}>
                    <button
                      type="button"
                      onClick={() => { setShowUnitMenu((s) => !s); setShowTypeMenu(false); setShowDayMenu(false) }}
                      className={`bg-gray-900 text-white hover:bg-gray-800 hover:ring-2 hover:ring-gray-700 rounded-full px-3 py-1 text-sm font-medium transition-colors cursor-pointer`}
                    >
                      {unitLabel(formData.unit)}
                    </button>
                    {showUnitMenu && (
                      <div className="absolute z-30 mt-2 left-0 flex gap-2 flex-wrap">
                        {timeUnits.filter(u => u.value !== formData.unit).map((u) => (
                          <button
                            key={u.value}
                            type="button"
                            onClick={() => { updateData({ unit: u.value as any }); setShowUnitMenu(false) }}
                            className="rounded-full px-3 py-1 text-sm bg-white text-gray-900 border border-gray-300 hover:bg-gray-50 hover:ring-2 hover:ring-gray-300 shadow transition-colors cursor-pointer"
                          >
                            {u.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </span>
                  <span>.</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Removed 'then' badge per design; keep connection handle */}
      <div className="absolute right-0 top-1/2 transform -translate-y-1/2 flex items-center">
        <Handle
          type="source"
          position={Position.Right}
          className="w-8 h-8 bg-gray-600 border-4 border-white shadow-lg rounded-full"
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
    </div>
  )
}

export default memo(SmartDelayNode)
