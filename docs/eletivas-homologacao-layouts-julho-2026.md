# Encontro de Contas HMSJ — verificação dos layouts reais de julho/2026

**Situação:** diagnóstico estrutural das planilhas recebidas em 15/10/2026.
**Competência:** 07/2026. **Prestador correto:** CNES 2436469 (Hospital Municipal São José).
**Importante:** não confundir com o CNES 2306336 (Hospital São José de outro município).

## Evidências examinadas
Foram inspecionados localmente **15 arquivos** de julho, sem enviar dados de pacientes
ao repositório: três DBF (SIH FAEC, SIH MAC, SIA) e doze XLSX (SIH FAEC, MAC,
SIA FAEC, SIA FAEC puro, SIA MAC, prêmios estadual/federal, faixa estadual,
múltiplas/sequenciais FAEC e MAC, workbook AIH e EC Deliberações).

### Principais conclusões

1. **SIH FAEC com Faixa Estadual Julho 2026:** aba Físico apresenta apenas os
CNES 2522411, 2522691, 2558246 e 2558254, sem qualquer coluna para 2436469.
A ausência do HMSJ é legítima. Essa fonte de recorte NÃO pode bloquear a
competência nem importar o total estadual ou o valor de outro hospital.
2. **SIA FAEC Puro e SIA MAC:** também não incluem o CNES 2436469. As
respectivas planilhas mostram CNES 2306336, que não é o HMSJ. A Delib
dessas fontes não autoriza projetar cobrança para 2436469: a fonte é
mantida no manifesto, mas o motor a ignora para este prestador.
3. **SIH FAEC julho:** o CNES 2436469 aparece na coluna J em Físico/
Financeiro e K em Complemento. Há 10.439 células com fórmula na aba
Complemento, com 9.361 zeros calculados, e nenhuma fórmula sem cache.
4. **SIA FAEC julho:** J em Físico/Financeiro e K em Complemento.
Fórmulas com cache zero são valores calculados legítimos, não erros.
5. **SIH MAC julho:** CNES na coluna H em Físico, E em Financeiro e
I em Complemento. Não há coluna fixa comum entre essas abas.
6. **FAEC Múltiplas/Sequenciais:** estrutura de quatro abas
Mult e Seq, Resumo, Hospital e Procedimentos. Para o CNES 2436469,
há 13 AIHs identificadas na matriz Hospital e 15 códigos-filhos
positivos; três procedimentos-filhos têm **unitário explicitamente zero**
nas tabelas de referência. Isso não significa referência ausente e não
deve ser substituído por um valor arbitrário.

## Fluxo corrigido
- Após o upload, nenhum conjunto de dezenas de dropdowns de versões é necessário:
o sistema escolhe automaticamente o arquivo oficial mais recentemente recebido
para cada papel; múltiplos uploads geram aviso. O banco segue congelando
**ID, categoria e SHA-256** para cada execução.
- Fontes **obrigatórias** SIH/SES sem CNES relevante continuam
bloqueadas com explicação; fontes opcionais sem publicação para o HMSJ
são consultadas, documentadas, mas **não geram valor** ou impedimento.
- Fórmula com zero em cache é aceita, e fórmula realmente sem resultado
continua sendo bloqueada.
- Erros detalhados são exibidos no quadro da auditoria (arquivo,
etapa, causa, orientação); o toast fica curto.
- A leitura de unitário zero em múltiplas preserva o zero declarado
e só bloqueia referência inexistente.

## Segurança e implantação
A correção é integralmente no TypeScript/React. **Nenhuma nova migration SQL.**
Fases 0, 1 e 2 permanecem aplicadas; não reexecutar suas migrations.
Sem registros sensíveis extraídos das AIHs no repositório. Arquivos originais
não foram editados.

## Limites da homologação
A checagem estrutural local das 15 fontes não equivale a executar o
fluxo inteiro no navegador autenticado, nem prova paridade de todas as
AIHs e centavos. A pré-conciliação pode revelar impedimentos legítimos
de múltiplas/FPO que devem ser tratados na Fase 3; não removê-los para
forçar lançamento completo. Confirmar com a competência 07/2026 no Lovable.
