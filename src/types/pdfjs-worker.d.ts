// O worker do pdf.js não traz tipos; no servidor só precisamos carregá-lo
// (ver src/app/api/importar/pdf/route.ts).
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
