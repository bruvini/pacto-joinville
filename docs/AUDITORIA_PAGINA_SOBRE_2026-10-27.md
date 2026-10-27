# Auditoria funcional e atualização da página "Sobre" — 27/10/2026

## Escopo e fonte de verdade
Leitura dos caminhos de rotas, sidebar, lógica do dashboard, componentes por competência, bibliotecas de regras, operações de documentos e arquitetura do projeto `bruvini/pacto-joinville`, branch `main`. Prioridade para funcionalidade efetivamente implementada no código; não atribuir características apenas por constarem em planos antigos. A documentação é um mapa funcional, não auditoria de segurança externa.

## Principais desvios identificados
- Página anterior descrevia o produto prioritariamente como fluxo de empenhos de convênios e prestação de contas, omitindo Piso, PVH e CACON como módulos independentes.
- Explicação do Lead Time estava defasada: o indicador atual combina os quatro módulos com ponderação pelo número de processos concluídos válidos (biblioteca `src/lib/dashboard/lead-time.ts`).
- Alguns textos inferiam prioridade automática por setor, relatório mensal PDF com todos os campos, envio automático irrestrito de e-mails ou "event sourcing" global sem delimitar os componentes que implementam cada comportamento.
- Texto da área APC poderia ser interpretado como papel de autenticação: os papéis técnicos conhecidos são `admin`, `acp` e `aco` (UFI).
- Trechos antigos apresentavam conformidade com LGPD/ISO e imutabilidade de logs de modo excessivamente absoluto, sem ressalva institucional.

## Mapa de módulos sustentado pelo código

| Módulo | Fontes principais | Delimitação |
| --- | --- | --- |
| Empenhos de Contratos | `src/routes/_authenticated/lancamentos.*`, `src/lib/etapa.ts`, `src/components/BpmnFluxo.tsx` | Dois fluxos próprios (hospitalar e liquidação direta), prestações por instrumento, anulação conforme fluxo |
| Piso da Enfermagem | `src/lib/piso/etapas.ts`, `src/components/piso/EtapasPiso.tsx`, `src/lib/piso/anulacao.ts` | Mensal + 13ª, etapas paralelas, anulação condicional 7A, obrigações por instituição |
| PVH | `src/lib/pvh/etapas.ts`, `src/routes/_authenticated/pvh.$id.tsx`, `src/lib/pvh/portariaMunicipal.ts` | Sete etapas, atos estadual/municipal, minuta/memorando formatados e referências clicáveis, execução e encerramento |
| Dieta CACON | `src/lib/cacon/etapas.ts`, `src/routes/_authenticated/cacon.$id.tsx` | Três etapas: recebimento, auditoria do documento, memorando SMS |

## Componentes transversais
- Dashboard: `src/routes/_authenticated/dashboard.tsx`, `src/lib/dashboard/lead-time.ts`, `src/components/dashboard/DesempenhoSLA.tsx`. Filtro por módulo e amostra ponderada; interpretação diferenciada de SLA por etapa.
- Central da Planilha: `src/hooks/useCentralPlanilha.ts`, `src/lib/financeiro/planilha-atualizacao.ts`. Leitura de Convênios, Piso e PVH; **não** inclui CACON. Dados mantêm distinção entre valores financeiros e identificadores SEI.
- Auditoria de Anulações: `src/routes/_authenticated/auditoria.tsx`, `src/lib/anulacoes.ts`. Convênios e Piso; valor previsto não é confirmação da SEFAZ.
- Prestação de Contas: `src/routes/_authenticated/prestacao-contas.tsx`, `src/lib/prestacao-pvh.ts`, `src/lib/relatorio-mensal.ts`. Inclui Convênios e PVH conforme a regra aplicável; impressão de relatórios de pendências.
- Administração: `src/routes/_authenticated/usuarios.tsx`, `src/routes/_authenticated/configuracoes.tsx`, `src/routes/_authenticated/logs-acesso.tsx`, `src/routes/_authenticated/route.tsx`.

## Arquitetura mapeada
- Frontend web: React + TypeScript, TanStack Start/Router, TanStack Query, Tailwind CSS e componentes de interface.
- Persistência/identidade: Supabase Auth, PostgreSQL/RLS, armazenamento de evidências; tipos e migrations versionados.
- Separação arquitetural pretendida e parcialmente implementada: rotas compõem telas; bibliotecas `src/lib` concentram regras; componentes isolam apresentações; hooks encapsulam consultas. Referência: `docs/ARCHITECTURE.md`.
- Repositório GitHub conectado ao Lovable; integração contínua executa testes Vitest, verificações de contratos do projeto e build Vite.

## Critérios de redação aplicados
1. Diferenciar controle documental interno de atos efetivamente assinados/publicados/pagos nos sistemas externos.
2. Nunca chamar SLA por etapa de duração total do processo.
3. Evitar contagens estáticas de registros ou valores que mudam no banco.
4. Não usar selos de certificação LGPD/ISO ou prometer cobertura completa de auditoria.
5. Preservar BPMNs e créditos institucionais existentes; apresentar os demais módulos em seção própria.
6. Preferir nomes de etapas diretamente importados das definições de domínio em vez de cópias estáticas que ficam desatualizadas.

**Nota:** este registro descreve o código. O funcionamento em cada ambiente continua sujeito às configurações, permissões, conectividade e bases de dados correspondentes.
