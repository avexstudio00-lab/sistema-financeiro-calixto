/* Abertura mais rápida (10/nov/2026): já pede a sessão ao servidor enquanto o
   resto do app ainda está baixando. O sessaoCookie.ts usa esta resposta (uma
   vez só). Não roda quando ainda existe sessão antiga no localStorage (essa
   passa pela migração normal) nem fora do painel. */
(function () {
  try {
    var p = location.pathname;
    if (p.indexOf("/dashboard") !== 0 && p.indexOf("/onboarding") !== 0) return;
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i) || "";
      if (k.indexOf("sb-") === 0 && k.slice(-11) === "-auth-token") return;
    }
    window.__sessaoCedo = fetch("/api/auth/sessao", { credentials: "same-origin", cache: "no-store" });
    window.__sessaoCedo.catch(function () {});
  } catch (e) {}
})();
