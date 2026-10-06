# Graph Report - pacto-joinville  (2026-10-05)

## Corpus Check
- 183 files · ~211,173 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1042 nodes · 2267 edges · 127 communities (61 shown, 66 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 28 edges (avg confidence: 0.6)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ed7ef065`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- dashboard.tsx
- BlocoAssinaturas.tsx
- sidebar.tsx
- BpmnFluxo.tsx
- carousel.tsx
- DocumentoCard.tsx
- compilerOptions
- lancamentos.$id.tsx
- etapa.ts
- routeTree.gen.ts
- AgingList.tsx
- cn
- ImportarHistoricoPC.tsx
- components.json
- Plano de Implementação — Sistema de Gestão e Auditoria de Empenhos
- menubar.tsx
- types.ts
- __root.tsx
- FileRoutesByPath
- utils.ts
- server.ts
- dependencies
- Módulo Piso da Enfermagem
- devDependencies
- command.tsx
- context-menu.tsx
- dropdown-menu.tsx
- table.tsx
- 2. E-mail institucional — opcional, passo a passo detalhado ✉️
- scripts
- breadcrumb.tsx
- drawer.tsx
- navigation-menu.tsx
- toggle-group.tsx
- Plano de ajustes V2 (2026-06-23)
- setores.ts
- package.json
- Plano de ação — ajustes (2026-06-23)
- alert.tsx
- input-otp.tsx
- router.tsx
- TanStack Start application
- EtapaStepper.tsx
- avatar.tsx
- index.ts
- query.js
- sobre.tsx
- prestacao-contas.tsx
- clsx
- label.tsx
- date-fns
- embla-carousel-react
- Conformidade — LGPD & ISO/IEC 27001
- eslint-config-prettier
- configuracoes.tsx
- eslint-plugin-react-refresh
- globals
- input-otp
- Plano — Reengenharia do "Processo de Empenho" (lançamento)
- @radix-ui/react-alert-dialog
- @radix-ui/react-aspect-ratio
- @radix-ui/react-avatar
- @radix-ui/react-collapsible
- @radix-ui/react-context-menu
- @radix-ui/react-dialog
- @radix-ui/react-dropdown-menu
- @radix-ui/react-hover-card
- @radix-ui/react-label
- @radix-ui/react-menubar
- @radix-ui/react-navigation-menu
- @radix-ui/react-popover
- @radix-ui/react-radio-group
- @radix-ui/react-scroll-area
- @radix-ui/react-select
- @radix-ui/react-separator
- @radix-ui/react-slider
- @radix-ui/react-slot
- @radix-ui/react-switch
- @radix-ui/react-tabs
- @radix-ui/react-toggle
- @radix-ui/react-toggle-group
- @radix-ui/react-tooltip
- react-dom
- react-hook-form
- react-resizable-panels
- recharts
- sonner
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
- Route
- Routes
- @hookform/resolvers
- nitro
- auth.tsx
- dateTime
- auditoria.tsx
- radio-group.tsx
- CompetenciaField.tsx
- linkValido
- @eslint/js
- scroll-area.tsx
- @radix-ui/react-accordion
- class-variance-authority

## God Nodes (most connected - your core abstractions)
1. `cn()` - 81 edges
2. `brl()` - 37 edges
3. `supabase` - 28 edges
4. `Button` - 26 edges
5. `registrarAcesso()` - 26 edges
6. `useAuth()` - 23 edges
7. `linkValido()` - 23 edges
8. `dateTime()` - 22 edges
9. `Card` - 21 edges
10. `CardContent` - 21 edges

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
- **Piso da Enfermagem delivery model** — _lovable_plan_piso_da_enfermagem, _lovable_plan_competencia_mensal, _lovable_plan_esteira_de_oito_etapas, _lovable_plan_blocoassinaturas, _lovable_plan_historico_logs [EXTRACTED 1.00]

## Communities (127 total, 66 thin omitted)

### Community 0 - "dashboard.tsx"
Cohesion: 0.06
Nodes (75): AtencaoItem, BarraAtencao(), ACAO_TIPOS, AtividadeUsuarioChart(), classificarAcao(), DistribuicaoSetorChart(), fmtDias(), mediaSimples() (+67 more)

### Community 1 - "BlocoAssinaturas.tsx"
Cohesion: 0.12
Nodes (19): BlocoAssinaturas(), blocoCompleto(), cargoAssinado(), doSlot(), Slot, SLOT_COMISSAO, SLOT_COORD_ORC, SLOT_DIRETOR (+11 more)

### Community 2 - "sidebar.tsx"
Cohesion: 0.06
Nodes (43): AppSidebar(), items, NavItem, Separator, SheetContent, SheetContentProps, SheetDescription, SheetFooter() (+35 more)

### Community 4 - "carousel.tsx"
Cohesion: 0.07
Nodes (24): react, react, Carousel, CarouselApi, CarouselContent, CarouselContext, CarouselContextProps, CarouselItem (+16 more)

### Community 5 - "DocumentoCard.tsx"
Cohesion: 0.13
Nodes (31): ArquivosEvidencia(), enviarArquivo(), sha256(), DocProps, DocumentoCard(), EtapaPiso(), nomeInst(), Props (+23 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (26): DOM, DOM.Iterable, ES2022, eslint.config.js, src/**/*.ts, src/**/*.tsx, vite/client, vite.config.ts (+18 more)

### Community 7 - "lancamentos.$id.tsx"
Cohesion: 0.10
Nodes (17): AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter(), AlertDialogHeader(), AlertDialogOverlay, AlertDialogTitle (+9 more)

### Community 8 - "etapa.ts"
Cohesion: 0.11
Nodes (33): anulacaoConcluida(), completudeConvenio(), diasCorridos(), emAtraso(), empenhoConcluido(), etapa6Concluida(), ETAPA_LABELS, ETAPA_PIPELINE (+25 more)

### Community 9 - "routeTree.gen.ts"
Cohesion: 0.08
Nodes (25): AuthenticatedAuditoriaRoute, AuthenticatedConfiguracoesRoute, AuthenticatedConveniosRoute, AuthenticatedDashboardRoute, AuthenticatedLancamentosIdRoute, AuthenticatedLancamentosIndexRoute, AuthenticatedLogsAcessoRoute, AuthenticatedPisoIdRoute (+17 more)

### Community 10 - "AgingList.tsx"
Cohesion: 0.50
Nodes (4): AgingItem, AgingList(), DOT, TEXTO_DIAS()

### Community 11 - "cn"
Cohesion: 0.16
Nodes (17): EsteiraStepper(), ButtonProps, buttonVariants, Calendar(), CalendarDayButton(), Pagination(), PaginationContent, PaginationEllipsis() (+9 more)

### Community 12 - "ImportarHistoricoPC.tsx"
Cohesion: 0.21
Nodes (19): xlsx, ImportarHistoricoPC(), Resultado, Progress, COLUNAS_PC, LinhaImport, mapSituacaoBaixa(), mapStatusCgm() (+11 more)

### Community 13 - "components.json"
Cohesion: 0.11
Nodes (18): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+10 more)

### Community 14 - "Plano de Implementação — Sistema de Gestão e Auditoria de Empenhos"
Cohesion: 0.12
Nodes (16): 0. Stack atual (mapeada no código), 1. Diagnóstico — o que está bom e o que está ruim, 2. Princípios e referências teóricas que guiam o plano, 3. Roadmap em fases, 4. Qualidade de engenharia (transversal a todas as fases), 5. Decisões tomadas (definidas com o solicitante em 2026-06-21), 6. Sequência recomendada de execução, FASE 0 — Fundação de Segurança & Conformidade (LGPD/ISO 27001) (+8 more)

### Community 15 - "menubar.tsx"
Cohesion: 0.12
Nodes (11): Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarLabel, MenubarRadioItem, MenubarSeparator, MenubarShortcut() (+3 more)

### Community 16 - "types.ts"
Cohesion: 0.14
Nodes (12): requireSupabaseAuth, supabaseAdmin, CompositeTypes, Constants, Database, DatabaseWithoutInternals, DefaultSchema, Enums (+4 more)

### Community 17 - "__root.tsx"
Cohesion: 0.16
Nodes (9): Toaster(), ToasterProps, LovableErrorOptions, LovableEvents, reportLovableError(), Window, ErrorComponent(), Route (+1 more)

### Community 18 - "FileRoutesByPath"
Cohesion: 0.12
Nodes (17): Route, Route, Route, Route, Route, Route, Route, Route (+9 more)

### Community 19 - "utils.ts"
Cohesion: 0.23
Nodes (7): CurrencyInput(), CampoBlur(), Pendencias(), HoverCardContent, Input, Slider, Textarea

### Community 20 - "server.ts"
Cohesion: 0.24
Nodes (8): attachSupabaseAuth, consumeLastCapturedError(), renderErrorPage(), fetch(), getServerEntry(), normalizeCatastrophicSsrResponse(), ServerEntry, errorMiddleware

### Community 21 - "dependencies"
Cohesion: 0.15
Nodes (13): cmdk, lucide-react, dependencies, cmdk, lucide-react, @radix-ui/react-checkbox, @radix-ui/react-progress, react-day-picker (+5 more)

### Community 22 - "Módulo Piso da Enfermagem"
Cohesion: 0.25
Nodes (11): BlocoAssinaturas, Competência mensal, Esteira de oito etapas, historico_logs, Módulo Piso da Enfermagem, Configuração matricial de assinaturas, Gestão de Empenhos, historico_logs (+3 more)

### Community 23 - "devDependencies"
Cohesion: 0.18
Nodes (11): eslint, eslint-plugin-prettier, eslint-plugin-react-hooks, @lovable.dev/vite-tanstack-config, devDependencies, eslint, eslint-plugin-prettier, eslint-plugin-react-hooks (+3 more)

### Community 24 - "command.tsx"
Cohesion: 0.20
Nodes (8): Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut()

### Community 25 - "context-menu.tsx"
Cohesion: 0.20
Nodes (9): ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuShortcut(), ContextMenuSubContent (+1 more)

### Community 26 - "dropdown-menu.tsx"
Cohesion: 0.20
Nodes (9): DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut(), DropdownMenuSubContent (+1 more)

### Community 27 - "table.tsx"
Cohesion: 0.22
Nodes (8): Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow

### Community 28 - "2. E-mail institucional — opcional, passo a passo detalhado ✉️"
Cohesion: 0.20
Nodes (9): 1. In-app (tempo real) — funciona após aplicar as migrações ✅, 2. E-mail institucional — opcional, passo a passo detalhado ✉️, Definir os segredos (vale para as duas formas), Importante sobre o Lovable Cloud, Notificações automáticas, O que você precisa antes, O que é um Database Webhook (em português claro), Passo 2 — ligar o disparo (duas formas, escolha UMA) (+1 more)

### Community 29 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, build:dev, dev, format, lint, preview, test

### Community 30 - "breadcrumb.tsx"
Cohesion: 0.25
Nodes (7): Breadcrumb, BreadcrumbEllipsis(), BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator()

### Community 31 - "drawer.tsx"
Cohesion: 0.25
Nodes (6): DrawerContent, DrawerDescription, DrawerFooter(), DrawerHeader(), DrawerOverlay, DrawerTitle

### Community 32 - "navigation-menu.tsx"
Cohesion: 0.25
Nodes (7): NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle, NavigationMenuViewport

### Community 33 - "toggle-group.tsx"
Cohesion: 0.33
Nodes (5): ToggleGroup, ToggleGroupContext, ToggleGroupItem, Toggle, toggleVariants

### Community 34 - "Plano de ajustes V2 (2026-06-23)"
Cohesion: 0.20
Nodes (9): Decisões confirmadas (2026-06-23), Fase 1 — Quick wins (baixo risco, alto valor), Fase 2 — Teto / Complemento (corrige a perda de dados do item 5), Fase 3 — Sem emojis, Fase 4 — Reestruturação do Processo (a maior), Fase 5 — Assinaturas (sobre a nova estrutura), Fase 6 — Alertas inteligentes do Dashboard, Perguntas pendentes (ver chat) antes da Fase 2 e 4. (+1 more)

### Community 36 - "package.json"
Cohesion: 0.40
Nodes (4): name, private, sideEffects, type

### Community 37 - "Plano de ação — ajustes (2026-06-23)"
Cohesion: 0.22
Nodes (8): Decisões/assunções a confirmar — ver perguntas, Fase A — Correções de exibição (rápidas, baixo risco), Fase B — Assinaturas/Configurações, Fase C — Etapa 4 (Liberação de Recurso) reorganizada, Fase D — Finalização + PDF, Fase E — Extras, Já feito, Plano de ação — ajustes (2026-06-23)

### Community 38 - "alert.tsx"
Cohesion: 0.40
Nodes (4): Alert, AlertDescription, AlertTitle, alertVariants

### Community 39 - "input-otp.tsx"
Cohesion: 0.40
Nodes (4): InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot

### Community 40 - "router.tsx"
Cohesion: 0.40
Nodes (4): getRouter(), Register, routeTree, startInstance

### Community 41 - "TanStack Start application"
Cohesion: 0.50
Nodes (4): shadcn/ui configuration, ESLint configuration, TanStack Start application, TypeScript configuration

### Community 42 - "EtapaStepper.tsx"
Cohesion: 0.67
Nodes (3): EtapaStepper(), ORDEM, etapaLabel

### Community 43 - "avatar.tsx"
Cohesion: 0.50
Nodes (3): Avatar, AvatarFallback, AvatarImage

### Community 44 - "index.ts"
Cohesion: 0.50
Nodes (3): RESEND_API_KEY, SERVICE_ROLE, SUPABASE_URL

### Community 46 - "sobre.tsx"
Cohesion: 0.12
Nodes (7): AccordionContent, AccordionItem, AccordionTrigger, COR, EtapaF2, ETAPAS, ETAPAS_F2

### Community 47 - "prestacao-contas.tsx"
Cohesion: 0.12
Nodes (26): NIVEL_BADGE, PrestacaoContas(), TIPO_INTERACAO, primeiraCompetencia(), diasEntre(), ESTEIRA_PC, EtapaPcSlug, etapaPrestacao() (+18 more)

### Community 49 - "label.tsx"
Cohesion: 0.15
Nodes (11): FormControl, FormDescription, FormFieldContext, FormFieldContextValue, FormItem, FormItemContext, FormItemContextValue, FormLabel (+3 more)

### Community 52 - "Conformidade — LGPD & ISO/IEC 27001"
Cohesion: 0.29
Nodes (6): 1. Registro das Operações de Tratamento (ROPA) — LGPD Art. 37, 2. Controles de segurança implementados (Fase 0), 3. Validação dupla (defesa em profundidade), 4. Pendências de conformidade (próximas fases), 5. Operação — primeira configuração, Conformidade — LGPD & ISO/IEC 27001

### Community 54 - "configuracoes.tsx"
Cohesion: 0.21
Nodes (9): Switch, registrarAcesso(), AuthPage(), AssinaturasMatriz(), Avancado(), CARGOS, NotifLog(), SignatariosManuais() (+1 more)

### Community 58 - "Plano — Reengenharia do "Processo de Empenho" (lançamento)"
Cohesion: 0.33
Nodes (5): Decisões confirmadas (2026-06-21), Plano — Reengenharia do "Processo de Empenho" (lançamento), Pré-requisito, Schema (migração nova — aplicar via SQL editor), UI — aba "Processo de Empenho" (stepper dirigido)

### Community 117 - "auth.tsx"
Cohesion: 0.31
Nodes (4): CardDescription, TabsContent, TabsList, TabsTrigger

### Community 118 - "dateTime"
Cohesion: 0.29
Nodes (15): agruparLogs(), formatarValor(), LABELS, mudancasVisiveis(), OCULTOS, rotuloCampo(), dateTime(), statusAcoLabel (+7 more)

### Community 119 - "auditoria.tsx"
Cohesion: 0.15
Nodes (15): ColunaEtapa(), EsteiraColuna, EsteiraProcesso(), SaldoBar(), brl(), brlCompact(), CtxRelatorio, esc() (+7 more)

### Community 121 - "CompetenciaField.tsx"
Cohesion: 0.53
Nodes (5): CompetenciaField(), getProximoMes(), join(), split(), CompetenciaInput()

### Community 122 - "linkValido"
Cohesion: 0.33
Nodes (7): SeiButton(), SeiLink(), statusAcoEfetivo(), hrefSei(), linkValido(), etapa6F2Completa(), progresso()

## Knowledge Gaps
- **411 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `css` (+406 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **66 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `carousel.tsx`, `ImportarHistoricoPC.tsx`, `package.json`, `clsx`, `date-fns`, `embla-carousel-react`, `input-otp`, `@radix-ui/react-alert-dialog`, `@radix-ui/react-aspect-ratio`, `@radix-ui/react-avatar`, `@radix-ui/react-collapsible`, `@radix-ui/react-context-menu`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-hover-card`, `@radix-ui/react-label`, `@radix-ui/react-menubar`, `@radix-ui/react-navigation-menu`, `@radix-ui/react-popover`, `@radix-ui/react-radio-group`, `@radix-ui/react-scroll-area`, `@radix-ui/react-select`, `@radix-ui/react-separator`, `@radix-ui/react-slider`, `@radix-ui/react-slot`, `@radix-ui/react-switch`, `@radix-ui/react-tabs`, `@radix-ui/react-toggle`, `@radix-ui/react-toggle-group`, `@radix-ui/react-tooltip`, `react-dom`, `react-hook-form`, `react-resizable-panels`, `recharts`, `sonner`, `tailwind-merge`, `tailwindcss`, `@tailwindcss/vite`, `@tanstack/react-query`, `@tanstack/react-router`, `@tanstack/react-start`, `@tanstack/router-plugin`, `tw-animate-css`, `vaul`, `vite-tsconfig-paths`, `zod`, `@hookform/resolvers`, `@radix-ui/react-accordion`, `class-variance-authority`?**
  _High betweenness centrality (0.286) - this node is a cross-community bridge._
- **Why does `xlsx` connect `ImportarHistoricoPC.tsx` to `dashboard.tsx`, `DocumentoCard.tsx`, `dependencies`?**
  _High betweenness centrality (0.172) - this node is a cross-community bridge._
- **Why does `cn()` connect `cn` to `dashboard.tsx`, `sidebar.tsx`, `carousel.tsx`, `lancamentos.$id.tsx`, `ImportarHistoricoPC.tsx`, `menubar.tsx`, `utils.ts`, `command.tsx`, `context-menu.tsx`, `dropdown-menu.tsx`, `table.tsx`, `breadcrumb.tsx`, `drawer.tsx`, `navigation-menu.tsx`, `toggle-group.tsx`, `alert.tsx`, `input-otp.tsx`, `EtapaStepper.tsx`, `avatar.tsx`, `sobre.tsx`, `prestacao-contas.tsx`, `label.tsx`, `configuracoes.tsx`, `auth.tsx`, `radio-group.tsx`, `CompetenciaField.tsx`, `scroll-area.tsx`?**
  _High betweenness centrality (0.159) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _411 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `dashboard.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06252123683316343 - nodes in this community are weakly interconnected._
- **Should `BlocoAssinaturas.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.12105263157894737 - nodes in this community are weakly interconnected._
- **Should `sidebar.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05959183673469388 - nodes in this community are weakly interconnected._