import {
  Type, AlignLeft, Mail, Phone, Hash, Calendar,
  ChevronDown, CheckSquare, ThumbsUp, Star,
  SlidersHorizontal, Upload, Link,
  User, Building2, AtSign, Instagram, Linkedin,
} from 'lucide-react';

// CRM contact field types — these map directly to contact columns
export const CONTACT_FIELD_TYPES = [
  { type: 'contact_first_name', label: 'First Name', description: 'Maps to CRM contact name', icon: User, crmField: 'first_name', defaultSettings: { placeholder: 'John' } },
  { type: 'contact_last_name', label: 'Last Name', description: 'Maps to CRM contact name', icon: User, crmField: 'last_name', defaultSettings: { placeholder: 'Doe' } },
  { type: 'contact_full_name', label: 'Full Name', description: 'Maps to CRM contact name', icon: User, crmField: 'name', defaultSettings: { placeholder: 'John Doe' } },
  { type: 'contact_email', label: 'Email Address', description: 'Maps to CRM contact email', icon: Mail, crmField: 'email', defaultSettings: { placeholder: 'name@example.com' } },
  { type: 'contact_phone', label: 'Phone Number', description: 'Maps to CRM contact phone', icon: Phone, crmField: 'phone', defaultSettings: { placeholder: '+1 (555) 000-0000' } },
  { type: 'contact_business', label: 'Business / Company', description: 'Maps to CRM contact business', icon: Building2, crmField: 'business', defaultSettings: { placeholder: 'Acme Inc.' } },
  { type: 'contact_instagram', label: 'Instagram Handle', description: 'Maps to CRM socials', icon: Instagram, crmField: 'socials.instagram', defaultSettings: { placeholder: '@username' } },
  { type: 'contact_linkedin', label: 'LinkedIn URL', description: 'Maps to CRM socials', icon: Linkedin, crmField: 'socials.linkedin', defaultSettings: { placeholder: 'linkedin.com/in/username' } },
  { type: 'contact_x', label: 'X / Twitter Handle', description: 'Maps to CRM socials', icon: AtSign, crmField: 'socials.x', defaultSettings: { placeholder: '@handle' } },
];

// Generic question types
export const GENERIC_QUESTION_TYPES = [
  { type: 'email', label: 'Email', description: 'Email address input', icon: Mail, defaultSettings: { placeholder: 'name@example.com' } },
  { type: 'phone', label: 'Phone', description: 'Phone number input', icon: Phone, defaultSettings: { placeholder: '+1 (555) 000-0000' } },
  { type: 'number', label: 'Number', description: 'Numeric input', icon: Hash, defaultSettings: { placeholder: '0' } },
  { type: 'date', label: 'Date', description: 'Date picker', icon: Calendar, defaultSettings: {} },
  { type: 'dropdown', label: 'Dropdown', description: 'Single select from options', icon: ChevronDown, defaultSettings: {}, defaultOptions: ['Option 1', 'Option 2', 'Option 3'] },
  { type: 'checkboxes', label: 'Checkboxes', description: 'Multi-select from options', icon: CheckSquare, defaultSettings: {}, defaultOptions: ['Option 1', 'Option 2', 'Option 3'] },
  { type: 'yes_no', label: 'Yes / No', description: 'Binary yes or no choice', icon: ThumbsUp, defaultSettings: {} },
  { type: 'rating', label: 'Rating', description: 'Star rating scale', icon: Star, defaultSettings: { min: 1, max: 5 } },
  { type: 'opinion_scale', label: 'Opinion Scale', description: 'Numbered scale', icon: SlidersHorizontal, defaultSettings: { min: 1, max: 10 } },
  { type: 'file_upload', label: 'File Upload', description: 'Upload files (images, PDFs)', icon: Upload, defaultSettings: { maxSizeMB: 10 } },
  { type: 'url', label: 'Website URL', description: 'URL input with validation', icon: Link, defaultSettings: { placeholder: 'https://' } },
  { type: 'long_text', label: 'Long Text', description: 'Multi-line text area', icon: AlignLeft, defaultSettings: { placeholder: 'Type your answer here...' } },
  { type: 'short_text', label: 'Short Text', description: 'Single line text input', icon: Type, defaultSettings: { placeholder: 'Type your answer here...' } },
];

// Combined list: contact fields first, then generic types
export const QUESTION_TYPES = [...CONTACT_FIELD_TYPES, ...GENERIC_QUESTION_TYPES];

export function getQuestionType(type) {
  return QUESTION_TYPES.find((qt) => qt.type === type);
}

export function createQuestion(type) {
  const qt = getQuestionType(type);
  if (!qt) throw new Error(`Unknown question type: ${type}`);

  // Contact fields get a pre-filled title
  const isContactField = type.startsWith('contact_');
  return {
    id: crypto.randomUUID(),
    type,
    title: isContactField ? qt.label : '',
    description: '',
    required: isContactField,
    options: qt.defaultOptions ? [...qt.defaultOptions] : [],
    settings: { ...qt.defaultSettings },
  };
}
