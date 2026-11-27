# PACTO Joinville · Emendas Parlamentares
## Correção: liberação de recursos pertence a Convênios, não ao fluxo e-Pública

**Data:** 27/11/2026 · **Origem:** captura de tela da etapa 4 "Liberações de recursos, comprovantes e pagamentos".  
**Código:** branch `fix/emendas-e-publica-sem-liberacao-20261127`, PR #84.

### Diagnóstico confirmado
A versão `main` da aplicação ainda apresenta o componente `FluxoParcelasEmenda`, originário da lógica financeira dos Convênios. Esse componente oferece documento comprobatório → valor a liberar → solicitação de liberação → Aviso de Movimento → programação → pagamento; também contém efeitos automáticos que tentam registrar liberação e pagamento quando os campos ficam completos.

As Fases D e E da nova cadeia (subempenhos individualizados e pagamentos parciais) foram implementadas em branches dependentes A–H e suas migrations instaladas separadamente na base. A interface da `main` **não recebeu esse código**. Na versão H também havia uma exceção que exibia o componente legado quando encontrava documento `lib:<competencia>`, mesmo sem liberação financeira efetiva. A fotografia H0 identifica precisamente **1 documento histórico sem vínculo de liberação**, suficiente para deixar a lógica anterior reaparecer quando as branches fossem integradas.

### Fluxo correto de Emendas

1. Nota de Empenho emitida e documentada.
2. Distribuição manual da NE entre competências, sem criar liberação financeira.
3. Uma ou mais solicitações de subempenho na mesma NE e competência.
4. **Solicitação de Subempenho / Liquidação**, com SEI, matrizes de assinatura específicas para Emendas e confirmação de encaminhamento quando exigido.
5. **Aviso de Movimento — Empenho em Liquidação** no e-Pública, documento e encaminhamento próprios.
6. **Aviso de Movimento — Subempenho**, valor efetivo individualizado.
7. Uma ou mais parcelas financeiras: programação documentada, comprovante SEI de pagamento real, ajustes/estornos e conciliação por subempenho.

Piso da Enfermagem e PVH servem de referência de **sequência operacional**. Não copiar automaticamente suas matrizes de assinatura, autoridades nem dados de processo.

### Mudanças implementadas
- Removida da rota a seção operacional "Liberações de recursos, comprovantes e pagamentos" e toda a condição `fluxoLegadoIniciado` / `liberacaoLegadaPermitida`.
- Excluído `FluxoParcelasEmenda.tsx` para impedir reintrodução de seus efeitos que registravam liberação e pagamentos.
- Acrescentado `ConsultaLegadoEmenda.tsx`, bloco recolhido **somente leitura**, que mostra documentos anteriores, números SEI, links e vínculos já registrados; não pode escrever no banco.
- Mantida `FluxoSubempenhosEmenda` como única via operacional de subempenho, assinaturas, envio e pagamento por parcela. Texto introdutório explica as três subetapas.
- Preservada a função de anulação/conciliação da Fase F e a consulta à trilha de auditoria.

**O banco não foi modificado**, a migração histórica não foi repetida e os registros antigos não foram convertidos nem excluídos.

### Validação e rollout
- Testes `src/lib/emendas/fluxo-e-publica-sem-liberacao.test.ts`, `fase-d-cadeia-subempenhos.test.ts` e `fluxo-documental-testes.test.ts` impedem reabrir o formulário legado.
- Revalidar o build, TypeScript e integração com as Fases D–H.
- **Este PR ainda não está na versão publicada.** A main conserva o componente antigo. Integrar a cadeia A → B → C → D → E → F → G → H → correção (#84) com revisão, CI e homologação, antes de publicar o bundle no Lovable.
- Na interface publicada, conferir a NE e a competência do exemplo, confirmar que **não aparecem campos "Valor a liberar" e "Solicitação de liberação de recursos"**, que o documento antigo aparece só em "Registros do fluxo anterior", que não são criados subempenhos automaticamente, e que os cartões novos aparecem somente depois da distribuição e dos Avisos confirmados.
- Conferir os hashes financeiros do H0 antes/depois da publicação, além das liberações (0), blocos de pagamento (0), histórico e H2/H3; nenhuma alteração financeira deverá decorrer apenas da abertura da página.

### Restrição de segurança
Não corrigir com deleção SQL de `emenda_fluxo_documentos`, com liberação fictícia, conversão automática para subempenho ou renomeação visual do formulário de Convênios. Nenhum desses procedimentos atende à rastreabilidade financeira do módulo.
