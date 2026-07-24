import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Mail, Webhook, Zap, Hourglass, Tag, FormInput } from 'lucide-react'
import IntegrationLogo from '../icons/IntegrationLogo'

// --- Icons inlined from BooSend's components/icons/ (copied verbatim so the
// port stays self-contained inside nodes/; visuals are identical). ---

function MultiMessageIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      viewBox="0 0 104.88 53.25"
      className={className}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <clipPath id="81ee95cb3d">
          <path d="M 0.667969 23.886719 L 104.09375 23.886719 L 104.09375 51.992188 L 0.667969 51.992188 Z M 0.667969 23.886719 " clipRule="nonzero"/>
        </clipPath>
        <clipPath id="980cbca2ae">
          <path d="M 0.667969 0 L 38.386719 0 L 38.386719 17 L 0.667969 17 Z M 0.667969 0 " clipRule="nonzero"/>
        </clipPath>
        <clipPath id="dc32a75cc7">
          <path d="M 0.667969 0 L 38.019531 0 L 38.019531 16 L 0.667969 16 Z M 0.667969 0 " clipRule="nonzero"/>
        </clipPath>
        <clipPath id="808d22d547">
          <rect x="0" width="39" y="0" height="17"/>
        </clipPath>
      </defs>
      <g clipPath="url(#81ee95cb3d)">
        <path
          fill="currentColor"
          d="M 95.703125 23.886719 L 11.980469 23.886719 C 7.300781 23.886719 3.507812 27.679688 3.507812 32.359375 L 3.507812 46.683594 C 3.507812 49.734375 0.695312 50.769531 0.695312 50.769531 C 4.027344 52.09375 6.617188 49.175781 6.617188 49.175781 C 8.078125 50.371094 9.945312 51.089844 11.980469 51.089844 L 95.703125 51.089844 C 100.382812 51.089844 104.175781 47.296875 104.175781 42.617188 L 104.175781 32.359375 C 104.175781 27.679688 100.382812 23.886719 95.703125 23.886719 Z M 95.703125 23.886719 "
          fillOpacity="1"
          fillRule="nonzero"
        />
      </g>
      <g clipPath="url(#980cbca2ae)">
        <g transform="matrix(1, 0, 0, 1, 0, 0)">
          <g clipPath="url(#808d22d547)">
            <g clipPath="url(#dc32a75cc7)">
              <path
                fill="currentColor"
                d="M 3.265625 11.753906 L 3.265625 6.863281 L 3.328125 6.898438 C 3.808594 3.042969 7.097656 0.0546875 11.085938 0.0546875 L 30.199219 0.0078125 C 34.515625 0.0078125 38.019531 3.507812 38.019531 7.828125 L 38.019531 7.953125 C 38.019531 12.269531 34.515625 15.769531 30.199219 15.769531 L 11.085938 15.820312 C 9.207031 15.820312 7.484375 15.15625 6.136719 14.050781 L 6.136719 14.054688 C 6.136719 14.054688 3.746094 16.75 0.667969 15.523438 C 0.667969 15.523438 3.265625 14.566406 3.265625 11.753906 Z M 3.265625 11.753906 "
                fillOpacity="1"
                fillRule="nonzero"
              />
            </g>
          </g>
        </g>
      </g>
    </svg>
  )
}

function FollowUpIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 108 129.000003"
      className={className}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <clipPath id="fu-clip1">
          <path d="M 0.414062 0 L 104.609375 0 L 104.609375 28 L 0.414062 28 Z M 0.414062 0" clipRule="nonzero" />
        </clipPath>
        <clipPath id="fu-clip2">
          <rect x="0" width="59" y="0" height="95" />
        </clipPath>
      </defs>
      <g clipPath="url(#fu-clip1)">
        <path
          fill="currentColor"
          d="M 96.046875 0 L 11.796875 0 C 7.089844 0 3.273438 3.816406 3.273438 8.523438 L 3.273438 22.941406 C 3.273438 26.007812 0.441406 27.054688 0.441406 27.054688 C 3.796875 28.386719 6.398438 25.449219 6.398438 25.449219 L 6.398438 25.445312 C 7.871094 26.652344 9.75 27.375 11.796875 27.375 L 96.046875 27.375 C 100.753906 27.375 104.570312 23.558594 104.570312 18.847656 L 104.570312 8.523438 C 104.570312 3.816406 100.753906 0 96.046875 0 Z M 96.046875 0"
          fillOpacity="1"
          fillRule="nonzero"
        />
      </g>
      <g transform="matrix(1, 0, 0, 1, 33, 18)">
        <g clipPath="url(#fu-clip2)">
          <g fill="currentColor" fillOpacity="1">
            <g transform="translate(5.941127, 64.809082)">
              <path d="M 16.390625 -12.546875 C 16.785156 -13.898438 17.296875 -15.023438 17.921875 -15.921875 C 18.546875 -16.828125 19.363281 -17.613281 20.375 -18.28125 C 21.382812 -18.945312 22.738281 -19.601562 24.4375 -20.25 L 27.859375 -21.625 C 29.335938 -22.195312 30.507812 -22.953125 31.375 -23.890625 C 32.25 -24.828125 32.898438 -26.039062 33.328125 -27.53125 C 33.859375 -29.363281 33.597656 -31.023438 32.546875 -32.515625 C 31.503906 -34.003906 29.75 -35.101562 27.28125 -35.8125 C 23.007812 -37.039062 19.273438 -36.0625 16.078125 -32.875 L 15.34375 -32.90625 L 13.171875 -37.125 C 17.671875 -41.039062 22.820312 -42.160156 28.625 -40.484375 C 31.539062 -39.648438 33.859375 -38.472656 35.578125 -36.953125 C 37.296875 -35.429688 38.410156 -33.726562 38.921875 -31.84375 C 39.429688 -29.96875 39.390625 -28.007812 38.796875 -25.96875 C 38.128906 -23.65625 37.050781 -21.859375 35.5625 -20.578125 C 34.082031 -19.296875 32.140625 -18.175781 29.734375 -17.21875 L 26.75 -16.046875 C 25.5625 -15.578125 24.632812 -15.125 23.96875 -14.6875 C 23.300781 -14.257812 22.769531 -13.738281 22.375 -13.125 C 21.988281 -12.519531 21.65625 -11.722656 21.375 -10.734375 L 21.109375 -9.859375 L 16.03125 -11.3125 Z M 14.109375 4.390625 C 12.960938 4.054688 12.144531 3.46875 11.65625 2.625 C 11.175781 1.789062 11.09375 0.835938 11.40625 -0.234375 C 11.707031 -1.273438 12.289062 -2.039062 13.15625 -2.53125 C 14.03125 -3.019531 15.039062 -3.097656 16.1875 -2.765625 C 17.34375 -2.429688 18.15625 -1.84375 18.625 -1 C 19.101562 -0.15625 19.1875 0.800781 18.875 1.875 C 18.5625 2.9375 17.976562 3.703125 17.125 4.171875 C 16.269531 4.648438 15.265625 4.722656 14.109375 4.390625 Z M 14.109375 4.390625" />
            </g>
          </g>
        </g>
      </g>
    </svg>
  )
}

// Boosend Forms tool icon. Wraps the Lucide `FormInput` glyph.
function FormsIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return <FormInput className={className} />
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <img
      src="/Telegram.png"
      alt="Telegram"
      className={className || 'w-5 h-5'}
      style={{ objectFit: 'contain' }}
    />
  )
}

interface ToolNodeData {
  toolType:
    | 'google_sheets'
    | 'google_calendar'
    | 'google_gmail'
    | 'microsoft_outlook'
    | 'calendly'
    | 'calcom'
    | 'tidycal'
    | 'zoho'
    | 'notion'
    | 'email'
    | 'webhook'
    | 'airtable'
    | 'zapier'
    | 'delay_response'
    | 'follow_up'
    | 'multi_message'
    | 'add_tag'
    | 'set_lead_status'
    | 'elevenlabs'
    | 'minimax'
    | 'inworld'
    | 'heygen'
    | 'shopify_products'
    | 'human_in_the_loop'
    | 'jotform'
    | 'boosend_form'
    | 'enrich_profile'
  label?: string
  config?: any
}

