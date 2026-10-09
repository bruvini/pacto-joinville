/**
 * Garante ordem transacional do ponto de vista do usuário:
 * primeiro grava os metadados SEI; só então chama a RPC de encaminhamento.
 * A verificação definitiva de assinatura e campos continua no PostgreSQL.
 */
export async function encaminharDepoisDePersistir(
  persistir: () => Promise<boolean>,
  confirmar: () => Promise<void>,
): Promise<void> {
  const salvo = await persistir();
  if (!salvo) {
    throw new Error(
      "O Número SEI e o Link SEI ainda não foram salvos. " +
        "Verifique o erro de gravação antes de confirmar o envio.",
    );
  }
  await confirmar();
}
