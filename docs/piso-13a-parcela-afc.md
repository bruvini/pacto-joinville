# Piso da Enfermagem — 13ª parcela anual da Assistência Financeira Complementar

## Referências e limite normativo
- Ministério da Saúde, **Piso Nacional da Enfermagem: o que é a AFC**, edição preliminar 2026, introdução e pergunta 18, pág. impressa 18: **13 parcelas previstas em 2026, com dois repasses em novembro**. Cartilha é preliminar e não substitui a portaria específica de 2026.
  https://www.gov.br/saude/pt-br/centrais-de-conteudo/publicacoes/cartilhas/2026/cartilha-piso-da-enfermagem.pdf
- Título IX-A da Portaria de Consolidação GM/MS nº 6/2017 (AFC) e Lei nº 14.434/2022; EC nº 127/2022; ADI 7222.
- FNS, notícia e **Portaria GM/MS nº 8.964/2025**: a 13ª de 2025 possui ato próprio e cálculo conforme proporcionalidade e tempo efetivamente trabalhado. **Não copiar uma fórmula ou data de 2025 para 2026 sem ato próprio.**
  https://portalfns.saude.gov.br/ministerio-da-saude-dispoe-valores-da-decima-terceira-parcela-referentes-ao-piso-da-enfermagem/
- Lei nº 4.320/1964, arts. 58 a 65, empenho, liquidação e pagamento; LRF, LC nº 101/2000; **MCASP/STN, 11ª edição**, regime e reconhecimento contábil e financeiro.
  https://www.tesourotransparente.gov.br/publicacoes/manual-de-contabilidade-aplicada-ao-setor-publico-mcasp/2025/26

## Modelo de identificação
- `piso_competencias.competencia`: **MM/AAAA do repasse**, p.ex. `11/2026`.
- `tipo_parcela`: `mensal` ou `decimo_terceiro`. Competências antigas recebem `mensal`.
- `exercicio_referencia`: ano a que a 13ª se refere, mesmo que o repasse ocorra no ano seguinte.
- Uma mensal por MM/AAAA e **uma 13ª por exercício**. Os dois processos convivem em `11/2026`, com IDs, documentos, participantes, eventos, fontes e obrigações separados.
- Tipo e exercício da 13ª não são convertidos/alterados após a criação. Uma reclassificação exige procedimento administrativo específico.

## Conciliação orçamentária e financeira
Registrar e conferir separadamente: memória FNS/InvestSUS e ato ministerial (homologado, desconto de saldo, acertos, transferido), crédito bancário no FMS, Portaria Municipal, fonte e dotação, NE e sua cobertura, subempenho/liquidação e pagamento. Valor homologado **não equivale** a pagamento nem a saldo bancário.

O sistema **não presume** que o 13º seja a média de mensalidades ou um mês adicional idêntico: o cálculo deve observar a portaria anual, jornadas, proporcionalidade e vínculos elegíveis e partir da memória oficial. Não se duplicam NEs nem pagamentos. Os dados da 13ª são auditados por uma fonte própria, sem modificar a conciliação mensal por CPF/CNES.

## Evidência por CNES da 13ª
Na Etapa 2, guardar PDF oficial da portaria GM/MS e seu link no DOU; processar também a memória **específica da 13ª**. A ferramenta recebe uma planilha XLSX/CSV **normalizada e conferida com o original oficial**, com duas colunas explícitas:

```csv
CNES,VALOR AFC 13ª
1234567,"1500,00"
7654321,"2000,00"
```

A forma normalizada é um **contrato de importação do PACTO**, não uma garantia de que o MS publique sempre essas exatas colunas. Guarde o original obtido no FNS/InvestSUS e a correspondência documentada com esse extrato. O sistema não aceita CNES duplicado, inválido, não cadastrado ou compartilhado indevidamente por dois prestadores participantes; exige totalidade dos prestadores elegíveis.

A Edge Function `piso-processar-evidencia`, chamada com `categoria=afc13_cnes`, processa o arquivo com privilégios de serviço; a função SQL restrita `piso_aplicar_memoria_13_cnes` aplica valores em transação, registra hash, autor e log, e não deixa recalcular se já existem obrigações financeiras no processo.

Quando a memória de CNES compreender somente os prestadores privados, e o homologado da Portaria compreender também outras parcelas/servidores, registrar justificativa da divergência: **nunca ajustar automaticamente os valores para fechar o total**. A conciliação é um controle de correspondência documental, não uma afirmação de elegibilidade ou do valor individual do 13º.

## Competências, prazos e relatórios
- Não gerar alarmes artificiais de dias 5, 10 e 15 para a 13ª; usar datas da norma anual e registros reais do SEI.
- O fluxo de nove etapas é mantido, com evidência específica na Etapa 2.
- Documentos municipais distinguem a 13ª e o exercício. Referências DOU e ano devem ser conferidos.
- Dashboard consolida o mês **sem duplicar registros** e desagrega Mensal / 13ª; relatórios identificam origem.
- Arquivos permanecem privados, com SHA-256, trilha de autoria e histórico; acesso e RLS seguem os papéis institucionais.
- A prestação de contas às instituições e ao gestor e o registro no RAG obedecem ao Título IX-A e às orientações da cartilha. Evidências (folha, registros bancários e comprovantes) devem ser conservadas pelo prazo legal/regulamentar aplicável; a cartilha preliminar menciona ao menos cinco anos, sem substituir eventuais prazos superiores aplicáveis.

## Implantação e validação
1. Fazer backup/verificar competências existentes e rodar `supabase/migrations/20261009170000_piso_decima_terceira_parcela.sql` no SQL Editor do Lovable. A migration é transacional e retrocompatível; todas as competências existentes permanecem mensais.
2. Atualizar/reimplantar a **Edge Function** `piso-processar-evidencia` junto com o módulo.
3. Testar dois cadastros `11/2026` (mensal e 13ª de 2026); bloquear segunda mensal e segunda 13ª para o exercício, mesmo `12/2026`.
4. Conferir filtros, relatórios, texto da Portaria, gráficos, permissões e auditoria.
5. Validar a memória por CNES com planilha de teste e dados oficiais reais. Testar rejeição de duplicidade, CNES estranho, falta de prestador, valor negativo, arquivo não correspondente ao 13º e tentativa de reprocessar após criação de NE.
6. **Não** usar a memória mensal para gerar o 13º. Não encerrar a 13ª sem portaria específica, vínculo do arquivo original, crédito FMS e conferência documental das obrigações.

**Limite:** as fontes de 2026 consultadas até outubro não fornecem a portaria anual definitiva da 13ª de 2026; a cartilha é preliminar. As regras de cálculo individuais devem ser confirmadas quando a norma e o arquivo final forem publicados.
