import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface GradientTextProps {
  children: ReactNode;
  className?: string;
  gradient?: 'primary' | 'accent' | 'mixed';
  animate?: boolean;
}

const gradients = {
  primary: 'from-primary via-primary/80 to-primary',
  accent: 'from-accent via-accent/80 to-accent',
  mixed: 'from-primary via-accent to-primary',
};

const GradientText = ({ 
  children, 
  className = '', 
  gradient = 'mixed',
  animate = false 
}: GradientTextProps) => {
  return (
    <motion.span
      className={`bg-gradient-to-r ${gradients[gradient]} bg-clip-text text-transparent ${
        animate ? 'bg-[length:200%_auto]' : ''
      } ${className}`}
      animate={animate ? {
        backgroundPosition: ['0% center', '100% center', '0% center'],
      } : undefined}
      transition={animate ? {
        duration: 5,
        repeat: Infinity,
        ease: 'linear',
      } : undefined}
    >
      {children}
    </motion.span>
  );
};

export default GradientText;
