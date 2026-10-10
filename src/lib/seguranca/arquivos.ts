/**
 * Validação de arquivo de imagem pelo conteúdo real (magic bytes), não pela
 * extensão nem pelo tipo informado pelo navegador — item 2.6 da
 * especificação de 09/out/2026. Só JPEG, PNG e WEBP, até 4 MB (bucket aceita 5 MB).
 */
// 4 MB: abaixo do limite de corpo das funções da Vercel (4,5 MB), para a
// foto nunca ser cortada no caminho. O bucket aceita até 5 MB.
export const TAMANHO_MAXIMO_COMPROVANTE = 4 * 1024 * 1024;

export type TipoImagem = "image/jpeg" | "image/png" | "image/webp";

export const EXTENSAO_POR_TIPO: Record<TipoImagem, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function detectarTipoImagem(bytes: Uint8Array): TipoImagem | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "image/png";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/** Caminho no bucket: `<dono>/<uuid v4>.<ext>` — nunca usa o nome enviado
 * pelo usuário (impede path traversal e nomes maliciosos). */
export function caminhoSeguro(donoId: string, tipo: TipoImagem, uuid: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(donoId) || !/^[0-9a-f-]{36}$/i.test(uuid)) throw new Error("identificador inválido");
  return `${donoId}/${uuid}.${EXTENSAO_POR_TIPO[tipo]}`;
}
