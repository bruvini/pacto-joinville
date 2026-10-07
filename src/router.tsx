import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Não refaz consultas só porque o usuário alternou de aba/janela.
        // Isso evita o "mini refresh" e preserva a posição visual das telas.
        refetchOnWindowFocus: false,
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 5 * 60_000,
  });

  return router;
};
