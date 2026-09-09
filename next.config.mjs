/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  staticPageGenerationTimeout: 120,

  // Headers de segurança aplicados a toda resposta do site. Não inclui uma
  // Content-Security-Policy estrita de propósito: sem conseguir rodar o build
  // localmente neste ambiente (ver contexto-projeto-completo.md), uma CSP mal
  // calibrada arrisca quebrar o site de forma silenciosa em produção — os
  // headers abaixo são seguros por padrão e não têm esse risco.
  async headers() {
    return [
      {
        // Todas as rotas.
        source: "/:path*",
        headers: [
          // Impede que o site seja carregado dentro de um <iframe> de outro
          // domínio (proteção contra clickjacking).
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
