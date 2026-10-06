# Regressões do fluxo operacional do Piso

Base inspecionada: `main` em `45db194`, incluindo `2189858`. O checkout estava limpo.

## Diagnóstico do banco configurado no checkout

Consultas REST de leitura, com `limit=0`, executadas em 06/10/2026 no projeto
`vosnzaevbynphsqbnfxp` (sem imprimir chaves nem consultar registros):

- `prestador_cnes`: HTTP 404, `PGRST205`, `Could not find the table 'public.prestador_cnes' in the schema cache`.
- As outras nove tabelas consultadas por `extra` estavam disponíveis: documentos,
  matriz, obrigações, arquivos, pool de assinaturas, ocorrências, feriados,
  assinaturas de documentos e encaminhamentos.
- `piso_competencias.investsus_ocorrencia`, `piso_obrigacoes.exercicio` e
  `piso_ocorrencias.categoria`: HTTP 400, `42703`, coluna inexistente.

Logo, os efeitos das migrations `20261006023216_piso_fluxo_operacional_v2.sql`
e `20261006100000_prestadores_cnes_piso_pc.sql` não estão disponíveis nesse banco.
Nenhuma migration foi aplicada nesta tarefa: não havia acesso administrativo.
Uma chave pública não permite executar SQL nem verificar os corpos dos triggers.
O histórico de migrations e os triggers ainda precisam de verificação administrativa.

A implantação pública retornou bloqueio de rede (CONNECT 403). Não foi possível
confirmar a configuração efetivamente publicada nem entrar em sua competência 09/2026.

Para corrigir o banco, executar as migrations existentes na ordem acima pelo
fluxo administrativo do projeto e verificar o histórico, as colunas e as funções
`piso_audit` e `piso_sincronizar_situacao_participante`. Depois, repetir as consultas,
abrir 09/2026 com conta autorizada e validar o fluxo. A migration de CNES cria o
cadastro mestre; os CNES corretos das instituições também precisam estar cadastrados.
Não substituir esse cadastro por uma lista vazia para contornar a falha.

## Testes reproduzíveis

No checkout, com dependências instaladas:

```sh
npm run test
node_modules/.bin/tsc --noEmit
npm run build
npm run dev -- --host 0.0.0.0 --port 3000
```

Em outra sessão, com Playwright acessível ao Node e Chromium instalado:

```sh
NODE_PATH=/opt/codex/cua_node/lib/node_modules node tests/piso-regressao.browser.mjs
```

O runner exige um servidor local e intercepta todas as requisições ao Supabase.
Seu login fictício só funciona no backend isolado do teste; nenhum dado real é
gravado. Exercita loading, erro real e retry, falha acessória, BOJ/Bethesda sem
requisitos, preenchimento, upload CSV e auditoria existentes, sem elegíveis,
InvestSUS, bloqueio de conclusão quando o banco mudou após a renderização,
conclusão e transição para Etapa 2, navegação e Hero em 1366, 1440,
1920 e 390 px. Salva screenshots em `/tmp/piso-regressao` por padrão.

Os testes unitários também verificam contexto ausente/parcial, ausência de
retorno, ausência de arquivo/auditoria, exceção sem elegíveis, cronologia,
validação da conclusão e preservação das mensagens de todas as fontes com erro.
