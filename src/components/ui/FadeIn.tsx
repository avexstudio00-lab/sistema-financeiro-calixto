"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface FadeInProps extends React.HTMLAttributes<HTMLDivElement> {
  delay?: number;
  once?: boolean;
}

export function FadeIn({
  children,
  className,
  delay = 0,
  once = true,
  ...props
}: FadeInProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (once) observer.unobserve(node);
        } else if (!once) {
          setIsVisible(false);
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [once]);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: isVisible ? `${delay}ms` : "0ms" }}
      className={cn(
        "transition-all duration-700 ease-smooth",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
