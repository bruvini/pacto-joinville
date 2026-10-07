import { z } from "zod";

const forbiddenNames = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_SERVICE_ROLE_KEY",
  "SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "VITE_SUPABASE_SECRET_KEY",
] as const;

function runtimeEnv(): Record<string, string | undefined> {
  const node =
    typeof process !== "undefined" && process?.env
      ? (process.env as Record<string, string | undefined>)
      : {};
  return { ...node, ...(import.meta.env as Record<string, string | undefined>) };
}

function assertNoPrivilegedCredentials(env: Record<string, string | undefined>) {
  const found = forbiddenNames.filter((name) => Boolean(env[name]));
  if (found.length) {
    throw new Error(
      "[Environment] Credencial privilegiada proibida no runtime do app: " +
        found.join(", ") +
        ". Service-role/secret keys devem existir somente em ambiente server-side isolado.",
    );
  }
}

const PublicSupabaseConfigSchema = z
  .object({
    url: z.string().url().refine((value) => value.startsWith("https://"), "A URL do Supabase deve usar HTTPS."),
    publishableKey: z.string().min(20, "Chave ANON/PUBLISHABLE inválida."),
    projectId: z.string().min(8).regex(/^[a-z0-9-]+$/i, "Project-ref do Supabase inválido."),
  })
  .superRefine((value, ctx) => {
    try {
      const hostRef = new URL(value.url).hostname.split(".")[0];
      if (hostRef && hostRef !== value.projectId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["projectId"],
          message: "SUPABASE_PROJECT_ID não corresponde ao project-ref presente na URL.",
        });
      }
    } catch {
      // URL já é validada acima.
    }
  });

export type PublicSupabaseConfig = z.infer<typeof PublicSupabaseConfigSchema>;

let cached: PublicSupabaseConfig | null = null;

export function getSupabasePublicConfig(): PublicSupabaseConfig {
  if (cached) return cached;
  const env = runtimeEnv();
  assertNoPrivilegedCredentials(env);

  const parsed = PublicSupabaseConfigSchema.safeParse({
    url: env.VITE_SUPABASE_URL || env.SUPABASE_URL,
    publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY,
    projectId: env.VITE_SUPABASE_PROJECT_ID || env.SUPABASE_PROJECT_ID,
  });

  if (!parsed.success) {
    const detalhe = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(
      `[Environment] Configuração pública do Supabase inválida: ${detalhe}. Consulte docs/ENVIRONMENT.md.`,
    );
  }

  cached = parsed.data;
  return cached;
}
