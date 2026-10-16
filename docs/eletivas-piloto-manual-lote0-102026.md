# Lote 0 e piloto 11 — reconstrução literal do Manual HTML v2.42.2

**Estado:** primeira implementação da nova metodologia tela por tela. Não implica aprovação visual do Lovable; depende de prints reais para homologação.

## Fonte da verdade

O arquivo fornecido em 16/10/2026 — `Auditoria - Cirurgias Eletivas - 102026(1).html` — SHA-256 `75494e80e28fc59596e43a2ba0fb7a0caf9a50bafbd3a5f4c94dd95a22fe7186`.

O conteúdo da seção `#v-manual` foi **copiado do arquivo original**, não sintetizado pela IA. Material versionado como `src/components/eletivas/reference/manual-v2422.html`. O HTML mantém hero original “Do arquivo do Estado ao atesto no SEI”, 10 capítulos `m-inicio` até `m-biblio`, seis passos, três tabelas, 3 checagens, 5 destinos, links normativos e fluxograma BPMN (minitasks, gateways, fluxos, casos).

Os estilos extraídos do CSS original do Manual (incluindo `v3.0 Manual do processo`, blocos BPMN e tabelas legadas) estão em `src/styles/eletivas-reference-manual.css`, encapsulados em `@scope (.ec-sc .ec-manual-ref)`. A tipografia de referência utiliza Fraunces/Public Sans/Spline Sans Mono, com fallbacks. Os demais componentes não recebem estes seletores.

A bandeira **original, sem redesenho**, foi extraída da imagem WebP embutida no HTML e armazenada em `public/eletivas/referencia/bandeira-sc.webp`; a shell agora usa esse asset. Não são incluídas fontes binárias no repositório.

## Adaptações institucionais mínimas

- `ManualProcessoEletivas` importa o arquivo estático original por `?raw`, sob revisão de código e sem incorporar HTML de usuários. O índice original `manToc` (preenchido dinamicamente no standalone) vira índice navegável de 10 âncoras no React; atualização do item ativo acessível por teclado.
- Acima do manual, bloco **identificado como adaptação** esclarece que o texto original contém referências à operação local do HTML, mas no Lovable a competência vem do lançamento/parcela do Fluxo 1, CNES é imutável por vínculo e dados são privados no Supabase; RTMA/Análise oficiais são formalizados na Etapa 6 do lançamento. **Nenhuma frase do manual histórico foi silenciosamente apagada ou reescrita.**
- `eletivas.$id.tsx` mantém o controle de competência existente e todos os dados. A linha do tempo fica recolhida em “Ferramentas institucionais”, fora do conteúdo do Manual; não se perdem eventos.
- CSS da bandeira e tipografia não altera as telas de outros módulos. A futura etapa “Shell completa” ainda precisará confrontar cada pixel e componente da sidebar e do topo em capturas com autenticação.

## Testes e roteiro de conferência

1. Atualizar o preview Lovable com o commit desta etapa; abrir **Encontro de Contas → competência 07/2026 → Manual do processo**.
2. O título central deve ser **“Do arquivo do Estado ao atesto no SEI”**; a seção deve começar com hero verde-escuro, detalhes vermelho/verde, fatos “6 passos / 3 checagens por item / 5 destinos possíveis”.
3. Conferir índice horizontal fixável ao rolar: **Início**, **Passo a passo**, **Deliberações CIB**, **Fluxo BPMN**, **Princípio**, **Fontes**, **Checagens**, **Destinos**, **Base normativa**, **Biblioteca**. Clicar em cada âncora deve deslocar até o capítulo correto, sem trocar rota ou perder sessão.
4. Conferir **seis cartões de passos** com texto integral, **três tabelas**, cartões de checagens e destinos, alertas, normativas e **fluxograma completo** sem cortes.
5. Conferir a **bandeira catarinense original** no cabeçalho. O contexto (CNES e competência) continua read-only e ligado à parcela. Conferir Histórico institucional na área recolhida, sem exibir objetos JSON crus por padrão.
6. Repetir em **1440×900**, **900×900**, **390×844**; usar a mesma escala/zoom e a mesma posição do scroll para sobrepor screenshots HTML e Lovable. Ajustar qualquer diferença de fontes, margem, largura, flowchart e comportamento antes de aprovar.
7. Testar perfis ACP/Admin e leitor, navegação por teclado, links em nova aba com `noopener noreferrer`, e confirmar não alteração das telas de Fluxo 1/2 e do motor de cálculos.

**Sem SQL novo.** Nenhuma migration SQL acompanha a reconstrução visual deste lote.

## Paridade ainda não homologada

O teste automatizado `src/lib/eletivas/paridadeManual.test.ts` confere integralidade, textos, contadores, diagrama, CSS, isolamento e vínculo com a infraestrutura. **Não compara screenshots reais**. A paridade visual e o comportamento em aparelho real dependerão de captura no Lovable e validação do fiscal.

Próximo passo após aceite deste piloto: **Tela 01 Fontes da competência**, comparando hero, dropzone, ajuda TabWin, categorias, slots, diagnósticos, estado de execução e persistência.
