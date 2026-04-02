import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useRef, ReactNode } from 'react';

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: string;
}

const TiltCard = ({ children, className = '', glowColor = 'accent' }: TiltCardProps) => {
  const ref = useRef<HTMLDivElement>(null);
  
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  
  const springConfig = { damping: 20, stiffness: 300 };
  const xSpring = useSpring(x, springConfig);
  const ySpring = useSpring(y, springConfig);

  const rotateX = useTransform(ySpring, [-0.5, 0.5], [10, -10]);
  const rotateY = useTransform(xSpring, [-0.5, 0.5], [-10, 10]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const normalizedX = (e.clientX - centerX) / (rect.width / 2);
    const normalizedY = (e.clientY - centerY) / (rect.height / 2);
    
    x.set(normalizedX);
    y.set(normalizedY);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      style={{
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative group ${className}`}
    >
      {/* Glow effect */}
      <div 
        className={`absolute -inset-0.5 bg-gradient-to-r from-${glowColor} to-primary rounded-2xl blur opacity-0 group-hover:opacity-30 transition-opacity duration-500`}
        style={{ transform: 'translateZ(-10px)' }}
      />
      
      {/* Card content */}
      <div 
        className="relative bg-card rounded-2xl overflow-hidden"
        style={{ transform: 'translateZ(20px)' }}
      >
        {children}
      </div>
    </motion.div>
  );
};

export default TiltCard;
