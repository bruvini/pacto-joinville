# Eletivas HMSJ — Fase 3: revisão fiscal e múltiplas por AIH

## Problema confirmado pelos prints
A listagem anterior expunha JSON cru com `filhos`, `perfil` e `financeiro`
e não explicava que o fiscal precisava conferir. Agora o dossiê mostra
publicação, expectativa, AIH/principal/faixa, QT e filhos, referência de
planilha e etapas de decisão. O JSON persiste apenas na seção técnica.

As decisões são ações **humanas**, sem pré-seleção automática:
- Aceitar: considerar valor estadual publicado, somente com comprovação.
- Ofício SES: divergência fundamentada, sem lançar valor não recebido.
- Erro: excluir valor errado mediante justificativa.
- Em análise: aguardar evidência de origem, FPO ou enquadramento.

## Separação das evidências
O arquivo `SES FAEC Múltiplas/Sequenciais` expõe filhos, QT e unitários
que permitem chegar ao total; sua própria soma NÃO demonstra uma
publicação financeira independente. Não é mais usado o mesmo cálculo como
`pago` e `esperado` para marcar `ok`.

A memória independente vem do workbook AIH/CIB: principal, filhos,
QT, faixa e natureza. Se incompleta, o status é `pendente`.

Para comprovar publicação SES de uma AIH, o fiscal registra um documento
SEI na tabela `eletivas_publicacoes_aih` e reprocessa a competência.
A gravação do banco verifica o número da AIH, o documento e o valor
realmente informados antes de aceitar a alegação de publicação.
A tabela **não comprova sozinha a veracidade de um SEI**; a auditoria humana
continua obrigatória.

### MAC múltiplas
A SES fornece publicação agregada por hospital: ela não deve ser
arbitrariamente rateada. O sistema preserva o total publicado e lista as
AIHs, com principal, faixa, filhos e elegibilidade. A expectativa só é
confirmada quando a composição no workbook é completa.

### FPO Art. 19 / Nota 05/2026
`fpo_oficial` é **parâmetro** (valor a programar). A tabela
`eletivas_fpo_programacoes` registra separadamente o que está
**documentalmente comprovado** para o prestador: procedimento, competência,
vigência, valor, número/link SEI, autor e data. Isso não cria repasse,
glosa ou dívida automática. Para aplicação específica da Nota 05/2026,
o sistema sinaliza competências a partir de 08/2026; confirmar
a data normativa com fonte documental antes de qualquer extrapolação.

### Atos especiais
A tabela `eletivas_atos_especiais` guarda aba, norma, vigência,
fundamentação e estado de comprovação. Sem norma/competência e regra
específica, o sistema não calcula valor a partir da aba e pode bloquear
a importação/encerramento.

## Segurança e implantação
1. Atualize o Lovable a partir da `main`.
2. Execute APENAS a nova migration
   [Fase 3](../supabase/migrations/20261015193000_eletivas_fase3_fpo_evidencias_e_travas.sql).
3. Depois rode o [SQL de verificação](../supabase/tests/eletivas_fase3_verificacoes.sql).
4. No painel FPO, registre comprovação de programação e, se existir,
   publicação independente por AIH com link SEI.
5. Na competência 07/2026, a pré-conciliação salva continua exibível.
   Dados gerados antes da Fase 3 NÃO são reprocessados automaticamente.
   Se não iniciou a conferência/decisão, você pode pré-conciliar outra vez
   para atualizar o motor; nunca será sobrescrita auditoria já assinada.
6. Nenhum valor é lançado automaticamente no convênio.

## Limitação de homologação
Testes automatizados verificam regras e estrutura. A efetiva programação FPO
e a responsabilidade estadual/federal dependem dos documentos SEI e não
podem ser inferidas da FPO oficial, da ausência no relatório SES nem da
comparação de um valor com ele mesmo. Verifique AIH por AIH antes do atesto.
