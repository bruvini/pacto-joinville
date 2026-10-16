# Fase 1 — Fundação institucional e competências

**Referência:** HTML v2.42.2, hash `75494e80e28fc59596e43a2ba0fb7a0caf9a50bafbd3a5f4c94dd95a22fe7186`.

## Persistência reaproveitada (sem criar novas tabelas)

- `eletivas_competencias`: um registro por prestador/competência, um lançamento por registro; estado, CNES, documentos e snapshot da execução.
- `ec_cnes_instituicoes`: fonte institucional de CNES; a seleção não permite informar arbitrariamente outro.
- `eletivas_arquivos`, `eletivas_itens`, `eletivas_eventos`: arquivos privados com hash, itens processados/decisões e histórico por competência.
- `eletivas_exclusoes`: cópia dos eventos e motivo de exclusão, separada da competência.
- `eletivas_correcoes`, `eletivas_decisoes_revisoes`, `eletivas_fpo_programacoes`, `eletivas_atos_especiais`, `eletivas_publicacoes_aih`: fontes e decisões cuja existência impede edição de identidade/exclusão.
- `eletivas_fechamentos`, `eletivas_integracoes`, `eletivas_atesto_escolhas`: histórico imutável de fechamento e seleção fiscal da origem do atesto.

**Novas tabelas:** nenhuma nesta etapa. Estruturas de comunicações e regularização do HTML serão avaliadas na fase operacional, evitando duplicações.

## Código e regras entregues

- `src/lib/eletivas/competencias.ts`: destino da seleção `criar` / `abrir` / `vincular` / `bloquear`.
- `src/routes/_authenticated/eletivas.index.tsx`: edição só abre depois de validar a identidade do lançamento; criação e reutilização continuam pelos RPCs institucionais; seleção incompatível bloqueada e listas atualizadas após erro.
- `src/routes/_authenticated/eletivas.$id.tsx`: exibe dados da parcela vinculada e divergências cadastrais, além de carregar eventos antigos sob demanda (sem corte silencioso em 300).
- `supabase/migrations/20261016120000_eletivas_fase1_fundacao_competencias.sql`: trava edição de identidade/exclusão em presença de documentos JSON, correções, FPO, revisões ou fontes; CNES vem do cadastro; vínculo preenchido não é reatribuído. Mantém papeis ACP/Admin, eventos e lançamentos inalterados.
- `src/lib/eletivas/fase1Fundacao.test.ts`: nove cenários de decisão e testes de contrato para SQL e interface.

## Critérios de aceite no banco real

1. Criação por prestador → convênio Fluxo 1 → parcela individual aberta; mesmo prestador+mês não gera outro encontro; CNES vem da base.
2. Parcela já vinculada abre o mesmo encontro sem novo registro; legado sem `lancamento_id` só aceita primeiro vínculo compatível.
3. Alteração da competência/cadastro apenas rascunho sem evidências e com justificativa; documentos, FPO, correções e decisões bloqueiam alteração.
4. Exclusão só rascunho vazio e justificado, eventos preservados em `eletivas_exclusoes`.
5. Detalhe recupera arquivos, itens, lançamento e eventos; perfil leitor sem permissão de escrita e ACP/Admin pode atuar apenas em estados permitidos.
6. `lancamentos_pagamento`, atesto manual/automático, registros SEI e snapshots de fechamento continuam intocados.

**Implantação:** executar a migration no banco do pacto-joinville/Lovable após as migrations Eletivas de 15/10/2026. O projeto não está disponível na conexão Supabase atual; não se deve declarar aplicação da migration nem homologação transacional por conta de testes estáticos/CI. A Fase 2 pode prosseguir em código, mas o aceite em produção depende da validação SQL/RLS e cenários com dados reais.
