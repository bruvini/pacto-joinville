import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function AjudaModal({
  titulo,
  descricao,
  children,
  label,
}: {
  titulo: string;
  descricao: string;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary"
          title={label}
          aria-label={label}
        >
          <CircleHelp className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 text-sm">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

function Passo({
  numero,
  titulo,
  children,
}: {
  numero: number;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-[40px_1fr]">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {numero}
      </div>
      <div>
        <div className="font-semibold">{titulo}</div>
        <div className="mt-1 leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export function AjudaPrimeirosPassosPvh() {
  return (
    <AjudaModal
      label="Como funciona o PVH?"
      titulo="Como executar o PVH neste sistema"
      descricao="Um roteiro para quem nunca fez o processo — do cadastro inicial ao encerramento mensal."
    >
      <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-4 leading-relaxed text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
        <b>A ideia do módulo não é exigir que você saiba o processo de memória.</b> A competência
        mensal é o processo-mãe; o sistema mostra o que precisa existir em cada etapa, quais
        documentos guardar e quais dependências ainda impedem o avanço.
      </div>

      <Passo numero={1} titulo="Confira as configurações institucionais">
        Cada hospital pode ter regras diferentes de comunicação e prestação de contas. Essas regras
        são cadastradas por vigência e copiadas para a competência quando ela é criada, preservando
        o histórico mesmo que a configuração mude depois.
      </Passo>

      <Passo numero={2} titulo="Confira a base normativa da competência">
        A base normativa também é versionada. Uma competência antiga continua vinculada à regra que
        valia naquele período; a entrada de uma nova Deliberação ou Portaria não reescreve o passado.
      </Passo>

      <Passo numero={3} titulo="Cadastre os processos SEI do exercício">
        Empenho e liquidação/pagamento possuem processos anuais por instituição. Cadastre o ano,
        número e link do processo uma vez; nas etapas financeiras o sistema oferece o processo
        correto como referência.
      </Passo>

      <Passo numero={4} titulo="Abra a competência">
        A competência pode ser criada antes da publicação da Portaria estadual, em modo
        <b> Preparação</b>. Quando o ato sair, registre a Portaria e os valores oficiais por
        instituição na Etapa 1.
      </Passo>

      <Passo numero={5} titulo="Trabalhe pelas etapas, não por uma sequência artificial">
        Algumas frentes podem caminhar em paralelo. Depois da Portaria estadual, por exemplo,
        a preparação da Portaria Municipal, a cobertura por empenhos e o acompanhamento do recurso
        podem evoluir independentemente, respeitando os pré-requisitos de cada etapa.
      </Passo>

      <Passo numero={6} titulo="Empenho não é igual a competência">
        Uma Nota de Empenho pode financiar várias competências e uma competência pode consumir
        várias NEs. Por isso o sistema registra a NE separadamente e cria <b>alocações</b> de valor
        entre NE e competência.
      </Passo>

      <Passo numero={7} titulo="Conclua somente quando a evidência fechar">
        Cada etapa tem critérios de conclusão. Alterações posteriores em dados financeiros podem
        marcar a etapa e as posteriores para reconferência, em vez de silenciosamente modificar um
        processo já considerado completo.
      </Passo>
    </AjudaModal>
  );
}

export function AjudaAntesCompetenciaPvh() {
  return (
    <AjudaModal
      label="O que conferir antes de abrir uma competência?"
      titulo="Antes de abrir uma competência PVH"
      descricao="Checklist de preparação para evitar descobrir uma configuração errada no meio do pagamento."
    >
      <div className="space-y-3">
        <div className="rounded-lg border p-4">
          <div className="font-semibold">1. A instituição participa do PVH naquele período?</div>
          <p className="mt-1 text-muted-foreground">
            Cadastre uma vigência de configuração. O campo de início significa
            <b> a primeira competência em que aquela regra vale</b>; não é necessariamente a data
            de publicação de uma Portaria.
          </p>
        </div>

        <div className="rounded-lg border p-4">
          <div className="font-semibold">2. Comunicação e prestação de contas estão corretas?</div>
          <p className="mt-1 text-muted-foreground">
            Essas são regras institucionais e podem variar por período. A obrigação não deve ser
            deduzida pelo nome do hospital.
          </p>
        </div>

        <div className="rounded-lg border p-4">
          <div className="font-semibold">3. Existe base normativa válida para a competência?</div>
          <p className="mt-1 text-muted-foreground">
            Cadastre Deliberações, Portarias ou outros atos na seção de Base normativa, informando
            quando começam e deixam de produzir efeito para o PVH.
          </p>
        </div>

        <div className="rounded-lg border p-4">
          <div className="font-semibold">4. Os processos SEI do ano estão cadastrados?</div>
          <p className="mt-1 text-muted-foreground">
            Empenho e liquidação/pagamento possuem processos anuais próprios por instituição.
            Informe ano, número e link para que o usuário consiga abrir o processo diretamente
            durante a execução.
          </p>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
          <div className="font-semibold">Classificação orçamentária não fica aqui.</div>
          <p className="mt-1">
            CR/dotação, natureza e fonte pertencem à <b>Nota de Empenho concreta</b>. Elas podem
            mudar ao longo do exercício e são registradas no cadastro de cada NE, não como regra
            permanente do hospital.
          </p>
        </div>
      </div>
    </AjudaModal>
  );
}
