# Eletivas HMSJ — Fase 5: RTMA, Análise, Encaminhamentos SES e XLSX

## Origem e limites da comparação
Esta fase comparou o componente `renderAtesto()`, `buildRelAnalise()`,
`buildOficio()` e `aggregates()` do arquivo de referência
`Auditoria_Cirurgias_Eletivas_EC_HMSJ_Ajustado (1).html`, fornecido pelo
usuário. O modelo HTML é referência **estrutural**, não fonte de pagamento
autenticado nem autorização para alterar os valores da base.

As planilhas e a publicação estadual precisam continuar sendo confrontadas
pelo fiscal, caso a caso, antes do RTMA final. Um teste estrutural não
substitui cotejo célula a célula do resultado de 07/2026 com documentos
assinados e tabelas do HTML em sua versão de homologação mais recente.

## Matriz de RTMA

| Linha HTML | Item Fase 5 | Fonte financeira |
|---|---|---|
| Produção e Complemento FAEC SIH | faecPC | faec_prod + faec_compl |
| Múltiplas e Sequenciais FAEC | faecMS | faec_mult |
| Complemento Tabela MAC | macC | mac_compl |
| Múltiplas e Sequenciais MAC | macMS | mac_mult |
| Produção FAEC com faixa MAC | fxMac | mac_fxfaec (recorte faec_fxmac não é somado) |
| Produção MAC | macP | mac_prod (separada do complemento) |
| MAC faixa Federal | macFed | mac_fxfed quando identificado |
| SIA — Produção e Complemento | sia | sia_faec + sia_mac |
| Correções anteriores | adicional após quadro | somente correções aprovadas |
| Valor total contemplado | soma conferida | soma do motor, sem edição |

**Diferenças intencionais em relação ao HTML:**
- O HTML original permitia editar `data-ln` e recalcular um total digitado.
  O novo RTMA é **somente leitura**; qualquer diferença precisa entrar como
  correção fiscal auditável (Fase 4).
- A categoria `faec_fxmac` é recorte de controle e não recebe duplicação
  no total, mesmo quando apareça na mesma linha visual de `mac_fxfaec`.
- O HTML fazia rateios por AIH quando não encontrava uma parcela individual.
  A Fase 5 **não inventa rateios**: exibe AIHs, QT e valores realmente
  presentes nas fontes; o subtotal continua na categoria.
- "Quantidade de cirurgias" só é apresentada como consolidado definitivo
  quando há identificação suficientemente completa das AIHs por fonte;
  do contrário aparece como **a validar**, com quantidade identificada.
- Mesmo quando há parecer, documento SEI e fiscal declarados, todo texto
  é **MINUTA**, até conferir assinatura e autenticação no SEI.
- A disponibilidade do HTML citado não certifica que ele seja a última
  versão usada pela equipe. Homologar a versão institucional mais recente.

## Estrutura do RTMA para cópia no SEI
Proponente; Oferta de Serviço; Período de Execução; Parceria nº; Parcela nº;
Objeto Pactuado; Amparo Legal; Competência; Quantidade de Cirurgias;
Quadro financeiro das linhas acima; Total do Encontro de Contas; Verificação;
Análise detalhada; Informações pertinentes; Parecer da Comissão; Portaria
de designação; Fiscais declarados; proposta de fundamentação. Nenhum destes
campos declara assinaturas efetivas.

Os modelos usam HTML com estilos básicos de tabela (bordas, células e
colunas) em `text/html` e cópia alternativa `text/plain`. O editor SEI
pode adaptar os estilos; conferir o resultado antes de assinar.

## Relatório de Análise
Separa a análise por categoria, código SIGTAP e AIH. Para cada linha,
apresenta publicado, esperado, admitido provisoriamente, situação, decisão,
conferência, QT e trilha (origem, campo/aba/célula quando disponíveis).
As AIHs vinculadas aparecem em tabela informativa, sem alocação fictícia
de complemento. Ao final, apresenta reconciliação aritmética com o quadro
do RTMA, incluindo as correções aprovadas.

## Encaminhamentos SES
- **Assunto do e-mail** e **corpo** são copiados separadamente;
  nenhuma mensagem é enviada diretamente pelo aplicativo.
- Só entram na **cobrança líquida** os itens marcados `oficio` e
  conferidos, com diferença positiva superior a R$ 0,02 e sem
  necessidade de prova adicional (FPO, publicação independente etc.).
- O valor financeiro é diferença positiva **esperado − publicado**,
  considerando os componentes e a decisão fiscal. Não somar recortes
  informativos, envelopes de controle nem valor `analise`.
- Itens em `analise` ou ofícios sem prova/vigência/documento entram
  como **solicitação técnica**, fora do total de cobrança.
- Se a cobrança líquida é zero, a tela exibe **alerta** e nunca
  apresenta o pedido como dívida definida.
- São listados procedimento, AIH, categoria, diferença, justificativa,
  referências de origem/célula e indicação de Deliberação.
  A aplicação normativa deve ser validada para a competência.

## XLSX expandido (13 abas)
Resumo; FAEC; MAC; SIA; Multiplas; Fila; Dossies; AIHs e Filhos;
FPO; Correcoes; Proveniencia; Parecer; SES Encaminhamentos.

Os números financeiros permanecem numéricos (células Excel) e formatados
como moeda. Controle de faixa não é somado novamente. Correções
pendentes/rejeitadas aparecem na memória mas só as aprovadas somam.
A planilha inclui hashes e arquivos das fontes quando registrados.
Campos nominativos do paciente não são exportados; eventuais campos
inesperados na memória técnica são sanitizados.

## Implantação e verificações
1. Confirmar Fase 4 aplicada: a verificação de 07/2026 retornou
   0 registros legados, 0 migrados, 0 duplicados e R$ 0,00 em ajustes
   aprovados.
2. Atualizar o Lovable a partir da `main`; **não há nova migration
   nesta fase**, pois os campos `documentos` (JSON) e tabelas das Fases
   3/4 já suportam metadados, fontes, FPO e correções.
3. Em **Documentos**, preencher: SEI do RTMA e Análise, números/links,
   amparo legal, portaria, parceria, objeto, oferta de serviço e
   fiscais responsáveis. Selecionar parecer e fundamentar.
4. Salvar referências documentais; verificar o quadro (somente leitura).
   Parecer de validação total é bloqueado na interface se houver
   decisões/conferências/correções pendentes.
5. Alternar RTMA, Relatório de Análise e Encaminhamentos SES.
   Copiar HTML formatado para SEI e conferir estrutura, linhas, valores,
   tabelas, assinaturas e número SEI.
6. Gerar **XLSX completo**: conferir os valores de FAEC/MAC/SIA,
   múltiplas, FPO, correções e referências de origem.
7. Homologar contra o RTMA/Análise reais de **07/2026**, célula a célula,
   antes do uso institucional.

A identidade do usuário no aplicativo, a digitação de um SEI e a lista
de signatários **não são autenticação ou assinatura digital SEI**.
O ato de encaminhar, atestar e assinar permanece fora do sistema.
