import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';

interface HorizontalScrollSectionProps {
  children: React.ReactNode;
  className?: string;
  panelCount: number;
}

const HorizontalScrollSection = ({ 
  children, 
  className,
  panelCount 
}: HorizontalScrollSectionProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  const x = useTransform(
    scrollYProgress, 
    [0, 1], 
    ['0%', `-${(panelCount - 1) * 100}%`]
  );

  return (
    <section 
      ref={containerRef} 
      className={cn('relative', className)}
      style={{ height: `${panelCount * 100}vh` }}
    >
      <div className="sticky top-0 h-screen overflow-hidden">
        <motion.div 
          style={{ x }}
          className="flex h-full"
        >
          {children}
        </motion.div>
      </div>
    </section>
  );
};

interface HorizontalPanelProps {
  children: React.ReactNode;
  className?: string;
}

export const HorizontalPanel = ({ children, className }: HorizontalPanelProps) => {
  return (
    <div className={cn('flex-shrink-0 w-screen h-full flex items-center justify-center', className)}>
      {children}
    </div>
  );
};

export default HorizontalScrollSection;
