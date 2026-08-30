import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
} as const;

export interface IconProps extends Omit<React.SVGAttributes<SVGSVGElement>, "size"> {
  icon: LucideIcon;
  size?: keyof typeof sizeMap | number;
  strokeWidth?: number;
}

export function Icon({
  icon: LucideIconComponent,
  size = "md",
  strokeWidth = 1.75,
  className,
  ...props
}: IconProps) {
  const pixelSize = typeof size === "number" ? size : sizeMap[size];
  return (
    <LucideIconComponent
      size={pixelSize}
      strokeWidth={strokeWidth}
      className={cn("shrink-0", className)}
      {...props}
    />
  );
}