function ToolNode({ data, selected }: any) {
  const getToolIcon = () => {
    switch (data.toolType) {
      case 'google_sheets':
        return <IntegrationLogo name="google-sheets" className="w-6 h-6" />
      case 'notion':
        return <IntegrationLogo name="notion" className="w-6 h-6" />
      case 'calendly':
        return <IntegrationLogo name="calendly" className="w-6 h-6" />
      case 'calcom':
        return <IntegrationLogo name="calcom" className="w-6 h-6" />
      case 'tidycal':
        return <IntegrationLogo name="tidycal" className="w-6 h-6" />
      case 'zoho':
        return <IntegrationLogo name="zoho" className="w-6 h-6" />
      case 'shopify_products':
        return <IntegrationLogo name="shopify" className="w-6 h-6" />
      case 'google_calendar':
        return <IntegrationLogo name="google-calendar" className="w-6 h-6" />
      case 'google_gmail':
        return <IntegrationLogo name="google-gmail" className="w-6 h-6" />
      case 'microsoft_outlook':
        return <IntegrationLogo name="outlook" className="w-6 h-6" />
      case 'email':
        return <Mail className="w-5 h-5 text-white" />
      case 'webhook':
        return <Webhook className="w-5 h-5 text-white" />
      case 'airtable':
        return <IntegrationLogo name="airtable" className="w-6 h-6" />
      case 'zapier':
        return <Zap className="w-5 h-5 text-white" />
      case 'delay_response':
        return <Hourglass className="w-5 h-5 text-white" />
      case 'follow_up':
        return <FollowUpIcon className="w-6 h-6 text-white" />
      case 'multi_message':
        return <MultiMessageIcon className="w-6 h-6 text-white" />
      case 'elevenlabs':
        return <IntegrationLogo name="elevenlabs" className="w-6 h-6" />
      case 'minimax':
        return <IntegrationLogo name="minimax" className="w-6 h-6" />
      case 'inworld':
        return <IntegrationLogo name="inworld" className="w-6 h-6" />
      case 'add_tag':
        return <Tag className="w-5 h-5 text-amber-600" />
      case 'set_lead_status':
        return <img src="https://i.postimg.cc/cJnkg6sZ/boosend-logo.png" alt="" className="w-8 h-8 object-contain" />
      case 'heygen':
        return <IntegrationLogo name="heygen" className="w-6 h-6" />
      case 'human_in_the_loop':
        return <TelegramIcon className="w-9 h-9" />
      case 'jotform':
        return <IntegrationLogo name="jotform" className="w-6 h-6" />
      case 'boosend_form':
        return <FormsIcon className="w-6 h-6 text-white" />
      case 'enrich_profile':
        return <IntegrationLogo name="apify" className="w-6 h-6 object-contain" />
      default:
        return <Zap className="w-5 h-5 text-white" />
    }
  }

  const getToolColor = () => {
    switch (data.toolType) {
      case 'google_sheets':
        return selected ? 'bg-white border-green-400' : 'bg-white border-gray-300'
      case 'notion':
        return selected ? 'bg-white border-gray-400' : 'bg-white border-gray-300'
      case 'google_calendar':
        return selected ? 'bg-white border-blue-400' : 'bg-white border-gray-300'
      case 'google_gmail':
        return selected ? 'bg-white border-red-400' : 'bg-white border-gray-300'
      case 'microsoft_outlook':
        return selected ? 'bg-white border-blue-500' : 'bg-white border-gray-300'
      case 'calendly':
        return selected ? 'bg-white border-amber-400' : 'bg-white border-gray-300'
      case 'calcom':
        return selected ? 'bg-white border-blue-400' : 'bg-white border-gray-300'
      case 'tidycal':
        return selected ? 'bg-white border-teal-400' : 'bg-white border-gray-300'
      case 'zoho':
        return selected ? 'bg-white border-emerald-400' : 'bg-white border-gray-300'
      case 'shopify_products':
        return selected ? 'bg-white border-emerald-400' : 'bg-white border-gray-300'
      case 'email':
        return selected ? 'bg-purple-600 border-purple-400' : 'bg-purple-600 border-purple-700'
      case 'webhook':
        return selected ? 'bg-orange-600 border-orange-400' : 'bg-orange-600 border-orange-700'
      case 'airtable':
        return selected ? 'bg-white border-amber-400' : 'bg-white border-gray-300'
      case 'zapier':
        return selected ? 'bg-teal-600 border-teal-400' : 'bg-teal-600 border-teal-700'
      case 'delay_response':
        return selected ? 'bg-[#2e2e2e] border-gray-400' : 'bg-[#2e2e2e] border-gray-700'
      case 'follow_up':
        return selected ? 'bg-black border-gray-400' : 'bg-black border-gray-700'
      case 'multi_message':
        return selected ? 'bg-black border-gray-400' : 'bg-black border-gray-700'
      case 'elevenlabs':
        return selected ? 'bg-white border-blue-400' : 'bg-white border-gray-300'
      case 'minimax':
        return selected ? 'bg-white border-green-400' : 'bg-white border-gray-300'
      case 'inworld':
        return selected ? 'bg-white border-purple-400' : 'bg-white border-gray-300'
      case 'add_tag':
        return selected ? 'bg-white border-amber-400' : 'bg-white border-gray-300'
      case 'set_lead_status':
        return selected ? 'bg-white border-gray-400' : 'bg-white border-gray-300'
      case 'heygen':
        return selected ? 'bg-white border-slate-500' : 'bg-white border-gray-300'
      case 'human_in_the_loop':
        return selected ? 'bg-white border-blue-400' : 'bg-white border-gray-300'
      case 'jotform':
        return selected ? 'bg-white border-orange-400' : 'bg-white border-gray-300'
      case 'boosend_form':
        return selected ? 'bg-black border-gray-400' : 'bg-black border-gray-700'
      case 'enrich_profile':
        return selected ? 'bg-white border-orange-400' : 'bg-white border-gray-300'
      default:
        return selected ? 'bg-gray-600 border-gray-400' : 'bg-gray-600 border-gray-700'
    }
  }

  const getLabel = () => {
    const raw = (data.label || '').toString().trim()
    // Force-update the legacy "Set Lead Status" label to "Set Contact Stage"
    // so saved nodes don't keep showing the old name.
    if (data.toolType === 'set_lead_status') {
      return 'Set Contact Stage'
    }
    // Force "Forms" for the Boosend Forms tool. Nodes created before the label
    // fix have "Tool" stored in data.label, which would otherwise show verbatim.
    if (data.toolType === 'boosend_form') {
      return 'Forms'
    }
    if (raw && raw.toLowerCase() !== 'shopify_products') {
      return raw
    }

    // Normalize legacy labels or empty labels based on tool type
    switch (data.toolType) {
      case 'shopify_products':
        return 'Shopify'
      case 'google_sheets':
        return 'Google Sheets'
      case 'google_calendar':
        return 'Google Calendar'
      case 'google_gmail':
        return 'Gmail'
      case 'microsoft_outlook':
        return 'Outlook'
      case 'calendly':
        return 'Calendly'
      case 'calcom':
        return 'Cal.com'
      case 'tidycal':
        return 'TidyCal'
      case 'zoho':
        return 'Zoho'
      case 'airtable':
        return 'Airtable'
      case 'jotform':
        return 'JotForm'
      default:
        return raw || data.toolType
    }
  }

  return (
    <div className="relative">
      {/* Target handle at the top center */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-blue-500 border-2 border-white shadow-md"
        style={{ top: -6 }}
      />

      {/* Circular tool node */}
      <div
        className={`
          relative rounded-full shadow-xl border-4
          w-16 h-16 flex items-center justify-center
          transition-all duration-200
          ${getToolColor()}
          hover:scale-105 cursor-pointer
        `}
      >
        {getToolIcon()}
      </div>

      {/* Optional label below */}
      {getLabel() && (
        <div className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 whitespace-nowrap pointer-events-none">
          <span className="text-xs font-medium text-gray-700 bg-white px-2 py-1 rounded-md shadow-sm border border-gray-200">
            {getLabel()}
          </span>
        </div>
      )}
    </div>
  )
}

export default memo(ToolNode)
