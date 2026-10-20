# Auditoria documental financeira assistida por IA

## Objetivo
Análise preliminar de PDFs de pagamento por lançamento (Fluxos 1 e 2).
A IA identifica campos explícitos e cita trechos/páginas. Um motor
determinístico confronta esses dados com o lançamento no banco.
A IA **não altera** atesto, empenho, dotação, pagamento ou assinatura.

## Operação
1. Executar a migration `20261020210000_auditoria_documental_pagamentos_ia.sql`
   no SQL Editor conectado ao banco correto do Lovable.
2. Publicar o último commit da branch `main`.
3. Abrir um lançamento. ACP ou Admin pode anexar PDF (até 12 MB) e clicar
   em **Analisar com IA**. ACO apenas consulta as evidências e análises.
4. Conferir os campos e o original. ACP/Admin registra observação de revisão.
5. O armazenamento é privado; download usa URL assinada com validade de 60s.

## Segurança e privacidade
- Bucket privado e tabela com RLS. A função server verifica autenticação
  e papel administrativo/ACP novamente, mesmo com service role no servidor.
- O PDF é verificado por tamanho, assinatura e hash SHA-256 antes do envio
  ao AI Gateway. O original não é alterado nem excluído pelo aplicativo.
- Só o backend escreve análise ou revisão; o usuário com perfil ACO não
  pode gerar nem revisar.
- O envio do PDF ao provedor de IA é uma ação explícita ("Analisar com IA").
  Evite anexar documentos com dados pessoais desnecessários. A ausência
  de divergências não prova regularidade contábil ou documental.
- O modelo é configurado em `LOVABLE_AI_MODEL` (opcional) e a chave
  `LOVABLE_API_KEY` permanece exclusivamente no ambiente do servidor.

## Limitações
- PDFs digitalizados sem texto podem depender do suporte a PDF nativo
  do modelo; se ele recusar esse formato, a extração textual também
  poderá falhar. Neste caso, o sistema registra status de erro.
- Apenas valores explicitamente extraídos são comparados, com tolerância
  de R$ 0,02. Campos ausentes não são considerados divergências provadas.
- O resultado representa uma sugestão de conferência e não documento fiscal.
