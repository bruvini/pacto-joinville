# Paridade fiel v2.42.2 — Correções do Manual + Tela 01 Fontes da competência

## Referência imutável

`Auditoria - Cirurgias Eletivas - 102026(1).html` (SHA-256 `75494e80e28fc59596e43a2ba0fb7a0caf9a50bafbd3a5f4c94dd95a22fe7186`). Trechos-alvo: `#v-manual` (Manual) e `#v-arquivos` (Fontes). A tela Fontes usa exatamente a hierarquia e os textos da referência: hero, pergunta TabWin, layout de importação, orientação lateral, quatro grupos de slots, barra `run-dock`, `techlog`.

## Ajustes solicitados no Manual

- A interface não renderiza **Adaptação institucional no Lovable**, **Capítulo selecionado** nem rodapé técnico depois do último capítulo. O arquivo literal `reference/manual-v2422.html` permanece intocado.
- O índice horizontal `man-toc` passa a `position:static`, rolando com a página. É uma **diferença intencional solicitada pelo fiscal** em relação ao HTML de referência, cujo índice tinha `position:sticky`.
- A Linha do tempo institucional e os seus eventos continuam preservados, mas seu painel aparece na seção **Exportar**, fora do Manual. A identidade CNES/competência e o vínculo à parcela permanecem no contexto lateral.
- Nenhum SQL ou valor financeiro mudou.

## Reconstrução da Tela 01

### Layout

1. Hero `.files-hero` branco com faixa vermelha/verde, selo `01 Preparação da competência`, título literal e botão **Como gerar as tabulações no TabWin**.
2. Área `.intake-layout`: dropzone branco (arrastar/selecionar lote, ícone vermelho de adicionar, tags de formatos) e painel de instruções verde-escuro **O que você precisa reunir**.
3. Quatro grupos `.sources-board > .source-section` na sequência original: **Tabulações locais**, **Retorno SES · hospitalar**, **Retorno SES · ambulatorial**, **Fontes de apoio**. Cada evidência aparece como slot, com selo DBF/XLSX, exigência, estado vazio/preenchido, nome do arquivo e versão, botão para seleção ou download (se autorizado).
4. Barra de análise `.run-dock` com contagem de categorias registradas, faltantes e botão vermelho **Analisar competência**.
5. Diagnósticos recolhidos em `.techlog`.

Os componentes `files-hero`, `intake-side`, `slot`, `run-dock` usam classes e estilos extraídos do HTML original, encapsulados em `@scope (.ec-sc .ec-fontes-ref)` em `src/styles/eletivas-reference-fontes.css`. **Não altera CSS global do Lovable.**

### Guia TabWin

`src/components/eletivas/reference/tabwin-v2422.html` guarda o guia operacional **literal** do HTML com os três painéis SIH FAEC, SIH MAC e SIA. `TabwinGuiaEletivas` adapta a abertura para um modal React acessível e a navegação de guias para eventos React. Não copia `localStorage` nem estilos externos. Os arquivos seguem sendo reconhecidos por estrutura, não por nome.

### Adaptações institucionais

- O clique nos slots abre um seletor de arquivo com classificação pré-selecionada. O fiscal ainda deve confirmar e passar pela **mesma validação estrutural** do lote; nenhum upload é realizado automaticamente ao escolher o arquivo.
- Arrastar múltiplos arquivos alimenta um quadro de conferência de papel e erros. Só o botão de registro desencadeia armazenamento privado; todos os arquivos são validados antes, com limpeza compensatória se ocorrer erro.
- Arquivos existentes são obtidos de `eletivas_arquivos`, com URL privada assinada de curta duração e SHA-256. O cache de análises do HTML em `localStorage` não é reproduzido: a competência institucional é recuperada na navegação existente do sistema, vinculada ao lançamento do Fluxo 1.
- O botão **Analisar competência** chama `executarPreConciliacaoLocal`, o mesmo processamento que já existia na aba de auditoria; valida SHA/CNES/layout e impede gravação parcial em caso de fonte inválida. A fila fiscal continua independente da conciliação automática.
- O registro individual de fonte é mantido recolhido, por ser função adicional do Lovable. O botão de análise fica bloqueado para perfil sem permissão, fonte obrigatória ausente, lote pendente ou operação ativa.
- O consolidado SES permanece evidência separada e não vira crédito reconhecido sem comprovação.

## Homologação visual e comportamental — pendente até capturas do Lovable

Comparar o HTML original com a UI Lovable na mesma competência **07/2026**, CNES 2436469, nos tamanhos 1440×900 e 390×844:

- Tela vazia: hero, botão TabWin, dropzone, orientação, quatro grupos de fontes, slots, barra/avisos, diagnósticos.
- Guia TabWin: abrir e alternar as três guias, conferir rótulos/colunas e fechar com Esc.
- Importação de um lote válido: classificação automática, conferência, envio, hash, documento recuperável; campos obrigatórios liberam análise.
- Importação com arquivo inválido: pré-validação impede escrita de itens ou gravação de lote parcial.
- Lote com dois papéis iguais: bloquear confirmação.
- Após registro: botão **Analisar competência** executa o motor e atualiza a competência. Confirmar que nenhuma situação fiscal é aprovada automaticamente.
- Perfil leitura: não permite upload nem reprocessar.
- Manual: confirmar que termina no último conteúdo da biblioteca, sem adendo institucional, sem JSON, sem rodapé; rolar para verificar que o índice horizontal **não permanece fixo**.
- Exportar: verificar que o histórico institucional permanece disponível na área administrativa.

**SQL:** não há migration nesta entrega. **Implantação:** atualização de código via GitHub/Lovable, sem mutações de esquema.

**Critério para avançar para Tela 02 Painel:** capturas comparativas e teste funcional aprovados pelo fiscal. Testes automatizados do projeto verificam a estrutura e a preservação das travas, mas não substituem capturas reais autenticadas.
