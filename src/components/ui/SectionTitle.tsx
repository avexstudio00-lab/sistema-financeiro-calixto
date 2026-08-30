import * as React from "react";
import { cn } from "@/lib/utils";

export interface SectionTitleProps {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
}

export function SectionTitle({
  eyebrow,
  title,
  description,
  align = "left",
  className,
}: SectionTitleProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        align === "center" && "items-center text-center",
        className
      )}
    >
      {eyebrow && (
        <span className="text-small font-semibold uppercase tracking-wide text-accent-600">
          {eyebrow}
        </span>
      )}
      <h2 className="text-h2 text-foreground">{title}</h2>
      {description && <p className="max-w-2xl text-body text-muted">{description}</p>}
    </div>
  );
}
