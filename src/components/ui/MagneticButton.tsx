import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useRef, ReactNode } from 'react';

interface MagneticButtonProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

const MagneticButton = ({ children, className = '', onClick }: MagneticButtonProps) => {
  const ref = useRef<HTMLButtonElement>(null);
  
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  
  const springConfig = { damping: 15, stiffness: 150 };
  const xSpring = useSpring(x, springConfig);
  const ySpring = useSpring(y, springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!ref.current) return;
    
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const distanceX = e.clientX - centerX;
    const distanceY = e.clientY - centerY;
    
    x.set(distanceX * 0.3);
    y.set(distanceY * 0.3);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.button
      ref={ref}
      style={{ x: xSpring, y: ySpring }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className={`relative overflow-hidden transition-colors ${className}`}
      whileTap={{ scale: 0.98 }}
    >
      <span className="relative z-10">{children}</span>
      <motion.div
        className="absolute inset-0 bg-accent/20 rounded-lg"
        initial={{ scale: 0, opacity: 0 }}
        whileHover={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
      />
    </motion.button>
  );
};

export default MagneticButton;
