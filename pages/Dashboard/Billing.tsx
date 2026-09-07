import React, { useCallback, useEffect, useState } from 'react';
import { CreditCard, Zap, History, AlertTriangle, Lock, Check } from 'lucide-react';
import { useSessionStore } from '../../store/useSessionStore';
import { logger } from '../../lib/logger';
import { Badge, Button, EmptyState, Skeleton, Table, TableHead, TableRow, TableCell } from '../../components/design-system';

interface WalletSummary {
  tenantId: string;
  balanceCents: number;
  currency: string;
  planId: string | null;
  planName: string | null;
  planStatus: 'inactive' | 'active' | 'past_due' | 'canceled' | 'trialing';
  currentPeriodEnd: string | null;
}

interface TransactionSummary {
  id: string;
  type: string;
  amountCents: number;
  balanceAfterCents: number;
  status: string;
  description: string | null;
  createdAt: string;
}

interface TransactionsPage {
  items: TransactionSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface PlanOption {
  id: string;
  slug: string;
  name: string;
  priceCents: number;
  currency: string;
  billingInterval: string;
}

type WalletState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; wallet: WalletSummary | null };
type TransactionsState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: TransactionsPage };
type PlansState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; plans: PlanOption[] };

const TRANSACTIONS_PAGE_SIZE = 10;

function formatCents(amountCents: number, currency: string): string {
  return (amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency });
}

const PLAN_STATUS_LABEL: Record<WalletSummary['planStatus'], string> = {
  active: 'Ativo',
  trialing: 'Em teste',
  past_due: 'Pagamento pendente',
  canceled: 'Cancelado',
  inactive: 'Inativo',
};

const PLAN_STATUS_BADGE: Record<WalletSummary['planStatus'], 'success' | 'warning' | 'danger' | 'secondary'> = {
  active: 'success',
  trialing: 'success',
  past_due: 'warning',
  canceled: 'danger',
  inactive: 'secondary',
};

