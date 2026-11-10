# PVH — Comunicação (Etapa 6) independente do Pagamento (Etapa 5)
**Correção 10/11/2026 · competência de referência 10/2026**

## Regra aprovada
- Etapas **5 — Pagamento** e **6 — Comunicação** ficam disponíveis após a **Etapa 4 — Subempenho** ser concluída.
- Concluir 6 exige comunicação obrigatória efetivamente registrada e rastreada no SEI, mas **não** exige a Etapa 5 concluída.
- Ao concluir 6 com 5 pendente, a esteira marca 6 como concluída e mantém 5 pendente, sem acessar 7.
- **Etapa 7 — Encerramento** só fica disponível quando as Etapas 1–6 estiverem concluídas e sem reconferências. A RPC de encerramento exige ainda conciliação financeira Estado/Município/FMS/NE/subempenhos/pagamentos.

## Diagnóstico real (somente leitura)
Em 10/11/2026, no PostgreSQL do Lovable:
- Competência **10/2026**: Etapas 1–4 concluídas, 5 e 6 sem conclusão, nenhuma reconferência aberta, status ativa.
- **Instituição Bethesda**: comunicação obrigatória com registro enviado, destinatário(s), Nº SEI, link SEI e identificação do remetente presentes.
- **Hospital Municipal São José**: `notificar_email=false` na competência; a comunicação não é exigida.
- `public.pvh_concluir_etapa6(uuid)` ainda verificava `etapas_concluidas->>'5'`, contradizendo o frontend e `PRE_REQUISITOS[6] = [4]`.
- `public.pvh_encerrar_competencia(uuid,boolean)` já valida as **seis** etapas e todas as reconferências. Esta correção não a modifica.

## Implantação
Migration isolada e aditiva: `supabase/migrations/20261110130000_pvh_etapas5_6_paralelas.sql`.
- Só redefine `public.pvh_concluir_etapa6(uuid)`, preservando assinatura, permissões, rastreio dos comunicados, validações de documentos e transação.
- **Não executa** UPDATE de pagamentos, notificações, registros históricos, NEs ou flags das competências. A única atualização em uso operacional é na conclusão efetiva pelo usuário.
- Mantém proibição de conclusão em competência encerrada, checa papel ACP/ACO/Admin e exige etapa 4 íntegra.
- Executar na base após backup/revisão e validar com usuário autorizado. SQL não aplicado automaticamente a produção nesta mudança.

## Casos de aceite
1. Em 10/2026, usando perfil ACP/ACO/Admin, clicar **Concluir Etapa 6** com 5 pendente. Esperado: 6 verde, 5 continua pendente, 7 bloqueada.
2. Sem comunicação obrigatória enviada, a conclusão da 6 deve falhar sem marcar etapa.
3. Com a Etapa 4 inconclusa ou reconferência 4, a conclusão da 6 deve falhar.
4. Após concluir 5, estando 6 já concluída, a esteira deve liberar 7, mantendo as validações próprias da reconciliação e encerramento.
5. Com reconferência de 5 ou 6, 7 permanece bloqueada.
6. Competência encerrada não admite nova conclusão da 6.

## Dependência técnica
Este PR é propositalmente independente do PR #50 (Fases C–E) e pode ser integrado sem publicar o redesenho completo das NEs. O frontend da `main` já implementa o acesso paralelo às Etapas 5 e 6; alteração de texto melhora a orientação. Este SQL é necessário para a conclusão real da Etapa 6.
