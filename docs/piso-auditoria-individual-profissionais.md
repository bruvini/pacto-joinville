# Projeto de auditoria individualizada do Piso da Enfermagem

**Situação:** proposta técnica. Nenhuma tabela de CPF/remuneração foi criada e nenhuma nova captura de dados individuais foi ativada nesta mudança. A implantação requer revisão de finalidade, permissões, segurança e retenção pela SMS.

## Referências

1. **COSEMS/SP — Planilha estratégica para apuração do 13º do Piso da Enfermagem via InvestSUS**: relata consolidação nominal e por CPF dos relatórios individuais de janeiro a novembro de 2025, separação dos regimes jurídicos, média simples para um vínculo sem reajuste e dois subperíodos (5/11 e 6/11) para trabalhadores cuja remuneração sofreu reajuste. A reconciliação com o valor global é um resultado da experiência municipal relatada, não uma regra universal: https://www.cosemssp.org.br/noticias/acervo-digital/planilha-estrategica-para-apuracao-do-13o-do-piso-da-enfermagem-via-investsus/
2. **FNS — Portaria GM/MS 8.964/2025**: no 13º de 2025 o pagamento individual deve considerar proporcionalidade e tempo efetivamente trabalhado. https://portalfns.saude.gov.br/ministerio-da-saude-dispoe-valores-da-decima-terceira-parcela-referentes-ao-piso-da-enfermagem/
3. **Ministério da Saúde/SGTES — informações por CPF no Piso**: os gestores alimentam remuneração no InvestSUS, a União apura o repasse e o gestor recebe extrato de valores por trabalhador. https://www.gov.br/saude/pt-br/acesso-a-informacao/sic/dados-em-transparencia-ativa/sgtes
4. **LGPD, Lei 13.709/2018, especialmente arts. 6º, 23 e 46**: finalidade, necessidade, tratamento pelo poder público, segurança desde a concepção. https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
5. **ANPD — controles de acesso**: autenticação, autorização, auditoria, segregação por necessidade. https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/anonimizado___guia_orientat-_seg_da_inf_p_atpp.pdf

## Diagnóstico do código atual (09/10/2026)

- `supabase/functions/piso-processar-evidencia/index.ts` recebe a evidência **privada**, confere SHA-256, abre as Planilhas de Carga por instituição, lê o resultado mensal do **InvestSUS** e faz conciliação por CPF + CNES.
- `src/lib/piso/investsus.ts` (espelhado em `supabase/functions/_shared/piso-evidencias.ts`) interpreta CPF, nome, CNES, CNPJ, CBO, jornada, valor do piso, base e **complemento individual da União**. A Planilha de Carga representa a declaração da instituição, não a homologação individual federal.
- Hoje persistem-se **totais por CNES/instituição**, auditoria agregada, ocorrências mascaradas, originais no Storage privado e logs; **não existe ainda um histórico mensal estruturado de complementos individuais para todas as pessoas**.
- Portanto, **não solicitar upload adicional** na rotina normal: derivar memória individual da saída InvestSUS que já é processada e confrontar com a Carga, sem inverter as fontes. Para dados antigos, apenas reprocessar arquivos originais preservados com autorização e logs.

## Arquitetura proposta

**Segregar o domínio individual em tabelas PRIVADAS**, sem reutilizar `piso_competencias.investsus_resumo`, `piso_ocorrencias` ou o histórico geral como repositório de CPF.

1. `piso_profissionais_identidade`: chave surrogate, identificador estável criado por **HMAC-SHA-256 com segredo mantido somente no servidor** a partir do CPF validado; CPF cifrado de forma recuperável apenas onde houver finalidade justificada; nome em seção restrita. Nada de SHA/MD5 simples de CPF, que permite identificação por força bruta.
2. `piso_profissionais_competencias`: identificador da competência mensal, CNES, instituição/participante, chave da pessoa, **identificador de vínculo** quando disponível, regime jurídico confirmado, CBO/jornada, valor individual mensal da AFC homologado (centavos), remuneração/base quando necessárias, linha da fonte, arquivo original, hash e versão do parser. Não deduplicar exclusivamente por CPF/CNES: vínculos distintos podem coexistir no mesmo estabelecimento.
3. `piso_profissionais_cargas`: dados declarados pelas instituições, separados dos valores homologados federais, com vínculos ao arquivo, competência, pessoa e CNES. Permite medir divergência declarada × federal por vínculo, sem substituir o valor oficial.
4. `piso_13_memorias_individuais`: simulações por **exercício, regra identificada, versão, fontes, eventos de reajuste/afastamento, profissional + vínculo + CNES** e valores conferidos. Separar estado `rascunho`, `pendente_validacao`, `validado`; jamais tratar como ordem de pagamento.
5. `piso_13_conciliacoes`: snapshots com totais por pessoa/CNES/instituição, comparação com a memória CNES já confirmada e com Portaria Federal, diferenças de arredondamento, justificativas e autoria. Operações devem ser transacionais, sem ajuste silencioso.