// Real billing/credits backend (prisma Plan/Wallet/Transaction — see
// .agents/handoffs/onda-4/01-para-12-schema-billing-pronto.md). GET/POST /api/billing/* are
// admin-only within the tenant (same authorization level as GET /api/users and GET /api/audit-log
// — real customer money, AGENTS.md §9 item 16 / §16 item 12), so a non-admin sees an explicit
// "acesso restrito" state instead of a silently empty page. Plan proration on change is a
// documented, out-of-scope limitation (see billingService.ts) — this page only offers an
// immediate plan switch.
export default function BillingPage() {
  const sessionUser = useSessionStore((state) => state.user);
  const isAdmin = sessionUser?.role === 'admin';

  const [walletState, setWalletState] = useState<WalletState>({ status: 'loading' });
  const [transactionsState, setTransactionsState] = useState<TransactionsState>({ status: 'loading' });
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [plansState, setPlansState] = useState<PlansState>({ status: 'loading' });
  const [changingPlanId, setChangingPlanId] = useState<string | null>(null);
  const [changePlanError, setChangePlanError] = useState<string | null>(null);

  const fetchWallet = useCallback(() => {
    if (!isAdmin) return;
    setWalletState({ status: 'loading' });
    fetch('/api/billing/summary')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { wallet: WalletSummary | null }) => setWalletState({ status: 'ready', wallet: data.wallet }))
      .catch((err) => {
        logger.error('Failed to load wallet summary', { err });
        setWalletState({ status: 'error' });
      });
  }, [isAdmin]);

  const fetchTransactions = useCallback(
    (page: number) => {
      if (!isAdmin) return;
      setTransactionsState({ status: 'loading' });
      fetch(`/api/billing/transactions?page=${page}&pageSize=${TRANSACTIONS_PAGE_SIZE}`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data: TransactionsPage) => setTransactionsState({ status: 'ready', data }))
        .catch((err) => {
          logger.error('Failed to load billing transactions', { err });
          setTransactionsState({ status: 'error' });
        });
    },
    [isAdmin]
  );

  const fetchPlans = useCallback(() => {
    setPlansState({ status: 'loading' });
    fetch('/api/billing/plans')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { plans: PlanOption[] }) => setPlansState({ status: 'ready', plans: data.plans }))
      .catch((err) => {
        logger.error('Failed to load billing plans', { err });
        setPlansState({ status: 'error' });
      });
  }, []);

  useEffect(() => { fetchWallet(); }, [fetchWallet]);
  useEffect(() => { fetchTransactions(transactionsPage); }, [fetchTransactions, transactionsPage]);
  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const handleChangePlan = async (planId: string) => {
    setChangingPlanId(planId);
    setChangePlanError(null);
    try {
      const res = await fetch('/api/billing/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, effectiveAt: 'immediate' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setWalletState({ status: 'ready', wallet: data.wallet });
    } catch (err) {
      logger.error('Failed to change plan', { err });
      setChangePlanError(err instanceof Error ? err.message : 'Não foi possível trocar de plano.');
    } finally {
      setChangingPlanId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Faturamento & Planos</h1>
      </div>

      {!isAdmin ? (
        <EmptyState
          icon={<Lock className="h-8 w-8" />}
          title="Acesso restrito"
          description="Faturamento, saldo e histórico de cobrança exigem o papel de administrador nesta organização."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {walletState.status === 'loading' ? (
              <>
                <Skeleton className="h-40 rounded-xl md:col-span-1" />
                <Skeleton className="h-40 rounded-xl md:col-span-1" />
              </>
            ) : walletState.status === 'error' ? (
              <div className="md:col-span-2">
                <EmptyState
                  icon={<AlertTriangle className="h-8 w-8" />}
                  title="Não foi possível carregar o saldo/plano"
                  description="Tente novamente em alguns instantes."
                  action={<Button size="sm" variant="outline" onClick={fetchWallet}>Tentar novamente</Button>}
                />
              </div>
            ) : walletState.wallet === null ? (
              <div className="md:col-span-2">
                <EmptyState
                  icon={<CreditCard className="h-8 w-8" />}
                  title="Nenhuma carteira de faturamento ainda"
                  description="Esta organização ainda não tem saldo ou plano configurados. Escolha um plano abaixo para começar."
                />
              </div>
            ) : (
              <>
                <div className="bg-gradient-to-br from-brand to-brand-800 rounded-xl p-6 text-white shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-8 -mt-8 blur-2xl"></div>
                  <div className="flex items-center gap-2 mb-2 opacity-80">
                    <CreditCard className="h-5 w-5" />
                    <span className="text-sm font-medium">Saldo em Carteira</span>
                  </div>
                  <div className="text-4xl font-bold mb-4">
                    {formatCents(walletState.wallet.balanceCents, walletState.wallet.currency)}
                  </div>
                  <button
                    disabled
                    title="Recarga de saldo ainda não implementada"
                    className="w-full py-2 bg-white/10 rounded-lg text-sm font-bold cursor-not-allowed opacity-60"
                  >
                    Recarga indisponível
                  </button>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                  <div className="flex items-center gap-2 mb-2 text-slate-500 dark:text-slate-400">
                    <Zap className="h-5 w-5 text-yellow-500" />
                    <span className="text-sm font-medium">Plano Atual</span>
                  </div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                    {walletState.wallet.planName ?? 'Nenhum plano'}
                  </div>
                  <div className="mb-4 flex items-center gap-2">
                    <Badge variant={PLAN_STATUS_BADGE[walletState.wallet.planStatus]}>
                      {PLAN_STATUS_LABEL[walletState.wallet.planStatus]}
                    </Badge>
                    {walletState.wallet.currentPeriodEnd && (
                      <span className="text-xs text-slate-400">
                        Renova em {new Date(walletState.wallet.currentPeriodEnd).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {changePlanError && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm font-medium flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{changePlanError}</span>
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 flex items-center gap-2">
              <Zap className="h-4 w-4 text-slate-500" />
              <h3 className="font-bold text-slate-800 dark:text-slate-200">Gerenciar Assinatura</h3>
            </div>
            {plansState.status === 'loading' ? (
              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : plansState.status === 'error' ? (
              <div className="p-8">
                <EmptyState
                  icon={<AlertTriangle className="h-8 w-8" />}
                  title="Não foi possível carregar os planos"
                  description="Tente novamente em alguns instantes."
                  action={<Button size="sm" variant="outline" onClick={fetchPlans}>Tentar novamente</Button>}
                />
              </div>
            ) : plansState.plans.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                Nenhum plano disponível no momento.
              </div>
            ) : (
              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                {plansState.plans.map((plan) => {
                  const isCurrent = walletState.status === 'ready' && walletState.wallet?.planId === plan.id;
                  return (
                    <div
                      key={plan.id}
                      className={`rounded-lg border p-5 flex flex-col ${
                        isCurrent
                          ? 'border-brand ring-1 ring-brand/30 bg-brand/5'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{plan.name}</span>
                      <span className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
                        {formatCents(plan.priceCents, plan.currency)}
                        <span className="text-xs font-normal text-slate-400">
                          /{plan.billingInterval === 'yearly' ? 'ano' : 'mês'}
                        </span>
                      </span>
                      <div className="mt-4">
                        {isCurrent ? (
                          <Button size="sm" variant="outline" disabled className="w-full gap-1.5">
                            <Check className="h-3.5 w-3.5" /> Plano atual
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="w-full"
                            disabled={changingPlanId !== null}
                            onClick={() => handleChangePlan(plan.id)}
                          >
                            {changingPlanId === plan.id ? 'Trocando...' : 'Selecionar'}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 flex items-center gap-2">
              <History className="h-4 w-4 text-slate-500" />
              <h3 className="font-bold text-slate-800 dark:text-slate-200">Histórico de Uso</h3>
            </div>

            {transactionsState.status === 'loading' ? (
              <div className="p-6 space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : transactionsState.status === 'error' ? (
              <div className="p-8">
                <EmptyState
                  icon={<AlertTriangle className="h-8 w-8" />}
                  title="Não foi possível carregar o histórico de uso"
                  description="Tente novamente em alguns instantes."
                  action={<Button size="sm" variant="outline" onClick={() => fetchTransactions(transactionsPage)}>Tentar novamente</Button>}
                />
              </div>
            ) : transactionsState.data.items.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                Sem histórico de uso — nenhuma cobrança real ainda existe para esta organização.
              </div>
            ) : (
              <div className="space-y-4">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell isHeader>Tipo</TableCell>
                      <TableCell isHeader>Descrição</TableCell>
                      <TableCell isHeader>Valor</TableCell>
                      <TableCell isHeader>Saldo após</TableCell>
                      <TableCell isHeader>Status</TableCell>
                      <TableCell isHeader>Quando</TableCell>
                    </TableRow>
                  </TableHead>
                  <tbody>
                    {transactionsState.data.items.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300">{tx.type}</TableCell>
                        <TableCell className="text-xs text-slate-500 dark:text-slate-400">{tx.description ?? '—'}</TableCell>
                        <TableCell className={`text-xs font-semibold ${tx.amountCents >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {tx.amountCents >= 0 ? '+' : ''}
                          {formatCents(tx.amountCents, 'BRL')}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 dark:text-slate-400">{formatCents(tx.balanceAfterCents, 'BRL')}</TableCell>
                        <TableCell><Badge variant={tx.status === 'completed' ? 'success' : 'secondary'}>{tx.status}</Badge></TableCell>
                        <TableCell className="text-xs text-slate-400 whitespace-nowrap">{new Date(tx.createdAt).toLocaleString('pt-BR')}</TableCell>
                      </TableRow>
                    ))}
                  </tbody>
                </Table>
                <div className="flex items-center justify-between p-4 pt-0">
                  <span className="text-xs text-slate-500">
                    Página {transactionsState.data.page} de {transactionsState.data.totalPages} · {transactionsState.data.total} lançamento(s)
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={transactionsState.data.page <= 1}
                      onClick={() => setTransactionsPage((p) => Math.max(1, p - 1))}
                    >
                      Anterior
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={transactionsState.data.page >= transactionsState.data.totalPages}
                      onClick={() => setTransactionsPage((p) => p + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
