import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface MetallicTextProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'silver' | 'gold' | 'platinum';
  animate?: boolean;
  as?: 'h1' | 'h2' | 'h3' | 'span' | 'p';
}

const MetallicText = ({ 
  children, 
  className, 
  variant = 'silver',
  animate = true,
  as: Component = 'span'
}: MetallicTextProps) => {
  const gradients = {
    silver: `linear-gradient(
      135deg,
      hsl(220 15% 15%) 0%,
      hsl(220 10% 35%) 25%,
      hsl(220 15% 15%) 50%,
      hsl(220 10% 35%) 75%,
      hsl(220 15% 15%) 100%
    )`,
    gold: `linear-gradient(
      135deg,
      hsl(215 65% 40%) 0%,
      hsl(215 55% 30%) 25%,
      hsl(215 70% 45%) 50%,
      hsl(215 55% 30%) 75%,
      hsl(215 65% 40%) 100%
    )`,
    platinum: `linear-gradient(
      135deg,
      hsl(220 10% 20%) 0%,
      hsl(220 10% 40%) 25%,
      hsl(220 10% 20%) 50%,
      hsl(220 10% 40%) 75%,
      hsl(220 10% 20%) 100%
    )`,
  };

  return (
    <motion.span
      initial={animate ? { backgroundPosition: '0% 50%' } : undefined}
      animate={animate ? { backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] } : undefined}
      transition={animate ? { duration: 4, repeat: Infinity, ease: 'easeInOut' } : undefined}
      className={cn(className)}
      style={{
        background: gradients[variant],
        backgroundSize: '200% 200%',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        display: 'inline-block',
      }}
    >
      {children}
    </motion.span>
  );
};

export default MetallicText;
