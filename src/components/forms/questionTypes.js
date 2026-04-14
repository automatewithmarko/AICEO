import {
  Type, AlignLeft, Mail, Phone, Hash, Calendar,
  ChevronDown, CheckSquare, ThumbsUp, Star,
  SlidersHorizontal, Upload, Link,
} from 'lucide-react';

export const QUESTION_TYPES = [
  { type: 'short_text', label: 'Short Text', description: 'Single line text input', icon: Type, defaultSettings: { placeholder: 'Type your answer here...' } },
  { type: 'long_text', label: 'Long Text', description: 'Multi-line text area', icon: AlignLeft, defaultSettings: { placeholder: 'Type your answer here...' } },
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
];

export function getQuestionType(type) {
  return QUESTION_TYPES.find((qt) => qt.type === type);
}

export function createQuestion(type) {
  const qt = getQuestionType(type);
  if (!qt) throw new Error(`Unknown question type: ${type}`);
  return {
    id: crypto.randomUUID(),
    type,
    title: '',
    description: '',
    required: false,
    options: qt.defaultOptions ? [...qt.defaultOptions] : [],
    settings: { ...qt.defaultSettings },
  };
}
