# Fronteiras arquiteturais da aplicação

## Regra prática

Rotas devem orquestrar navegação, filtros e composição. Regras de domínio, agregações e cálculos ficam em `src/lib`; blocos visuais autocontidos ficam em `src/components`; leitura/mutação repetitiva de dados deve migrar para hooks dedicados quando a extração reduzir acoplamento.

O `prebuild` executa `scripts/check-file-size.mjs` para impedir que os maiores arquivos continuem crescendo sem uma decisão arquitetural explícita.

## Estado dos arquivos críticos

### `dashboard.tsx`

A agregação multimódulo de SLA/atividade foi movida para `src/lib/dashboard/modulos.ts`. Cards e gráficos continuam em `src/components/dashboard`. Novos indicadores devem seguir essa fronteira e não criar cálculos extensos diretamente na rota.

### `EtapasPiso.tsx`

A Etapa 8 — Notificação por e-mail — foi extraída para `EtapaNotificacaoEmail.tsx`. Novas etapas ou alterações grandes devem preferir um componente por etapa/subfluxo em vez de ampliar o componente coordenador.

### `lancamentos.$id.tsx`

É o maior débito estrutural restante. A decomposição deve ser incremental, preservando comportamento:

1. hook de carregamento do processo e fontes relacionadas;
2. hook/módulo de mutations e invalidations;
3. componentes por bloco/etapa;
4. timeline/auditoria e modais fora da rota.

Não misturar essa decomposição com mudança financeira relevante na mesma revisão.

### `lancamentos.index.tsx`

Separar progressivamente filtros/estado de busca, montagem dos grupos/linhas e apresentação da tabela. A regra de agrupamento deve permanecer em função pura reutilizável pelo dashboard.

## Banco e ambiente

- Schema: fonte de verdade em `supabase/migrations/`.
- Tipos: `src/integrations/supabase/types.ts`, validados por `npm run check:schema`.
- Ambiente: somente configuração pública no `.env`; segredos nunca entram em `VITE_*` ou no repositório.
