/**
 * Tag Color Utility
 *
 * Generates consistent colors for tags based on their name.
 * Uses a hash-based approach to ensure the same tag always gets the same color.
 */

/**
 * Tag color definition with Tailwind classes for light and dark modes
 */
export interface TagColor {
  bg: string;
  text: string;
  border: string;
  /** Dark mode variants */
  darkBg: string;
  darkText: string;
  darkBorder: string;
}

/**
 * Predefined color palette for tags
 * Colors are chosen to be visually distinct and accessible
 */
const TAG_COLORS: TagColor[] = [
  {
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    border: 'border-blue-200',
    darkBg: 'dark:bg-blue-900/30',
    darkText: 'dark:text-blue-300',
    darkBorder: 'dark:border-blue-800',
  },
  {
    bg: 'bg-purple-100',
    text: 'text-purple-700',
    border: 'border-purple-200',
    darkBg: 'dark:bg-purple-900/30',
    darkText: 'dark:text-purple-300',
    darkBorder: 'dark:border-purple-800',
  },
  {
    bg: 'bg-green-100',
    text: 'text-green-700',
    border: 'border-green-200',
    darkBg: 'dark:bg-green-900/30',
    darkText: 'dark:text-green-300',
    darkBorder: 'dark:border-green-800',
  },
  {
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    border: 'border-amber-200',
    darkBg: 'dark:bg-amber-900/30',
    darkText: 'dark:text-amber-300',
    darkBorder: 'dark:border-amber-800',
  },
  {
    bg: 'bg-rose-100',
    text: 'text-rose-700',
    border: 'border-rose-200',
    darkBg: 'dark:bg-rose-900/30',
    darkText: 'dark:text-rose-300',
    darkBorder: 'dark:border-rose-800',
  },
  {
    bg: 'bg-cyan-100',
    text: 'text-cyan-700',
    border: 'border-cyan-200',
    darkBg: 'dark:bg-cyan-900/30',
    darkText: 'dark:text-cyan-300',
    darkBorder: 'dark:border-cyan-800',
  },
  {
    bg: 'bg-indigo-100',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    darkBg: 'dark:bg-indigo-900/30',
    darkText: 'dark:text-indigo-300',
    darkBorder: 'dark:border-indigo-800',
  },
  {
    bg: 'bg-emerald-100',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    darkBg: 'dark:bg-emerald-900/30',
    darkText: 'dark:text-emerald-300',
    darkBorder: 'dark:border-emerald-800',
  },
  {
    bg: 'bg-orange-100',
    text: 'text-orange-700',
    border: 'border-orange-200',
    darkBg: 'dark:bg-orange-900/30',
    darkText: 'dark:text-orange-300',
    darkBorder: 'dark:border-orange-800',
  },
  {
    bg: 'bg-teal-100',
    text: 'text-teal-700',
    border: 'border-teal-200',
    darkBg: 'dark:bg-teal-900/30',
    darkText: 'dark:text-teal-300',
    darkBorder: 'dark:border-teal-800',
  },
];

/**
 * Simple hash function for strings
 * @param str - The string to hash
 * @returns A numeric hash value
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash;
}

/**
 * Get a consistent color for a tag based on its name
 * @param tagName - The name of the tag
 * @returns TagColor object with Tailwind classes
 */
export function getTagColor(tagName: string): TagColor {
  const hash = hashString(tagName.toLowerCase());
  const index = Math.abs(hash) % TAG_COLORS.length;
  return TAG_COLORS[index];
}

/**
 * Get combined Tailwind classes for a tag
 * @param tagName - The name of the tag
 * @returns Space-separated Tailwind classes
 */
export function getTagClasses(tagName: string): string {
  const color = getTagColor(tagName);
  return `${color.bg} ${color.text} ${color.border} ${color.darkBg} ${color.darkText} ${color.darkBorder}`;
}