**Segurança e controles obrigatórios**

- RLS de negação padrão, leitura/escrita apenas para funções administrativas expressamente autorizadas e conforme necessidade; revisar necessidade institucional de cada papel ACP/ACO/Admin. Nenhuma política geral de leitura autenticada nas tabelas individuais.
- Processamento em Edge Function autorizada; validação de origem/hash, CPF, vínculo, CNES, ano e formato financeiro; tratamento idempotente por evidência e versionamento para reprocessamento sem sobrescrever silenciosamente.
- Proibir CPF integral, nomes, salários e remuneração em notificações, `historico_logs`, consoles, URLs, exports abertos ou dashboards gerais. Telas-padrão mascaram CPF e controlam abertura nominal/auditoria por permissão específica.
- Segredo HMAC e chaves de criptografia somente em ambiente servidor, com governança de rotação; dados cifrados em trânsito e protegidos em armazenamento.
- Definir base legal/finalidade, minimização, política de retenção, backups e termo de acesso com a área encarregada da proteção de dados da SMS antes da produção. Não executar ingestão automática das competências históricas sem essa aprovação.
- Desenhar relatórios agregados que não exponham colaboradores e liberar relatório individual somente para usuários autorizados com log de acesso.

## Fases sugeridas

**Fase A — Modelo e riscos, antes de mudar SQL**: confrontar o layout efetivo dos arquivos InvestSUS e Carga, verificar campos disponíveis e divergências de vínculos; definir regras de acesso com SMS e evidência legal. Amostra sintética para testes.

**Fase B — Persistência mensal individualizada, com revisão de segurança**: schema privado + RLS + função de ingestão auditável + testes de múltiplos vínculos, mudança de CNES, linhas duplicadas, arquivo retificado e ausência de funcionário. Sem mudanças no fluxo financeiro.

**Fase C — Painel de auditoria de profissionais**: visão por competência/instituição/CNES, divergência carga × InvestSUS, evolução por pessoa e múltiplos vínculos; CPF parcialmente mascarado; drill-down nominal só para permissão específica.

**Fase D — Auditoria individual do 13º**: combinação por pessoa/vínculo de 11 meses com vínculo e histórico de salário. **Não aplicar fórmula 5/11 e 6/11 indiscriminadamente**; foi regra do exemplo de 2025 com reajuste em junho. Cada exercício/regime precisa de memória documental e validação de RH. Bloquear mês ou fonte individual faltante, zero omitido e não fechamento por CNES/instituição/Portaria.

**Fase E — Reconciliação auditável**: conferir individual → CNES → instituição → Portaria; observar arredondamentos; bloquear uso como valor oficial até confirmação documentada; nunca produzir diferença residual automaticamente sobre um CPF.

## Regras de teste de aceitação

- CPF igual em dois CNES **não** é duplicidade automática.
- CPF igual em dois vínculos válidos de um mesmo CNES **não** é deduplicado sem prova.
- Falta de relatório individual de um mês bloqueia memória individual daquele vínculo (não criar zero por ausência).
- Profissional admitido/desligado ou com redução de jornada exige regra de proporcionalidade aprovada, não média automática de valores inexistentes.
- Reajuste remuneratório e férias/afastamentos exigem documentação/regras do vínculo; nenhuma proporção universal presumida.
- Toda conciliação individual fecha com o CNES homologado ou aponta pendência/centavos, sem correção automática.
- Usuário sem permissão não consegue consultar registros individuais nem pela API e nenhum log retorna CPF integral.
- A implantação não altera a Etapa 1/2 da 13ª já desenvolvida e não retroage sobre pagamentos anteriores.

**Decisão desta rodada:** implementar somente ajustes de nomenclatura e ícone solicitados, registrando este desenho antes da entrada de dados pessoais persistidos.
