"use client";

import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, helperText, error, leftIcon, rightIcon, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-small font-medium text-foreground">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <Icon
              icon={leftIcon}
              size="sm"
              className="pointer-events-none absolute left-3.5 text-muted"
            />
          )}
          <input
            id={inputId}
            ref={ref}
            className={cn(
              "h-11 w-full rounded-xl border bg-white px-4 text-body text-foreground placeholder:text-muted transition-all duration-200 ease-smooth",
              "border-slate-200 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100",
              "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted",
              leftIcon && "pl-10",
              rightIcon && "pr-10",
              error && "border-rose-400 focus:border-rose-500 focus:ring-rose-100",
              className
            )}
            aria-invalid={!!error}
            {...props}
          />
          {rightIcon && (
            <Icon
              icon={rightIcon}
              size="sm"
              className="pointer-events-none absolute right-3.5 text-muted"
            />
          )}
        </div>
        {(helperText || error) && (
          <p className={cn("text-small", error ? "text-rose-600" : "text-muted")}>
            {error ?? helperText}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
