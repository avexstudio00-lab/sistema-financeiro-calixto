import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap",
  {
    variants: {
      variant: {
        primary: "bg-primary-50 text-primary-700",
        secondary: "bg-secondary/10 text-secondary",
        accent: "bg-accent-50 text-accent-700",
        warning: "bg-amber-50 text-amber-700",
        danger: "bg-rose-50 text-rose-700",
        neutral: "bg-muted/15 text-muted-foreground",
      },
      size: {
        sm: "px-2.5 py-0.5 text-xs",
        md: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size, className }))} {...props} />;
}

export { Badge, badgeVariants };
