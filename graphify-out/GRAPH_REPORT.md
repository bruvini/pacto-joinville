# Graph Report - pacto-joinville  (2026-10-06)

## Corpus Check
- 194 files · ~220,539 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1111 nodes · 2396 edges · 124 communities (57 shown, 67 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 26 edges (avg confidence: 0.54)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `21898588`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- lancamentos.index.tsx
- lancamentos.$id.tsx
- dashboard.tsx
- sidebar.tsx
- sobre.tsx
- carousel.tsx
- routeTree.gen.ts
- piso/relatorio.ts
- investsus.ts
- compilerOptions
- cn
- prestacao.ts
- DocumentoCard.tsx
- utils.ts
- import-historico.ts
- EtapasPiso.tsx
- components.json
- Plano de Implementação — Sistema de Gestão e Auditoria de Empenhos
- menubar.tsx
- types.ts
- __root.tsx
- dependencies
- devDependencies
- Módulo Piso da Enfermagem
- 2. E-mail institucional — opcional, passo a passo detalhado ✉️
- Plano de ajustes V2 (2026-06-23)
- command.tsx
- context-menu.tsx
- dropdown-menu.tsx
- server.ts
- Plano de ação — ajustes (2026-06-23)
- table.tsx
- portaria.ts
- scripts
- breadcrumb.tsx
- drawer.tsx
- navigation-menu.tsx
- Conformidade — LGPD & ISO/IEC 27001
- toggle-group.tsx
- Plano — Reengenharia do "Processo de Empenho" (lançamento)
- setores.ts
- Route
- package.json
- CompetenciaField.tsx
- alert.tsx
- input-otp.tsx
- start.ts
- EtapaStepper.tsx
- avatar.tsx
- index.ts
- query.js
- scroll-area.tsx
- cmdk
- router.tsx
- Routes
- clsx
- embla-carousel-react
- date-fns
- globals
- eslint-config-prettier
- @eslint/js
- eslint-plugin-react-refresh
- @hookform/resolvers
- input-otp
- nitro
- pdfjs-dist
- @radix-ui/react-accordion
- @radix-ui/react-alert-dialog
- @radix-ui/react-aspect-ratio
- @radix-ui/react-checkbox
- @radix-ui/react-collapsible
- @radix-ui/react-context-menu
- @radix-ui/react-dialog
- @radix-ui/react-dropdown-menu
- @radix-ui/react-hover-card
- @radix-ui/react-label
- @radix-ui/react-menubar
- @radix-ui/react-navigation-menu
- @radix-ui/react-progress
- @radix-ui/react-radio-group
- @radix-ui/react-scroll-area
- @radix-ui/react-select
- @radix-ui/react-separator
- @radix-ui/react-slot
- @radix-ui/react-switch
- @radix-ui/react-tabs
- @radix-ui/react-toggle
- @radix-ui/react-toggle-group
- @radix-ui/react-tooltip
- react-day-picker
- react-dom
- react-resizable-panels
- recharts
- sonner
- @supabase/supabase-js
- tailwind-merge
- tailwindcss
- @tailwindcss/vite
- @tanstack/react-query
- @tanstack/react-router
- @tanstack/react-start
- @tanstack/router-plugin
- tw-animate-css
- vaul
- vite-tsconfig-paths
- zod
- prettier
- @types/node
- @types/react
- typescript
- typescript-eslint
- vite
- @vitejs/plugin-react
- vitest
- shadcn/ui configuration
- ESLint configuration
- TypeScript configuration

## God Nodes (most connected - your core abstractions)
1. `cn()` - 79 edges
2. `brl()` - 34 edges
3. `supabase` - 28 edges
4. `Button` - 26 edges
5. `registrarAcesso()` - 23 edges
6. `linkValido()` - 22 edges
7. `Badge()` - 21 edges
8. `Card` - 21 edges
9. `CardContent` - 21 edges
10. `EtapaPiso()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `BlocoAssinaturas` --semantically_similar_to--> `Configuração matricial de assinaturas`  [INFERRED] [semantically similar]
  .lovable/plan.md → README.md
- `CalendarDayButton()` --references--> `react`  [EXTRACTED]
  src/components/ui/calendar.tsx → package.json
- `useCarousel()` --references--> `react`  [EXTRACTED]
  src/components/ui/carousel.tsx → package.json
- `useChart()` --references--> `react`  [EXTRACTED]
  src/components/ui/chart.tsx → package.json
- `useFormField()` --references--> `react`  [EXTRACTED]
  src/components/ui/form.tsx → package.json

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Piso da Enfermagem delivery model** — _lovable_plan_piso_da_enfermagem, _lovable_plan_competencia_mensal, _lovable_plan_esteira_de_oito_etapas, _lovable_plan_blocoassinaturas [EXTRACTED 1.00]

## Communities (124 total, 67 thin omitted)

### Community 0 - "lancamentos.index.tsx"
Cohesion: 0.08
Nodes (55): HelpTip(), Resultado, LimparFiltrosButton(), NotificationBell(), tempoRelativo(), Badge(), BadgeProps, badgeVariants (+47 more)

### Community 1 - "lancamentos.$id.tsx"
Cohesion: 0.05
Nodes (66): BlocoAssinaturas(), blocoCompleto(), cargoAssinado(), doSlot(), Slot, SLOT_COMISSAO, SLOT_COORD_ORC, SLOT_DIRETOR (+58 more)

### Community 2 - "dashboard.tsx"
Cohesion: 0.05
Nodes (60): AgingItem, AgingList(), DOT, TEXTO_DIAS(), AtencaoItem, BarraAtencao(), ACAO_TIPOS, AtividadeUsuarioChart() (+52 more)

### Community 3 - "sidebar.tsx"
Cohesion: 0.06
Nodes (44): AppSidebar(), items, NavItem, Separator, SheetContent, SheetContentProps, SheetDescription, SheetFooter() (+36 more)

### Community 4 - "sobre.tsx"
Cohesion: 0.05
Nodes (13): BpmnFluxo(), COR, AccordionContent, AccordionItem, AccordionTrigger, TabsContent, TabsList, TabsTrigger (+5 more)

### Community 5 - "carousel.tsx"
Cohesion: 0.05
Nodes (33): react, react, Carousel, CarouselApi, CarouselContent, CarouselContext, CarouselContextProps, CarouselItem (+25 more)

### Community 6 - "routeTree.gen.ts"
Cohesion: 0.05
Nodes (40): Route, Route, Route, Route, Route, Route, Route, Route (+32 more)

### Community 7 - "piso/relatorio.ts"
Cohesion: 0.10
Nodes (27): competenciaValida(), EtapasConcluidas, PISO_ETAPAS, SITUACAO_PARTICIPANTE, STATUS_COMPETENCIA, campos, camposData, camposMonetarios (+19 more)

### Community 8 - "investsus.ts"
Cohesion: 0.14
Nodes (29): achar(), auditarInvestsus(), categoriaProfissional(), cnpjValido(), complementoEsperado(), conciliarCargaInvestsus(), mapearColunasInvestsus(), PISO_44 (+21 more)

### Community 9 - "compilerOptions"
Cohesion: 0.07
Nodes (26): DOM, DOM.Iterable, ES2022, eslint.config.js, src/**/*.ts, src/**/*.tsx, vite/client, vite.config.ts (+18 more)

### Community 10 - "cn"
Cohesion: 0.14
Nodes (18): EsteiraStepper(), ButtonProps, buttonVariants, Calendar(), CalendarDayButton(), HoverCardContent, Pagination(), PaginationContent (+10 more)

### Community 11 - "prestacao.ts"
Cohesion: 0.13
Nodes (22): PrestacaoContas(), primeiraCompetencia(), diasEntre(), ESTEIRA_PC, EtapaPcSlug, etapaPrestacao(), IDX_PC, pagamentoLiberado() (+14 more)

### Community 12 - "DocumentoCard.tsx"
Cohesion: 0.20
Nodes (19): DocProps, DocumentoCard(), Props, acharDoc(), Assin, centavos(), CtxPiso, dentroTolerancia() (+11 more)

### Community 13 - "utils.ts"
Cohesion: 0.18
Nodes (10): CurrencyInput(), SeiButton(), SeiLink(), NIVEL_BADGE, TIPO_INTERACAO, Input, Progress, Slider (+2 more)

### Community 14 - "import-historico.ts"
Cohesion: 0.25
Nodes (17): xlsx, ImportarHistoricoPC(), COLUNAS_PC, LinhaImport, mapSituacaoBaixa(), mapStatusCgm(), MESES, montarLinha() (+9 more)

### Community 15 - "EtapasPiso.tsx"
Cohesion: 0.21
Nodes (16): ArquivosEvidencia(), enviarArquivo(), sha256(), CampoBlur(), Pendencias(), EtapaPiso(), nomeInst(), ultimoArquivo() (+8 more)

### Community 16 - "components.json"
Cohesion: 0.11
Nodes (18): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+10 more)

### Community 17 - "Plano de Implementação — Sistema de Gestão e Auditoria de Empenhos"
Cohesion: 0.12
Nodes (16): 0. Stack atual (mapeada no código), 1. Diagnóstico — o que está bom e o que está ruim, 2. Princípios e referências teóricas que guiam o plano, 3. Roadmap em fases, 4. Qualidade de engenharia (transversal a todas as fases), 5. Decisões tomadas (definidas com o solicitante em 2026-06-21), 6. Sequência recomendada de execução, FASE 0 — Fundação de Segurança & Conformidade (LGPD/ISO 27001) (+8 more)

### Community 18 - "menubar.tsx"
Cohesion: 0.12
Nodes (11): Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarLabel, MenubarRadioItem, MenubarSeparator, MenubarShortcut() (+3 more)

### Community 19 - "types.ts"
Cohesion: 0.14
Nodes (12): requireSupabaseAuth, supabaseAdmin, CompositeTypes, Constants, Database, DatabaseWithoutInternals, DefaultSchema, Enums (+4 more)

### Community 20 - "__root.tsx"
Cohesion: 0.18
Nodes (8): Toaster(), ToasterProps, LovableErrorOptions, LovableEvents, reportLovableError(), Window, ErrorComponent(), Route

### Community 21 - "dependencies"
Cohesion: 0.15
Nodes (13): class-variance-authority, lucide-react, dependencies, class-variance-authority, lucide-react, @radix-ui/react-avatar, @radix-ui/react-popover, @radix-ui/react-slider (+5 more)

### Community 22 - "devDependencies"
Cohesion: 0.18
Nodes (11): eslint, eslint-plugin-prettier, eslint-plugin-react-hooks, @lovable.dev/vite-tanstack-config, devDependencies, eslint, eslint-plugin-prettier, eslint-plugin-react-hooks (+3 more)

### Community 23 - "Módulo Piso da Enfermagem"
Cohesion: 0.29
Nodes (10): BlocoAssinaturas, Competência mensal, Esteira de oito etapas, Módulo Piso da Enfermagem, Configuração matricial de assinaturas, Gestão de Empenhos, historico_logs, Painel ACP e ACO (+2 more)

### Community 24 - "2. E-mail institucional — opcional, passo a passo detalhado ✉️"
Cohesion: 0.20
Nodes (9): 1. In-app (tempo real) — funciona após aplicar as migrações ✅, 2. E-mail institucional — opcional, passo a passo detalhado ✉️, Definir os segredos (vale para as duas formas), Importante sobre o Lovable Cloud, Notificações automáticas, O que você precisa antes, O que é um Database Webhook (em português claro), Passo 2 — ligar o disparo (duas formas, escolha UMA) (+1 more)

### Community 25 - "Plano de ajustes V2 (2026-06-23)"
Cohesion: 0.20
Nodes (9): Decisões confirmadas (2026-06-23), Fase 1 — Quick wins (baixo risco, alto valor), Fase 2 — Teto / Complemento (corrige a perda de dados do item 5), Fase 3 — Sem emojis, Fase 4 — Reestruturação do Processo (a maior), Fase 5 — Assinaturas (sobre a nova estrutura), Fase 6 — Alertas inteligentes do Dashboard, Perguntas pendentes (ver chat) antes da Fase 2 e 4. (+1 more)

### Community 26 - "command.tsx"
Cohesion: 0.20
Nodes (8): Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut()

### Community 27 - "context-menu.tsx"
Cohesion: 0.20
Nodes (9): ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuShortcut(), ContextMenuSubContent (+1 more)

### Community 28 - "dropdown-menu.tsx"
Cohesion: 0.20
Nodes (9): DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut(), DropdownMenuSubContent (+1 more)

### Community 29 - "server.ts"
Cohesion: 0.36
Nodes (6): consumeLastCapturedError(), renderErrorPage(), fetch(), getServerEntry(), normalizeCatastrophicSsrResponse(), ServerEntry

### Community 30 - "Plano de ação — ajustes (2026-06-23)"
Cohesion: 0.22
Nodes (8): Decisões/assunções a confirmar — ver perguntas, Fase A — Correções de exibição (rápidas, baixo risco), Fase B — Assinaturas/Configurações, Fase C — Etapa 4 (Liberação de Recurso) reorganizada, Fase D — Finalização + PDF, Fase E — Extras, Já feito, Plano de ação — ajustes (2026-06-23)

### Community 31 - "table.tsx"
Cohesion: 0.22
Nodes (8): Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow

### Community 32 - "portaria.ts"
Cohesion: 0.39
Nodes (7): DadosPortariaGm, dataExtenso(), dataNumerica(), extrairDadosPortariaGm(), MESES, moeda(), normalizar()

### Community 33 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, build:dev, dev, format, lint, preview, test

### Community 34 - "breadcrumb.tsx"
Cohesion: 0.25
Nodes (7): Breadcrumb, BreadcrumbEllipsis(), BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator()

### Community 35 - "drawer.tsx"
Cohesion: 0.25
Nodes (6): DrawerContent, DrawerDescription, DrawerFooter(), DrawerHeader(), DrawerOverlay, DrawerTitle

### Community 36 - "navigation-menu.tsx"
Cohesion: 0.25
Nodes (7): NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle, NavigationMenuViewport

### Community 37 - "Conformidade — LGPD & ISO/IEC 27001"
Cohesion: 0.29
Nodes (6): 1. Registro das Operações de Tratamento (ROPA) — LGPD Art. 37, 2. Controles de segurança implementados (Fase 0), 3. Validação dupla (defesa em profundidade), 4. Pendências de conformidade (próximas fases), 5. Operação — primeira configuração, Conformidade — LGPD & ISO/IEC 27001

### Community 38 - "toggle-group.tsx"
Cohesion: 0.33
Nodes (5): ToggleGroup, ToggleGroupContext, ToggleGroupItem, Toggle, toggleVariants

### Community 39 - "Plano — Reengenharia do "Processo de Empenho" (lançamento)"
Cohesion: 0.33
Nodes (5): Decisões confirmadas (2026-06-21), Plano — Reengenharia do "Processo de Empenho" (lançamento), Pré-requisito, Schema (migração nova — aplicar via SQL editor), UI — aba "Processo de Empenho" (stepper dirigido)

### Community 41 - "Route"
Cohesion: 0.67
Nodes (3): Route, Route, FileRoutesByPath

### Community 42 - "package.json"
Cohesion: 0.40
Nodes (4): name, private, sideEffects, type

### Community 43 - "CompetenciaField.tsx"
Cohesion: 0.48
Nodes (5): CompetenciaField(), getProximoMes(), join(), split(), CompetenciaInput()

### Community 44 - "alert.tsx"
Cohesion: 0.40
Nodes (4): Alert, AlertDescription, AlertTitle, alertVariants

### Community 45 - "input-otp.tsx"
Cohesion: 0.40
Nodes (4): InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot

### Community 46 - "start.ts"
Cohesion: 0.50
Nodes (3): attachSupabaseAuth, errorMiddleware, startInstance

### Community 47 - "EtapaStepper.tsx"
Cohesion: 0.67
Nodes (3): EtapaStepper(), ORDEM, etapaLabel

### Community 48 - "avatar.tsx"
Cohesion: 0.50
Nodes (3): Avatar, AvatarFallback, AvatarImage

### Community 49 - "index.ts"
Cohesion: 0.50
Nodes (3): RESEND_API_KEY, SERVICE_ROLE, SUPABASE_URL

### Community 51 - "scroll-area.tsx"
Cohesion: 0.27
Nodes (4): RadioGroup, RadioGroupItem, ScrollArea, ScrollBar

## Knowledge Gaps
- **427 isolated node(s):** `name`, `private`, `sideEffects`, `type`, `dev` (+422 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **67 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `carousel.tsx`, `import-historico.ts`, `package.json`, `cmdk`, `clsx`, `embla-carousel-react`, `date-fns`, `@hookform/resolvers`, `input-otp`, `pdfjs-dist`, `@radix-ui/react-accordion`, `@radix-ui/react-alert-dialog`, `@radix-ui/react-aspect-ratio`, `@radix-ui/react-checkbox`, `@radix-ui/react-collapsible`, `@radix-ui/react-context-menu`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-hover-card`, `@radix-ui/react-label`, `@radix-ui/react-menubar`, `@radix-ui/react-navigation-menu`, `@radix-ui/react-progress`, `@radix-ui/react-radio-group`, `@radix-ui/react-scroll-area`, `@radix-ui/react-select`, `@radix-ui/react-separator`, `@radix-ui/react-slot`, `@radix-ui/react-switch`, `@radix-ui/react-tabs`, `@radix-ui/react-toggle`, `@radix-ui/react-toggle-group`, `@radix-ui/react-tooltip`, `react-day-picker`, `react-dom`, `react-resizable-panels`, `recharts`, `sonner`, `@supabase/supabase-js`, `tailwind-merge`, `tailwindcss`, `@tailwindcss/vite`, `@tanstack/react-query`, `@tanstack/react-router`, `@tanstack/react-start`, `@tanstack/router-plugin`, `tw-animate-css`, `vaul`, `vite-tsconfig-paths`, `zod`?**
  _High betweenness centrality (0.216) - this node is a cross-community bridge._
- **Why does `cn()` connect `cn` to `lancamentos.index.tsx`, `lancamentos.$id.tsx`, `dashboard.tsx`, `sidebar.tsx`, `sobre.tsx`, `carousel.tsx`, `utils.ts`, `menubar.tsx`, `command.tsx`, `context-menu.tsx`, `dropdown-menu.tsx`, `table.tsx`, `breadcrumb.tsx`, `drawer.tsx`, `navigation-menu.tsx`, `toggle-group.tsx`, `CompetenciaField.tsx`, `alert.tsx`, `input-otp.tsx`, `EtapaStepper.tsx`, `avatar.tsx`, `scroll-area.tsx`?**
  _High betweenness centrality (0.153) - this node is a cross-community bridge._
- **Why does `xlsx` connect `import-historico.ts` to `investsus.ts`, `dashboard.tsx`, `dependencies`?**
  _High betweenness centrality (0.141) - this node is a cross-community bridge._
- **What connects `name`, `private`, `sideEffects` to the rest of the system?**
  _427 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `lancamentos.index.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08204493918779633 - nodes in this community are weakly interconnected._
- **Should `lancamentos.$id.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05048766494549627 - nodes in this community are weakly interconnected._
- **Should `dashboard.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05136986301369863 - nodes in this community are weakly interconnected._