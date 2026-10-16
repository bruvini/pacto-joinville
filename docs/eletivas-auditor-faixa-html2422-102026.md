# Eletivas · Tela 05 — Auditor de Faixa · HTML v2.42.2

Fonte visual e funcional: `Auditoria - Cirurgias Eletivas - 102026(1).html`, SHA256 `75494e80e28fc59596e43a2ba0fb7a0caf9a50bafbd3a5f4c94dd95a22fe7186`. Referências: `renderFaixas()`, `normativeContextBanner()`, `operationalContactsHtml()`, `nowBoxHtml()`, `communicationInlineHtml()` e funções de dossiê por AIH. CSS original `.fx-hero`, `.fx-kpis`, `.fx-card`, `.fx-facts`, `.fx-components`, `.fx-action-mini`, `.now-box`.

## Reconstrução da tela

- Substituída a antiga tabela de cinco colunas por cartões investigativos por **AIH** com cabeçalho, situação, faixa, deliberação, origem, chips dos procedimentos-filhos, justificativa, orientação de providência e ações.
- As cinco guias do HTML são **AIHs auditadas**, **Compatíveis**, **Revisar**, **Incompatíveis**, **Dependência FPO**. São filtros reais (botões com `aria-pressed`) e mostram quantidade de **AIHs distintas**, sem repetição quando um mesmo caso aparece em categorias diferentes.
- Hero original, banner de norma por competência (727 até julho/2026, 399 a partir de agosto/2026), contatos Central/GEMAS e rodapé de contagem seguem a estrutura do HTML. A pesquisa contextual já disponível no cabeçalho Lovable também filtra a lista.
- **Ver diagnóstico e ação** abre dossiê fiscal existente da linha, com o botão real para localizar a linha na Fila. **Como concluiu?** abre modal por AIH com cada procedimento-filho, código, QT, classificação nos Anexos e no workbook, fonte/linha e justificativa. A memória normativa é conferida pela função existente `classificacaoCIB`.
- Comunicação individual: a situação é consultada em `eletivas_comunicacoes`; o botão **definir destino** abre a área institucional de Comunicações, sem disparar e-mail nem inventar envio. **Regularizar FPO** abre a aba de oito etapas na página Comunicações com a AIH e o item selecionados; a gravação só ocorre mediante RPC existente `ec_fpo_iniciar` e ação do fiscal.
- A identidade da página usa as classes originais em `src/styles/eletivas-reference-faixas.css`, encapsuladas com `@scope (.ec-sc .ec-faixas-ref)`. Modais próprios também são isolados. Nenhum estilo global do app de empenhos é alterado.
- Não se mantém a antiga caixa adicional de verificador normativo **acima do hero**, que destoava da disposição original; a deliberação está no banner e o cruzamento fica em “Como concluiu?”.

## Limites e preservação da prova

- O motor atual persiste o perfil normativo por AIH em `eletivas_itens.detalhe.perfil` (FAEC) ou `detalhe.aihs` (MAC). Quando não houver identificação válida de AIH de 13 dígitos, não se inventa um cartão individual; a ausência de workbook/composição aparece como diagnóstico de fonte ausente.
- A classificação já persistida é respeitada, **mas memórias conflitantes, filho não recuperado ou divergência com a matriz congelada recebem Revisar**. O React não transforma esse alerta em decisão fiscal nem modifica o lançamento original.
- A evidência exibida no dossiê é por item vinculado; se múltiplas AIHs compartilham o mesmo envelope MAC, valores agregados não são repartidos artificialmente entre elas.
- Não há nova RPC, migration, tabela, cálculo financeiro, criação de correção, alteração de atesto ou encerramento automático de fluxo.
- Dossiês não autenticam documentos SEI nem assinam documentos institucionalmente.

## Roteiro de homologação no Lovable

1. Atualize a `main`, abra HMSJ **07/2026 → Auditor de faixa**. Compare com o HTML: hero, CIB 727, Central/GEMAS, cinco filtros e cartões.
2. Clique **AIHs auditadas**, **Compatíveis**, **Revisar**, **Incompatíveis**, **Dependência FPO**. Verifique números e lista; uma AIH em dois componentes não deve ser contada duas vezes.
3. Abra **Como concluiu?** para uma AIH com filhos; compare códigos, classificação Federal/Estadual/Ambos, QT, fonte e memória com o workbook e os Anexos vigentes.
4. Abra **Ver diagnóstico e ação** e depois **Abrir item na fila**. Deve navegar ao item financeiro investigável, sem criar dados.
5. Em um caso FPO, clique **Regularizar FPO**. Deve abrir a guia correspondente de Comunicações com AIH e item preenchidos, **sem gravar** nem enviar solicitação automaticamente.
6. Clique **definir destino** e confira a comunicação já registrada ou crie uma encaminhamento justificado via fluxo institucional.
7. Teste competência **08/2026**: banner 399/CIB/2026 e classificação pelos respectivos anexos; ausência de fonte deve gerar “não disponível”, nunca compatibilidade presumida.
8. Compare 1440px e 390px; verifique acessibilidade básica e rolagem dos dossiês. Reconfira o total do Painel e do atesto: deve estar **inalterado**.

**SQL:** nenhum nesta entrega. **Homologação fiscal e visual:** pendente até comparação com os mesmos arquivos oficiais no standalone e prints da interface autenticada do Lovable.
