// ESLint (formato "flat config") — Next.js 16 removeu o comando `next lint`.
// Regras oficiais do Next (core-web-vitals + TypeScript).
//
// Migração 14 -> 16 (out/2026): o projeto nunca teve lint configurado. As
// regras abaixo viraram "warn" (aviso) em vez de "error" para a migração não
// alterar lógica do app; ficam como lista de melhorias para depois:
// - react-hooks/set-state-in-effect, immutability, preserve-manual-memoization:
//   regras novas pensadas para o React Compiler (que NÃO está ligado aqui);
// - @next/next/no-sync-scripts: o <script src="/tema-inicial.js"> do layout é
//   síncrono DE PROPÓSITO (aplica o tema antes da 1ª pintura, sem piscar);
// - no-explicit-any, no-unescaped-entities, prefer-const: estilo, sem efeito.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "@next/next/no-sync-scripts": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "react/no-unescaped-entities": "warn",
      "prefer-const": "warn",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "public/**"]),
]);
