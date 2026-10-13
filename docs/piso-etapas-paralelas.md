# Piso da Enfermagem — etapas paralelas

## Fluxo mensal
- Na abertura: **1 Preparar a competência** e **5 Empenho / liquidação**.
- Eixo assistencial: **1 → 2 Auditar e conciliar → 3 Portaria municipal → 4 Confirmar o recurso**.
- Eixo financeiro: **5 → 6 e-Pública → (7 Pagamento + 8 Notificação por e-mail)**.
- **9 Encerramento:** exige todas as etapas 1–8 concluídas e sem reconferência.

## 13ª parcela
A etapa 1 mensal não existe; as duas etapas disponíveis desde o início são
**2 Cálculo e Portaria Federal** (a primeira etapa visual) e **5 Empenho / liquidação**.
Os demais pré-requisitos são idênticos ao fluxo mensal. O encerramento requer 2–8.

## Proteções
- A abertura antecipada da etapa 5 não equivale à confirmação do valor.
  Os valores ainda não apurados são exibidos como **A apurar**, não R$ 0,00.
- Não é possível concluir a etapa 5 sem cadastrar instituição.
- Reconferência do eixo assistencial não marca indevidamente 5–8.
  Reconferência financeira alcança somente 6–9.
- As pré-condições são verificadas transitivamente: por exemplo, a
  reconferência da Etapa 5 também bloqueia 7 e 8, embora ambas abram após a 6.
- A nova trigger valida novas conclusões e revalidações mesmo por acesso direto
  ao Supabase, sem modificar conclusões antigas.
- A migration não cria colunas e executa pré-verificação de esquema.

## Implantação Lovable
1. Sincronizar a main.
2. Executar `supabase/migrations/20261013170000_piso_etapas_paralelas_dependencias.sql`
   **depois** das migrations existentes da 13ª parcela.
3. Testar competência mensal nova e 13ª; conferir permissões ACP/UFI,
   edição, conclusão, reconferência e encerramento.
4. Rodar `bun run check:architecture`, `bun run test` e `bun run build`.
   Não concluir implantação antes de validar as regras no banco real.
