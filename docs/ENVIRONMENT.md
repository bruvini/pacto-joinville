# Variáveis de ambiente

## Contrato do repositório

O arquivo `.env` raiz é versionado deliberadamente porque o Lovable Cloud usa a configuração `VITE_*` durante o build. Ele **não é um cofre de segredos**.

São permitidos somente URL, project-ref e chave ANON/PUBLISHABLE do Supabase, nas variantes `VITE_*` e SSR.

A chave ANON/PUBLISHABLE é pública por desenho; a segurança dos dados depende de RLS e das funções server-side. Chaves `service_role`, secret keys, senhas e tokens privados nunca podem ser colocados no `.env`, no código fonte ou em variáveis `VITE_*`.

Overrides locais devem ficar em `.env.local`.

## Proteções automáticas

`npm run check:env` valida os nomes permitidos e falha se encontrar credenciais privilegiadas. A aplicação também valida URL, project-ref e ausência de chaves privilegiadas antes de criar o cliente Supabase.

Se uma nova integração exigir segredo, ela deve rodar em Edge Function/servidor e usar o mecanismo de secrets do ambiente correspondente.
