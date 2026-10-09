import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/_authenticated/eletivas/')({component: Lista});
function Lista(){return <div>Encontro de Contas — Cirurgias Eletivas HMSJ</div>}
