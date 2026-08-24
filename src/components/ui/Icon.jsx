import {
  LayoutDashboard, BookOpen, Library, Compass, Trophy, UserCog, LifeBuoy,
  Users, GraduationCap, ClipboardCheck, Building2, Settings2,
  BookText, PlayCircle, Upload, FileQuestion, Layers, Link2, Route,
  Check, CheckCircle2, Lock, Clock, AlertTriangle, XCircle, Info, Circle,
  Plus, Pencil, Trash2, Save, ArrowLeft, ArrowRight, ArrowUp, ArrowDown,
  ChevronRight, ChevronDown, X, Search, SlidersHorizontal, Download,
  ExternalLink, Sun, Moon, LogOut, Mail, ShieldCheck, Paperclip,
  FileText, Presentation, Sheet, File, Sparkles, Inbox, Eye, EyeOff,
  TrendingUp, Target, CalendarDays, Hourglass, Ban, RotateCcw,
} from 'lucide-react';

/**
 * The single place a meaning becomes a glyph.
 *
 * Every screen in the product used emoji as its icon set — a house for the
 * dashboard, a padlock for a gated module, a tick for a completion. Emoji
 * render in the OS's own font, so the interface looked different on every
 * machine, the weights never matched the text beside them, they cannot take
 * `currentColor`, and half of them are unreadable at 14px. lucide-react has
 * been a dependency since the prototype and nothing ever imported it.
 *
 * Names here are what the thing MEANS, not what it looks like. A screen asks
 * for `<Icon name="locked" />`; if the padlock is later the wrong metaphor it
 * changes once, here, rather than in fourteen files.
 *
 * Course icons stay emoji on purpose: an admin picks those when they create a
 * course, so they are content, not chrome.
 */

const ICONS = {
  /* navigation */
  dashboard: LayoutDashboard,
  courses: BookOpen,
  library: Library,
  catalog: Compass,
  achievements: Trophy,
  account: UserCog,
  support: LifeBuoy,
  users: Users,
  teaching: GraduationCap,
  review: ClipboardCheck,
  team: Building2,
  curriculum: Layers,
  settings: Settings2,

  /* activity types — these mirror public.activity_type */
  reading: BookText,
  video: PlayCircle,
  submission: Upload,
  quiz: FileQuestion,
  flashcards: Layers,
  matching: Link2,
  scenario: Route,

  /* state */
  done: Check,
  complete: CheckCircle2,
  locked: Lock,
  pending: Clock,
  waiting: Hourglass,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
  empty: Circle,
  blocked: Ban,
  verified: ShieldCheck,

  /* actions */
  add: Plus,
  edit: Pencil,
  remove: Trash2,
  save: Save,
  back: ArrowLeft,
  forward: ArrowRight,
  up: ArrowUp,
  down: ArrowDown,
  expand: ChevronDown,
  next: ChevronRight,
  close: X,
  search: Search,
  filter: SlidersHorizontal,
  download: Download,
  external: ExternalLink,
  retry: RotateCcw,
  show: Eye,
  hide: EyeOff,

  /* chrome */
  light: Sun,
  dark: Moon,
  logout: LogOut,
  email: Mail,
  attachment: Paperclip,
  inbox: Inbox,
  spark: Sparkles,
  trend: TrendingUp,
  target: Target,
  date: CalendarDays,

  /* material kinds — mirror course_materials.kind */
  pdf: FileText,
  pptx: Presentation,
  xlsx: Sheet,
  docx: FileText,
  link: ExternalLink,
  file: File,
};

/**
 * @param name    a key of ICONS. An unknown one renders nothing rather than
 *                throwing: a missing icon is a blemish, a crashed page is an
 *                outage, and these are called from deep inside lists.
 * @param label   gives the icon an accessible name. Without it the icon is
 *                hidden from assistive technology, which is correct for the
 *                overwhelmingly common case where adjacent text already says
 *                what this means — a decorative icon that announces itself
 *                just makes every row read twice.
 * @param size    px. 16 for inline with text, 18 for buttons, 20 for nav,
 *                24+ for feature moments.
 */
export default function Icon({
  name,
  size = 16,
  strokeWidth,
  label,
  className,
  style,
  ...rest
}) {
  const Glyph = ICONS[name];
  if (!Glyph) return null;

  return (
    <Glyph
      size={size}
      /*
       * Lucide's default 2px stroke is heavier than the text it sits beside at
       * UI sizes, which is what makes a lucide icon look bolted on. Scaling
       * the stroke with the glyph keeps its weight matched to the type.
       */
      strokeWidth={strokeWidth ?? (size <= 16 ? 1.75 : size <= 20 ? 1.6 : 1.5)}
      className={className}
      // Never a colour of its own: it inherits, so an icon in a danger button
      // is red and one in a muted row is muted, without either being told.
      style={{ flexShrink: 0, ...style }}
      aria-hidden={label ? undefined : 'true'}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable="false"
      {...rest}
    />
  );
}
