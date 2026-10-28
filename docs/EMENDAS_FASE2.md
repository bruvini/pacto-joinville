# Emendas Parlamentares — Fase 2 · Solicitações e competências filhas

## Mudanças no cadastro
- A interface deixou de exigir exercício, finalidade, descrição complementar, responsável, competência inicial, periodicidade padrão e observações. O exercício permanece **apenas como metadado técnico derivado do número /AAAA** (ou do ano atual quando ausente) para compatibilidade com os registros e índices anteriores.
- O termo aditivo é identificado por `termos_aditivos.identificador`, não por seu objeto.
- Há campos distintos para o valor original da emenda, rendimento (zero quando não houver) e, na edição, o histórico de alterações formais. O total cadastral é `valor inicial + rendimento + ajustes`.
- A portaria municipal agora possui número do ato, número do documento SEI e link SEI independentes.
- O campo de proposta continua opcional e representa o identificador da proposta no sistema de origem; **não é o número da portaria**.
- Número do processo administrativo SEI recebeu nome técnico específico e atributos para desencorajar autofill de cartão. A competência inicial foi removida do cadastro e passou à abertura de cada competência. Prazo continua opcional.
- O valor inicial permanece imutável; alterações do limite autorizado por ato formal continuam via RPC com justificativa e SEI. Alterações do rendimento ficam auditadas e são rejeitadas se criarem saldo negativo diante dos compromissos.

## Modelo transacional

```
emendas (1) -> (N) emenda_competencias [única por emenda/mês]
emendas (1) -> (N) emenda_solicitacoes [processo principal; idempotente]
emenda_solicitacoes (1) -> (1..12) emenda_competencias_filhas
emenda_competencias_filhas (N) -> (1) emenda_competencias
```

- Abrir competência: `emenda_abrir_competencia`; não altera saldo; é idempotente.
- Formalizar solicitação: `emenda_formalizar_solicitacao`. Exige valor total, periodicidade da nota e número/link SEI. Registra reserva e cria **1, 3 ou 12** vínculos filhas previstas na mesma transação, antes de existir NE. Não distribui valores entre meses.
- Registrar NE: `emenda_registrar_ne`. Exige número, exercício, valor efetivo e evidência SEI. Substitui reserva pela NE, liberando a diferença de menor valor ou validando uma NE maior diante do saldo. Não emite NE na Fazenda.
- Cancelar solicitação sem NE: `emenda_cancelar_solicitacao`; exige justificativa, marca filhos cancelados e remove o impacto da reserva sem exclusão.
- Consultar o resumo: view `emendas_resumo` (`security_invoker=true`) retorna limite total, reservado, empenhado e disponível. Fórmula: `limite = emenda + rendimento + ajustes`; `disponível = limite - reservas aguardando NE - valores das NEs registradas`. A solicitação não permanece somada após sua conversão em NE.
- A linha da emenda é bloqueada com `FOR UPDATE` nas RPCs para serializar solicitações concorrentes. Chave de idempotência evita duplo clique ou repetição da mesma formalização.
- Os estados de competência filha são `prevista`, `aguardando_liberacao` e `cancelada` nesta fase. Estados de conclusão/sem execução ficam reservados às próximas fases.

## Interface

Na página de detalhes de uma emenda, abra **Competências e notas**. Há duas perspectivas sobre os mesmos registros:

1. **Por competência:** cada mês global tem um único card, podendo mostrar várias solicitações/NEs, inclusive notas iniciadas em outros meses.
2. **Por solicitação / nota:** cada processo mostra periodicidade, documentos SEI e todas as suas competências filhas com estados próprios.

Não criar automaticamente valores de liberação a partir de NE trimestral/anual; eles serão lançados conforme atesto na Fase 4.

## Segurança e limites

A migration `supabase/migrations/20261028193000_emendas_fase2_solicitacoes_competencias.sql` precisa ser aplicada **após a Fase 1**. As três tabelas novas têm RLS, apenas SELECT concedido aos perfis `admin/acp/aco`. Inserção/atualização financeira é permitida somente por RPCs `SECURITY DEFINER` com verificação explícita de `auth.uid()` e papel `admin/acp`. Alterações são auditadas pela tabela `emenda_historico`.

Não inclui (ainda): assinatura documental por slot e matriz, etapa completa de dotação/autorização/assinatura, liberação por filha, pagamento, anulação residual, encerramento sem execução ou importação da SEFAZ. Registros no PACTO não equivalem a execução de atos externos.

### Verificações antes de homologar com usuários

- Duas solicitações na mesma competência, incluindo mensal + trimestral;
- 3 filhas previstas mesmo sem NE, com meses globais únicos e sem rateio;
- Cancelamento e restituição do valor reservado;
- NE menor: diferença retorna ao disponível; maior: falha quando ultrapassa o teto;
- 2 usuários formalizando simultaneamente com valores que somados ultrapassariam o saldo;
- Reenvio da mesma chave de idempotência: uma única solicitação;
- Alteração de rendimento ou limite que reduziria disponível abaixo de zero;
- Permissões ACP/Admin vs UFI;
- Ano em virada dezembro/janeiro sem bloqueio artificial.

Não usar movimentações fictícias na base operacional. A emenda 42510002/2026 do HMSJ, proposta 36000790627202600, referência de R$ 510.000,00 e SEI 26.0.083102-3 permanece **caso de homologação em ambiente de teste**, não dado de produção criado por esta entrega.
