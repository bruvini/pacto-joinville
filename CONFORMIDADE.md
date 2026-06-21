# Conformidade — LGPD & ISO/IEC 27001
**Sistema de Gestão e Auditoria de Empenhos — SMS Joinville / ACP**

Este documento mapeia cada medida técnica implementada aos requisitos da **LGPD (Lei 13.709/2018)** e aos controles do **Anexo A da ISO/IEC 27001:2022**. Ele faz parte do ciclo **PDCA** de melhoria contínua do SGSI.

---

## 1. Registro das Operações de Tratamento (ROPA) — LGPD Art. 37

| Dado pessoal | Origem | Finalidade (Art. 6º I) | Base legal | Onde fica |
|---|---|---|---|---|
| Nome e e-mail do servidor | Cadastro/login | Identificar autor de cada ato (accountability) | Execução de política pública / cumprimento de obrigação legal (Art. 7º, II/III) | `profiles`, `historico_logs` |
| CNPJ do prestador | Cadastro | Identificar a instituição conveniada | Execução de contrato/convênio (Art. 7º, V) | `prestadores` |
| Nome/cargo/código SEI de signatários | Matriz de assinaturas | Rastreabilidade das assinaturas SEI | Cumprimento de obrigação legal (Art. 7º, II) | `assinaturas_config/_lancamento` |

**Minimização (Art. 6º, III):** a trilha de auditoria grava o **UUID** do autor e o **nome** do servidor (ato oficial), e **não** o e-mail — corrigido na Fase 0.

---

## 2. Controles de segurança implementados (Fase 0)

| Medida | Como foi feito | LGPD | ISO 27001 (Anexo A) |
|---|---|---|---|
| **Controle de acesso por papel (RBAC)** | Policies RLS reescritas usando `has_role()`/`has_any_role()`. Substituídas todas as policies `USING (true)`. | Art. 46 | A.5.15, A.5.18, A.8.3 |
| **Segregação de função ACP × ACO** | Trigger `enforce_acp_aco_scope` rejeita escrita de campos fora do papel; admin é exceção. | Art. 46 | A.5.3 |
| **Menor privilégio** | Exclusões restritas a `admin`; criação de lançamento restrita a `acp/admin`; configuração (matriz/SLA) restrita a `admin`. | Art. 46 | A.8.2, A.8.3 |
| **Auditoria imutável (append-only)** | `historico_logs` sem policy de UPDATE/DELETE + `REVOKE`; gravação por trigger `log_lancamento_audit` / `log_assinatura_audit` (não burlável pelo cliente), com diff campo-a-campo. | Art. 37 (accountability) | A.8.15 (logging), A.8.16 (monitoring) |
| **Defesa em profundidade no roteamento** | `beforeLoad` admin-only em `/configuracoes` + ocultação de itens na sidebar — **sem** substituir a RLS como fonte de verdade. | — | A.8.3, codificação segura A.8.28 |
| **Gestão de identidade e papéis** | Tela admin "Usuários & Papéis"; policy "Admins manage roles". | Art. 46 | A.5.16, A.5.18 |
| **Higiene de segredos** | `.env` removido do versionamento + `.gitignore` + `.env.example`. Chave anon é pública por design; service_role nunca no frontend. | Art. 46 | A.5.10, A.8.24 |

---

## 3. Validação dupla (defesa em profundidade)
Toda regra de negócio crítica é validada **no cliente** (UX) **e no banco** (verdade não burlável). As travas de valor (`empenho ≤ solicitado`, `soma ≤ teto do convênio`) entram na Fase 1/2 como `CHECK`/trigger. *Referência:* OWASP A01/A04; Saltzer & Schroeder (menor privilégio, defesa em profundidade).

---

## 4. Pendências de conformidade (próximas fases)
- [ ] Criptografia/validação de URLs SEI e travas de valor (Fase 1).
- [ ] Trava de saldo do convênio mãe e por termo aditivo (Fase 2).
- [ ] Política formal de **retenção** de logs (sugerido: 5 anos, alinhado a prazos de prestação de contas do SUS) e verificação de **backup** automático (ISO 27001 A.8.13).
- [ ] Procedimento de resposta a incidentes e atendimento aos **direitos do titular** (LGPD Art. 18).
- [ ] Revisão periódica de acessos (ISO 27001 A.5.18) — parte do ciclo PDCA (Check/Act).

---

## 5. Operação — primeira configuração
1. O **primeiro usuário** cadastrado vira `admin` automaticamente (trigger `handle_new_user`).
2. O admin acessa **Configurações → Usuários & Papéis** e atribui `ACP` ou `ACO` aos demais.
3. Sem papel atribuído, o usuário só **lê** os dados (não edita campos ACP/ACO).
