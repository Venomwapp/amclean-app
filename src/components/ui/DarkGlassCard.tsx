import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface DarkGlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
  onClick?: () => void;
}

const DarkGlassCard = ({ 
  children, 
  className, 
  hover = true,
  glow = false,
  onClick
}: DarkGlassCardProps) => {
  return (
    <motion.div
      whileHover={hover ? { y: -5, scale: 1.02 } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      onClick={onClick}
      className={cn(
        'relative rounded-2xl p-6 overflow-hidden cursor-default',
        'bg-card backdrop-blur-xl',
        'border border-border',
        'transition-all duration-500 shadow-sm',
        hover && 'hover:shadow-lg hover:border-accent/20',
        glow && 'hover:shadow-[0_0_40px_-10px_rgba(59,130,246,0.15)]',
        className
      )}
    >
      <div className="relative z-10">
        {children}
      </div>
    </motion.div>
  );
};

export default DarkGlassCard;
