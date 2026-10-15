# Encontro de Contas HMSJ · Fase 1 — Pré-conciliação no navegador

## Correção do erro de comunicação
A interface não chama mais a Edge Function `eletivas-processar`. Faz download autenticado
do bucket privado, confere tamanho e SHA-256 localmente, valida estrutura e interpreta
os arquivos com os leitores e motor compartilhados. Apenas quando não há impedimentos
o navegador envia itens e manifesto para `ec_importar_itens_local`.
A Edge Function antiga pode permanecer no repositório para compatibilidade, mas
não é utilizada pelo botão.

**Atenção:** browser não é ambiente de confiança. Os valores registrados têm
`origem='parser_local'`, não `parser_validado`. A RPC valida **perfil,
competência, IDs, categorias e hashes declarados dos arquivos**, e a transação
impede gravação parcial. O banco não recalcula os valores nem atesta que
o navegador não sofreu adulteração. Por isso cada item exige conferência do
fiscal e há validação fiscal expressa de toda a execução antes do fechamento.
A alteração posterior em uma decisão invalida essa confirmação.

## Fontes e reprodução
Os 16 papéis previstos foram mantidos: DBF FAEC/MAC/SIA; SES FAEC, FAEC
Mult/Seq, prêmio estadual, faixa MAC; SES MAC, MAC Mult/Seq, prêmio federal;
SIA FAEC, FAEC puro, MAC; workbook AIH, FPO oficial e EC Delib.
Arquivos enviados têm versões: escolha explicitamente um ID por categoria na
aba Fontes ou Auditoria. A seleção não presume que o último upload seja correto.
O manifesto persiste id/categoria/hash de **cada fonte selecionada**, inclusive
versões anteriores. Itens carregam código SIGTAP original e normalizado,
referência de células das matrizes e campo DBF quando possível.

Fluxo: importar → selecionar versões → pré-conciliar no navegador →
corrigir impedimentos na fonte → conferir itens → decidir divergências →
registrar validação fiscal da execução → documentos SEI → encerrar.
Novas versões não substituem silenciosamente o manifesto anterior.

## Implantação
1. Sincronizar `main` no Lovable.
2. Executar UMA VEZ a migration [20261015144000_eletivas_fase1_leitura_navegador.sql](../supabase/migrations/20261015144000_eletivas_fase1_leitura_navegador.sql).
3. Executar o [SQL de verificação](../supabase/tests/eletivas_fase1_verificacoes.sql).
4. Testar em competência **de teste** com DBFs/XLSX reais. Não é necessário configurar Edge Function.
5. Conferir que nenhuma escrita é feita em `lancamentos_pagamento`.

## Homologação pendente
Testes de unidade com arquivos sintéticos não comprovam 100% dos layouts históricos reais.
Deve-se validar SIH/SIA, FAEC/MAC, Mult/Seq (três gerações), workbook AIH, FPO,
Delib e componentes pelo CNES com amostras reais. Falta fórmula normativa das
Delib especiais e paridade financeira completa do HTML — pertence às Fases 2/3.
Quando uma evidência não é confiável, o processamento BLOQUEIA a gravação,
não presume valor zero. Nenhum atesto definitivo deve ser autorizado com lacunas.
