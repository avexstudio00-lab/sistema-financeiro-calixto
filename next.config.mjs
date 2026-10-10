const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  staticPageGenerationTimeout: 120,

  // Headers de segurança aplicados a toda resposta do site. A partir de
  // 10/out/2026 inclui a Content-Security-Policy pedida no item 2.5 da
  // especificação de 09/out/2026 — com os acréscimos necessários para o
  // app não quebrar: Google Fonts (fonte Inter, em style-src/font-src),
  // service worker/manifest do PWA (worker-src/manifest-src) e travas extras
  // (object-src, base-uri, frame-ancestors, form-action).
  async headers() {
    return [
      {
        // Todas as rotas.
        source: "/:path*",
        headers: [
          // Impede que o site seja carregado dentro de um <iframe> de outro
          // domínio (proteção contra clickjacking).
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Frame-Options", value: "DENY" },
          // Impede que o navegador tente "adivinhar" o tipo de um arquivo
          // servido, evitando alguns ataques de MIME-sniffing.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Manda a URL de origem só pra mesma origem em navegação entre
          // sites, sem vazar a URL completa (que pode ter parâmetros) em
          // requisições cross-site.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Desliga o acesso a APIs sensíveis do navegador que o app não usa.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Instrui o navegador a nunca mais tentar acessar este domínio por
          // HTTP (sem criptografia) de novo, mesmo em wifi público inseguro —
          // a Vercel já redireciona HTTP->HTTPS, mas este header fecha essa
          // brecha do primeiro acesso (checklist de segurança, item 12).
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
      {
        // Painel logado: nunca deve ser indexado pelo Google nem aparecer em
        // resultado de busca — é tudo tela autenticada, mas o header reforça
        // isso mesmo antes de qualquer verificação de login rodar.
        source: "/dashboard/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        // Onboarding também é tela autenticada.
        source: "/onboarding/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        // Link de convite de equipe: a URL carrega um token — não deve ficar
        // indexado/em cache de busca, mesmo sendo uma página pública por
        // natureza (quem tem o link acessa sem estar logado ainda).
        source: "/convite/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        // Rotas de API nunca devem ser indexadas nem seguidas por crawler.
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
