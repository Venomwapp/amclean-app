import { motion } from 'framer-motion';
import { ReactNode } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  duration?: number;
  scale?: boolean;
  blur?: boolean;
}

const ScrollReveal = ({ 
  children, 
  className = '', 
  delay = 0,
  direction = 'up',
  duration = 0.6,
  scale = false,
  blur = false,
}: ScrollRevealProps) => {
  const isMobile = useIsMobile();
  
  const mobileDuration = 0.3;
  const mobileDelay = 0;
  
  const finalDuration = isMobile ? mobileDuration : duration;
  const finalDelay = isMobile ? mobileDelay : delay;

  const getInitialPosition = () => {
    const distance = isMobile ? 30 : 60;
    switch (direction) {
      case 'up': return { y: distance };
      case 'down': return { y: -distance };
      case 'left': return { x: distance };
      case 'right': return { x: -distance };
      default: return {};
    }
  };

  const initial = {
    opacity: 0,
    ...getInitialPosition(),
    ...(scale && { scale: 0.95 }),
    ...(blur && !isMobile && { filter: 'blur(10px)' }),
  };

  const animate = {
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
  };

  return (
    <motion.div
      initial={initial}
      whileInView={animate}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ 
        duration: finalDuration,
        delay: finalDelay,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export default ScrollReveal;
