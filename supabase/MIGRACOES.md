# Migrations do Supabase

A fonte de verdade do schema é **a sequência ordenada de arquivos em `supabase/migrations/`**.

O antigo `supabase/APLICAR_MIGRACOES.sql` foi descontinuado. Ele permanece apenas como uma trava de segurança e lança uma exceção se alguém tentar executá-lo.

## Regra para qualquer alteração de banco

1. Crie uma nova migration timestampada em `supabase/migrations/`.
2. Não edite uma migration já aplicada para representar uma mudança nova.
3. Atualize ou regenere `src/integrations/supabase/types.ts`.
4. Rode `npm run check:schema`.
5. Rode testes e build antes do merge.
6. Quando a migration precisar ser executada manualmente no SQL Editor, aplique apenas o arquivo novo solicitado e registre a execução.

## Por que não há mais um SQL consolidado

Um arquivo agregado envelhece no instante em que uma migration nova é criada e convida a duas classes de erro: reaplicar alterações antigas em produção e criar um banco parcialmente divergente da aplicação.

Para criar um ambiente do zero, aplique as migrations em ordem. Para atualizar um ambiente existente, aplique somente as migrations ainda não registradas nele.
