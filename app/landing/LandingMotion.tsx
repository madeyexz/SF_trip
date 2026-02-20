'use client';

import { useState, useEffect, type ReactNode } from 'react';
import {
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
  useScroll,
  useTransform,
  type Variants,
} from 'framer-motion';

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.06,
    },
  },
};

const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 170,
      damping: 24,
    },
  },
};

const springTransition = {
  type: 'spring',
  stiffness: 320,
  damping: 24,
} as const;

export function MotionProvider({ children }: { children: ReactNode }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}

export function ScrollProgressBar() {
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();

  if (shouldReduceMotion) {
    return null;
  }

  return (
    <m.div
      className="fixed left-0 top-12 z-40 h-px w-full origin-left bg-accent/70"
      style={{ scaleX: scrollYProgress }}
    />
  );
}

export function NavEnter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <nav className={className}>{children}</nav>;
  }

  return (
    <m.nav
      className={className}
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 25 }}
    >
      {children}
    </m.nav>
  );
}

export function InViewStagger({
  children,
  className,
  amount = 0.2,
}: {
  children: ReactNode;
  className?: string;
  amount?: number;
}) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <m.div
      className={className}
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount }}
    >
      {children}
    </m.div>
  );
}

export function FadeItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <m.div className={className} variants={fadeUpVariants}>
      {children}
    </m.div>
  );
}

export function HoverLift({
  children,
  className,
  x = 0,
  y = -2,
  tapScale = 0.985,
}: {
  children: ReactNode;
  className?: string;
  x?: number;
  y?: number;
  tapScale?: number;
}) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <m.div
      className={className}
      whileHover={{ x, y }}
      whileTap={{ scale: tapScale }}
      transition={springTransition}
    >
      {children}
    </m.div>
  );
}

export function HeroParallax({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 0.25], [0, -28]);
  const opacity = useTransform(scrollYProgress, [0, 0.25], [1, 0.9]);

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <m.div
      className={className}
      style={{ y, opacity }}
      whileHover={{ scale: 1.005 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
    >
      {children}
    </m.div>
  );
}

export function ArrowNudge({ children }: { children: ReactNode }) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <span>{children}</span>;
  }

  return (
    <m.span
      animate={{ x: [0, 2, 0] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      {children}
    </m.span>
  );
}

export function TextScramble({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const [text, setText] = useState(shouldReduceMotion ? children : '');

  useEffect(() => {
    if (shouldReduceMotion) return;

    const chars = '!<>-_\\\\/[]{}—=+*^?#_';
    let frame = 0;
    let timeout: NodeJS.Timeout;

    const animate = () => {
      let output = '';
      let complete = 0;
      
      for (let i = 0; i < children.length; i++) {
        if (frame >= children.length * 2 + i * 2) {
          output += children[i];
          complete++;
        } else if (frame >= i * 2) {
          output += chars[Math.floor(Math.random() * chars.length)];
        } else {
          output += '';
        }
      }
      
      setText(output);
      
      if (complete === children.length) {
        return;
      }
      
      frame++;
      timeout = setTimeout(animate, 30);
    };
    
    timeout = setTimeout(animate, 100);
    return () => clearTimeout(timeout);
  }, [children, shouldReduceMotion]);

  return <span className={className}>{text}</span>;
}

export function PulseGlow({
  className,
}: {
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  
  if (shouldReduceMotion) {
    return <div className={className} />;
  }

  return (
    <m.div
      className={className}
      animate={{ opacity: [0.02, 0.06, 0.02] }}
      transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}
