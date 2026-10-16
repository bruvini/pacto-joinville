# Tela 03 · Correções recebidas — paridade HTML 2.42.2 (16/10/2026)

**Referência:** `Auditoria - Cirurgias Eletivas - 102026(1).html` SHA256 `75494e80e28fc59596e43a2ba0fb7a0caf9a50bafbd3a5f4c94dd95a22fe7186`. Fonte direta: `renderCorrections()`, linhas aproximadas 5880–6060; CSS `.corr-hero`, `.corr-summary`, `.corr-layout`, `.corr-form`, `.corr-entry`, `.corr-link-box`, `.corr-consolidated`.

## Componentes reproduzidos

1. Hero “VALORES RECEBIDOS · COMPETÊNCIAS ANTERIORES” + explicação original.
2. Três indicadores na mesma ordem: Total de correções, Registros lançados, AIHs relacionadas.
3. Quadro separado “Referência do Consolidado geral SES/SC” quando há memória íntegra dos ajustes no manifesto congelado. Confronto do valor SES com o aprovado pela fiscalização, sem criação automática de crédito.
4. Grade de duas colunas: formulário à esquerda e cartões das correções registradas à direita.
5. Formulário com Competência de origem, AIHs (textarea com exemplos e deduplicação), Valor recebido e a caixa “Rastreabilidade da origem”, incluindo fonte oficial, referência única, SEI e motivo exigidos pela infraestrutura do município.
6. Memória de fluxos FPO associados à mesma competência de origem e AIHs, somente leitura. As tabelas atuais **não têm coluna de vínculo formal** entre correções e `eletivas_fpo_fluxos`. Não foi inventado relacionamento nem realizado encerramento automático. As evidências podem ser consultadas na tela FPO.
7. Cartões com competência, total, AIHs em chips, situação fiscal, origem, documento, motivo, justificativa e botão **Revisar correção** nos registros pendentes, com aprovação/rejeição fundamentada. Ações "Editar" e "Excluir" do standalone **não foram transplantadas**: fariam alterações silenciosas em documentos e evidências que o banco mantém imutáveis.

## Contrato institucional preservado

- `ec_incluir_correcao` controla permissão ACP/Admin, competência aberta e duplicidades no mesmo prestador em qualquer mês. Toda nova correção é criada em `em_analise` e **não soma no atesto até revisão expressa**.
- `ec_revisar_correcao` exige motivo de pelo menos 15 caracteres e aceita `aprovada` ou `rejeitada`. O status nunca muda por alteração de aparência.
- Frontend ainda valida competência anterior, IAHS de 13 dígitos, valor positivo com até 2 casas, fonte oficial, referência única e SEI. A verificação definitiva permanece no PostgreSQL.
- Três indicadores mostram apenas montante **aprovado**, todos os registros e AIHs únicas, com rótulos adicionais para distinguir da apuração local original.
- CSS do HTML escopado em `src/styles/eletivas-reference-correcoes.css`; a criação da competência e vínculo ao lançamento do Fluxo 1 permanecem intactos.
- **Nenhum SQL novo:** a etapa é de interface e reutiliza RPCs/tabelas existentes.

## Roteiro de homologação

1. Na competência `07/2026` do HMSJ, abra **Correções recebidas**.
2. Compare com o standalone: hero, três indicadores, quadro Consolidado quando disponível, colunas formulário/correções e cartões com AIH, valor e estado.
3. Se não houver correções, a lista deve mostrar “Nenhuma correção recebida foi lançada para a competência 07/2026”.
4. Em **competência de testes** aberta, insira uma origem anterior (ex. `06/2026`), duas AIHs de 13 dígitos, valor de teste, fonte, referência única, SEI e motivo, com **evidências apropriadas**. O registro deve surgir “Aguardando revisão” e ainda **não entrar no total do atesto**.
5. Como ACP/Admin, informe justificativa (15+ caracteres) e aprove ou rejeite. Se aprovar, o total de correções aprovadas deve mudar em centavos, inclusive no Painel. Rejeitada não soma.
6. Tente um segundo lançamento com a mesma origem/fonte/referência: a RPC deve bloquear a duplicidade (inclusive se registrada em competência diferente do mesmo prestador). Tente competência atual/futura e AIH inválida; bloqueio antes do envio.
7. Confira a seção “Regularização FPO / reprocessamento de origem”. Se houver fluxo correspondente, deve exibir apenas consulta. Nenhum fluxo será encerrado automaticamente.
8. Verifique acesso de leitor (sem alteração), mobile 390px e comparação com o HTML 1440px. Confirme que os outros módulos, arquivos importados e empenhos não foram modificados.

**Situação:** implementação pronta para revisão técnica; homologação visual/fiscal depende de prints comparativos reais do Lovable e validação do usuário.
