import { motion } from 'framer-motion';
import { ReactNode } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';

interface AnimatedTextProps {
  children: string;
  className?: string;
  delay?: number;
  staggerChildren?: number;
  type?: 'words' | 'chars' | 'lines';
}

const AnimatedText = ({ 
  children, 
  className = '', 
  delay = 0,
  staggerChildren = 0.03,
  type = 'words'
}: AnimatedTextProps) => {
  const isMobile = useIsMobile();
  
  const items = type === 'chars' 
    ? children.split('') 
    : type === 'lines'
    ? children.split('\n')
    : children.split(' ');

  const container = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        delayChildren: isMobile ? 0.05 : delay,
        staggerChildren: isMobile ? 0.01 : staggerChildren,
      },
    },
  };

  const child = {
    hidden: {
      opacity: 0,
      y: isMobile ? 15 : 30,
      ...(isMobile ? {} : { filter: 'blur(10px)' }),
    },
    visible: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: {
        type: 'spring',
        damping: 12,
        stiffness: 100,
      },
    },
  };

  return (
    <motion.span
      className={`inline-flex flex-wrap ${className}`}
      variants={container}
      initial="hidden"
      animate="visible"
    >
      {items.map((item, index) => (
        <motion.span
          key={index}
          variants={child}
          className="inline-block"
        >
          {item}
          {type === 'words' && index < items.length - 1 && '\u00A0'}
        </motion.span>
      ))}
    </motion.span>
  );
};

export default AnimatedText;
