import { BookOpen, Brain, Check, Code, Droplet, Dumbbell, Heart, Leaf, Moon, Music, PenLine, Sun, type LucideIcon } from 'lucide-react-native';
import { colors } from '@/theme/tokens';

export const HABIT_ICON_MAP: Record<string, LucideIcon> = {
  book: BookOpen, dumbbell: Dumbbell, droplet: Droplet, moon: Moon, brain: Brain, pen: PenLine, leaf: Leaf, heart: Heart, sun: Sun, music: Music, code: Code, check: Check,
};

export function HabitIcon({ name, size = 18, color = colors.silver }: { name: string; size?: number; color?: string }) {
  const Icon = HABIT_ICON_MAP[name] ?? Check;
  return <Icon size={size} color={color} strokeWidth={1.8} />;
}
