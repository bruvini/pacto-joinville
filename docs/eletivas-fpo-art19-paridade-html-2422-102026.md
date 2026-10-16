# Eletivas — Tela 04 · FPO — programação · Art. 19

Referência **congelada**: `Auditoria - Cirurgias Eletivas - 102026(1).html` v2.42.2, SHA-256 `75494e80e28fc59596e43a2ba0fb7a0caf9a50bafbd3a5f4c94dd95a22fe7186`.
Corpo original da tela: `renderFpo()`, linhas ~6194–6281. Classes originais: `.fpo-hero`, `.fx-contact-grid`, `.reg-group-panel`, `.playbook`, `.fpo-rule`, `.fpo-formula`, `.fpo-note5`, `.kpis`, `.ledger`, `.empty`, `.fpo-source`.

## Implementação

- Novo componente `src/components/eletivas/FpoArt19Eletivas.tsx` renderizado **exclusivamente** em `aba==="fpo"`. Desacopla a antiga interface FPO híbrida de `PainelEletivas.tsx`, sem alterar o Painel/Fluxo 1 ou 2.
- Novo CSS escopado `src/styles/eletivas-reference-fpo.css`. Base são os seletores, tipografia, cores e distâncias originais do HTML, com ajustes de comportamento responsivo para a aplicação.
- A sequência é **hero → contatos Central de Regulação/GEMAS → regularizações FPO → playbook GEMAS → três cartões das parcelas → fórmula → aviso por vigência → fonte oficial → quatro KPIs (quando aplicável) → tabela FPO × produção → Nota 05/2026 → programação local → regra operacional**.
- Os fluxos de regularização vêm de `eletivas_fpo_fluxos` associados às competências acessíveis do mesmo prestador; a listagem agrupa por competência e permite expandir os eventos principais. O valor é **estimado**, nunca contabilizado como pagamento.
- Fonte FPO oficial verificada no inventário `eletivas_arquivos`; os parâmetros individualizados (financiamento, SIGTAP, federal, complemento CIB, Nota 05) vêm exclusivamente da memória `detalhe.fpo_oficial` persistida pelo motor. Se a fonte não foi cruzada com itens, o painel explicita a lacuna.
- O helper `src/lib/eletivas/memoriaFpoHtml.ts` monta a memória informativa, **sem escrever dados**: não duplica a quantidade local do complemento, não estima quantidade ausente, usa centavos nos confrontos unitários, aplica a Nota 05/2026 apenas em agosto/2026 ou posterior, limita residual matemático a zero e não transforma parâmetro federal em comprovante.
- Os três códigos explicitamente citados na Nota 05/2026 são `040701003`, `041304002` e `040901018`. Quando não há referência individual persistida para o código, o quadro mostra valores não disponíveis, **não inventa o preço** e distingue falta de memória de ausência na FPO oficial. O HTML standalone lê toda a FPO em memória, enquanto o React recupera as linhas persistidas em `eletivas_itens`; por isso **paridade de valores destes três códigos ainda depende da mesma fonte oficial e do confronto fiscal**, não deve ser declarada concluída apenas pelos testes de layout.
- O formulário institucional anterior (`ProgramacaoFpoEletivas`) foi **preservado, não duplicado**, em uma seção expansível chamada “Comprovação institucional da FPO · documentos e registros”, carregada sob demanda. Registra comprovantes efetivos por período, publicações independentes de AIH e atos especiais com trilha SEI. Não cria crédito por si só.
- Nenhuma alteração em RLS, SQL, motor de atesto, valor contabilizado, perfis, arquivos privados ou controle de competências.

## Roteiro de conferência no Lovable

1. Atualize o preview da `main` e abra HMSJ **07/2026 → FPO · Art. 19**. Compare o hero, dois contatos, regularizações, três cartões e fórmula com o standalone.
2. **Julho/2026**: deve apresentar a Nota Informativa 05/2026 **como referência futura**. Não recalcular retroativamente julho.
3. **Agosto/2026 ou posterior**: sem arquivo FPO oficial, deve aparecer aviso solicitando ODS/XLSX em Fontes de apoio. Com fonte cadastrada e processada, verificar quatro KPIs e tabela de nove colunas; conferir cada procedimento, quantidade e unitários comparando com o HTML e fontes originais.
4. Abra a tabela da Nota 05/2026 e confira os três códigos listados. Onde o valor estiver indisponível, é preciso verificar o arquivo original — não completar manualmente com valores presumidos.
5. Expanda regularizações: fluxo deve exibir **competência de origem, AIH, etapa, situação, valor estimado**. O acesso a outras competências preserva o vínculo ao lançamento.
6. Abra “Comprovação institucional da FPO · documentos e registros”: confira comprovantes com vigência/SEI. Verifique que registro documental não altera o atesto sem processamento e decisão fiscal.
7. Compare a mesma competência em desktop (1440px) e celular (390px), testando os modais e a rolagem horizontal das tabelas.
8. Confirme que o total do Painel, o documento de atesto, o fechamento e os itens conciliados ficaram **inalterados**.

**Implantação:** só código. **Nenhum SQL novo**.
**Homologação:** testes automatizados da implementação não substituem confronto visual nem conferência fiscal da FPO oficial.
