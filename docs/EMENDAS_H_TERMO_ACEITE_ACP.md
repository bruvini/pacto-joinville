# Termo de evidências e aceite · PACTO Joinville · Emendas · Fase H

**Modelo para preenchimento. Não constitui homologação nem aceite antecipado.**  
Data do modelo: 26/11/2026 · Estado atual: **PENDENTE DE HOMOLOGAÇÃO**.

## Identificação
- Ambiente de homologação (identificador sem credenciais): ____________________
- Ambiente produtivo (identificador sem credenciais): ____________________
- Commit SHA do build aprovado: ____________________
- Número da release / identificação visível na interface: ____________________
- PRs A–H integrados em ordem e conflitos resolvidos: [ ] Sim [ ] Não
- Responsável técnico / infraestrutura: ____________________
- Responsável funcional ACP: ____________________
- Referência SEI do plano de implantação: ____________________

## Backup restaurável
- Tipo: ____________________
- Identificador do backup: ____________________
- Data/hora e origem: ____________________
- Local de custódia e período de retenção: ____________________
- Banco isolado de restauração: ____________________
- Restauração concluída: [ ] Sim [ ] Não
- H0 da origem confrontado com H0 restaurado: [ ] Igual [ ] Divergência justificada [ ] Falhou
- Hash de auditoria origem/restauração: ____________________ / ____________________
- Hash dos livros financeiros origem/restauração: ____________________ / ____________________
- Proteção de arquivos da Storage e evidências SEI: ____________________
- Teste de recuperação assinado: ____________________

## Migração histórica
- H1 aplicada na homologação: [ ] Sim [ ] Não
- `security_invoker` da view confirmada: [ ] Sim [ ] Não
- Registros antigos financeiros passíveis de migração automática: **nenhum** (por projeto).
- Registros financeiros migrados efetivamente: ______ (esperado nesta base atual: **0**).
- Pendências históricas classificadas: ______ (fotografia atual: **1** documento sem vínculo).
- Documentos SEI conferidos externamente: ______ / ______
- Identificações ou decisões da ACP: ____________________
- Relatório CSV da conferência anexado: [ ] Sim [ ] Não
- Nenhum número de subempenho/comprovante criado artificialmente: [ ] Confirmado [ ] Não

## Ensaios em homologação
- Planilha: `docs/EMENDAS_H_EVIDENCIAS_ACP_MODELO.csv`
- H01–H16 aprovados com evidência individual: ______ / 16
- Ocorrências reprovadas (issue/link): ____________________
- Teste real de concorrência ACP × ACP: [ ] Aprovado [ ] Reprovado [ ] Não executado
- Teste de idempotência: [ ] Aprovado [ ] Reprovado [ ] Não executado
- Testes Admin / ACP / ACO / anônimo: [ ] Aprovados [ ] Reprovados [ ] Não executados
- Smoke `emendas-fase-h-smoke-rls.mjs`: ______ aprovações / ______ falhas
- H2: RPCs/grants/RLS: [ ] Sem bloqueios [ ] Com bloqueios
- H3: invariantes financeiros: [ ] Zero [ ] Não zero
- Conciliação com pagamento parcial rejeitada: [ ] Sim [ ] Não [ ] Não testado
- Atos após conciliação rejeitados: [ ] Sim [ ] Não [ ] Não testado
- Linha do tempo e links SEI conferidos: [ ] Sim [ ] Não
- CSVs abertos em leitor de planilha sem execução de fórmulas: [ ] Sim [ ] Não

## Testes de código e publicação
- Vitest: ______ aprovados / ______ falhas preexistentes / ______ regressões novas.
- Build: [ ] Aprovado [ ] Reprovado
- TypeScript: [ ] Aprovado [ ] Reprovado
- Contratos Supabase: [ ] Aprovados [ ] Reprovados
- Versão publicada é a do SHA homologado: [ ] Sim [ ] Não
- Rota de Emendas, NE, competências, subempenhos e pagamentos: [ ] Funcionam [ ] Pendentes
- Plano de rollback ensaiado: [ ] Sim [ ] Não

## Decisão
[ ] **REPROVADO** · existem bloqueios. Não implantar.  
[ ] **HOMOLOGAÇÃO FUNCIONAL APROVADA**, mas sem autorização produtiva.  
[ ] **AUTORIZADA IMPLANTAÇÃO CONTROLADA**, com janela, backup restaurável e responsáveis definidos.  
[ ] **IMPLANTAÇÃO CONCLUÍDA** após pós-flight, conferência financeira e aceite final.

**Justificativa técnica/funcional e pendências remanescentes:**  
___________________________________________________________________________  
___________________________________________________________________________

**Revisão ACP (identificação, data/hora, assinatura institucional):** ____________________

**Revisão de segurança/TI/DBA (identificação, data/hora, assinatura):** ____________________

**Autorização de implantação (competência institucional, data/hora):** ____________________

**Aceite pós-implantação (identificação, data/hora):** ____________________

> A ausência de evidência ou assinatura é resultado **PENDENTE**, não aprovação tácita. A autorização de implantação não se presume de GitHub Actions verdes ou do pós-flight com integridade zerada.
