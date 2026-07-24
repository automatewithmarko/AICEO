import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react'
import IntegrationLogo from '../icons/IntegrationLogo'
import { useTranslation } from '../i18n'
import { Handle, Position } from '@xyflow/react'

interface GmailNodeData {
  to?: string
  subject?: string
  body?: string
  bodyType?: 'plain' | 'html'
  cc?: string
  bcc?: string
}

function GmailNode({ data, selected }: any) {
  const { t } = useTranslation('automation')
  const to = data.to?.trim() ? data.to : t('nodeDisplay.addRecipients')
  const subject = data.subject?.trim() ? data.subject : t('nodeDisplay.noSubject')
  const previewBody =
    data.body && data.body.trim().length > 0 ? data.body : t('nodeDisplay.composeEmailBody')

  // --- HTML preview sizing ---
  const containerRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)
  const [scaledHeight, setScaledHeight] = useState<number | undefined>(undefined)

  // Most email templates are designed around ~600px width.
  const BASE_EMAIL_WIDTH = 600

  useLayoutEffect(() => {
    if (data.bodyType !== 'html') return
    if (!containerRef.current || !contentRef.current) return

    const containerEl = containerRef.current
    const contentEl = contentRef.current

    const compute = () => {
      const containerWidth = containerEl.clientWidth
      const nextScale = Math.min(1, containerWidth / BASE_EMAIL_WIDTH)
      setScale(nextScale)

      // Measure "natural" height (unscaled), then set wrapper height to scaled height.
      // scrollHeight works well for HTML content.
      const naturalHeight = contentEl.scrollHeight
      setScaledHeight(Math.ceil(naturalHeight * nextScale))
    }

    compute()

    const ro = new ResizeObserver(() => compute())
    ro.observe(containerEl)
    ro.observe(contentEl)

    return () => ro.disconnect()
  }, [data.bodyType, previewBody])

  // Optional: wrap the HTML in a div that enforces width constraints for common offenders
  const wrappedHtml = useMemo(() => {
    if (data.bodyType !== 'html') return ''
    return `
      <div class="email-preview-root">
        ${previewBody}
      </div>
    `
  }, [data.bodyType, previewBody])

  return (
    <div className="relative w-[320px]">
      <div
        className={`relative z-10 rounded-3xl shadow-lg border-2 w-full transition-colors ${
          selected ? 'border-[#d93025]' : 'border-[#d93025]/60 hover:border-[#d93025]'
        }`}
        style={{ background: '#ffffff' }}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="w-8 h-8 border-4 border-white shadow-lg"
          style={{ background: '#d93025' }}
        />

        <div className="px-4 py-3">
          <div className="flex items-center mb-2 min-w-0 gap-2">
            <div className="w-10 h-10 rounded-2xl bg-white border border-gray-200 flex items-center justify-center shadow-sm">
              <IntegrationLogo name="google-gmail" className="w-7 h-7" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-semibold text-gray-900 leading-tight">{t('nodeDisplay.sendGmail')}</h3>
              <p className="text-xs text-gray-500 break-words">{t('nodeDisplay.toLabel')} {to}</p>
            </div>
          </div>

          <div className="text-xs text-gray-600 mb-2 break-words">
            {t('nodeDisplay.subjectLabel')} <span className="font-medium text-gray-800">{subject}</span>
          </div>

          {/* IMPORTANT: no max-h + no overflow clipping */}
          <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm font-normal text-gray-800 break-words border border-gray-200">
            {data.bodyType === 'html' ? (
              <>
                {/* Scoped CSS to prevent typical email HTML overflow */}
                <style>{`
                  .email-preview-root img,
                  .email-preview-root video,
                  .email-preview-root iframe {
                    max-width: 100% !important;
                    height: auto !important;
                  }
                  .email-preview-root table {
                    max-width: 100% !important;
                    width: 100% !important;
                    table-layout: fixed !important;
                  }
                  .email-preview-root td,
                  .email-preview-root th,
                  .email-preview-root p,
                  .email-preview-root div,
                  .email-preview-root span,
                  .email-preview-root a {
                    overflow-wrap: anywhere;
                    word-break: break-word;
                  }
                `}</style>

                <div ref={containerRef} className="w-full">
                  {/* This wrapper gets an explicit height so scaled content never clips */}
                  <div style={{ height: scaledHeight }} className="w-full">
                    <div
                      style={{
                        transform: `scale(${scale})`,
                        transformOrigin: 'top left',
                        width: BASE_EMAIL_WIDTH, // render as if it were 600px wide
                      }}
                    >
                      <div
                        ref={contentRef}
                        dangerouslySetInnerHTML={{ __html: wrappedHtml }}
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-xs whitespace-pre-wrap">{previewBody}</div>
            )}
          </div>

          <div className="mt-2 text-[11px] text-gray-500">
            {t('nodeDisplay.bodyTypeLabel')}{' '}
            <span className="font-medium">{(data.bodyType || 'plain').toUpperCase()}</span>
          </div>
        </div>

        <Handle
          type="source"
          position={Position.Right}
          id="default"
          className="w-8 h-8 border-4 border-white shadow-lg"
          style={{ background: '#d93025' }}
        />
      </div>
    </div>
  )
}

export default memo(GmailNode)
