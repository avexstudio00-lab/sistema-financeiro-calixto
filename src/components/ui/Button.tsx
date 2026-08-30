"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-button transition-all duration-200 ease-smooth focus-visible:outline-none focus-visible:ring-4 disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-primary-500 text-white shadow-soft hover:bg-primary-600 active:bg-primary-700 focus-visible:ring-primary-200",
        secondary:
          "bg-transparent text-secondary border-2 border-secondary hover:bg-secondary hover:text-white active:bg-secondary-dark focus-visible:ring-primary-100",
        tertiary:
          "bg-transparent text-primary-700 hover:bg-primary-50 active:bg-primary-100 focus-visible:ring-primary-100",
      },
      size: {
        sm: "h-10 px-4 text-sm",
        md: "h-11 px-5",
        lg: "h-12 px-7 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
