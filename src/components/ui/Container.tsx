import * as React from "react";
import { cn } from "@/lib/utils";

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Remove o teto de largura (max-w-6xl) pra ocupar a tela toda — usado nas
   * telas internas do dashboard, que não devem sobrar vazio nas laterais em
   * monitores largos. O site público (landing) continua com o teto padrão. */
  full?: boolean;
}

export function Container({ className, full, ...props }: ContainerProps) {
  return (
    <div
      className={cn("mx-auto w-full px-6 sm:px-8", full ? "max-w-none" : "max-w-6xl", className)}
      {...props}
    />
  );
}
