import React, { lazy, Suspense, useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { AccountingProvider, useAccounting } from './context/AccountingContext';
import { AnimatePresence, motion } from 'motion/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthContainer } from './components/AuthContainer';
import { RoleSelection } from './components/RoleSelection';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ToastContainer } from './components/ui/Toast';
import { routeRequiresPermission, routeIsAdminOnly, routeIsFeatureLocked } from './lib/pagePermissions';
import { moduleForRoute } from './lib/modules';
import { useEntitlements, loadEntitlements, resetEntitlements, isModuleUnlocked, isResolving } from './lib/subscription';
import { ModuleLocked } from './components/ModuleLocked';
import { logAudit } from './lib/accessControl';
import { AIAssistant } from './components/AIAssistant';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PageSkeleton, EmptyState, Button } from './components/ui';
import { Wallet } from 'lucide-react';

const Sales = lazy(() => import('./components/Sales').then(m => ({ default: m.Sales })));
const Billing = lazy(() => import('./components/Billing').then(m => ({ default: m.Billing })));
const JournalVoucher = lazy(() => import('./components/JournalVoucher').then(m => ({ default: m.JournalVoucher })));
const Purchases = lazy(() => import('./components/Purchases').then(m => ({ default: m.Purchases })));
const TinLibrary = lazy(() => import('./components/TinLibrary').then(m => ({ default: m.TinLibrary })));
const History = lazy(() => import('./components/History').then(m => ({ default: m.History })));
const ChartOfAccounts = lazy(() => import('./components/ChartOfAccounts').then(m => ({ default: m.ChartOfAccounts })));
const CashReceiptsJournal = lazy(() => import('./components/CashReceiptsJournal').then(m => ({ default: m.CashReceiptsJournal })));
const CashDisbursementsJournal = lazy(() => import('./components/CashDisbursementsJournal').then(m => ({ default: m.CashDisbursementsJournal })));
const PurchasesJournal = lazy(() => import('./components/PurchasesJournal').then(m => ({ default: m.PurchasesJournal })));
const SalesJournal = lazy(() => import('./components/SalesJournal').then(m => ({ default: m.SalesJournal })));
const GeneralJournal = lazy(() => import('./components/GeneralJournal').then(m => ({ default: m.GeneralJournal })));
const GeneralLedger = lazy(() => import('./components/GeneralLedger').then(m => ({ default: m.GeneralLedger })));
const ProfitAndLoss = lazy(() => import('./components/ProfitAndLoss').then(m => ({ default: m.ProfitAndLoss })));
const BalanceSheet = lazy(() => import('./components/BalanceSheet').then(m => ({ default: m.BalanceSheet })));
const CashFlow = lazy(() => import('./components/CashFlow').then(m => ({ default: m.CashFlow })));
const AssetLapsing = lazy(() => import('./components/AssetLapsing').then(m => ({ default: m.AssetLapsing })));
const Extras = lazy(() => import('./components/Extras').then(m => ({ default: m.Extras })));
const AdminSettings = lazy(() => import('./components/AdminSettings').then(m => ({ default: m.AdminSettings })));
const Diagnostics = lazy(() => import('./components/Diagnostics').then(m => ({ default: m.Diagnostics })));
const FileManager = lazy(() => import('./components/FileManager').then(m => ({ default: m.FileManager })));
const Inventory = lazy(() => import('./components/Inventory').then(m => ({ default: m.Inventory })));
const BIRForms = lazy(() => import('./components/BIRForms').then(m => ({ default: m.BIRForms })));
const Relief = lazy(() => import('./components/Relief').then(m => ({ default: m.Relief })));
const ComplianceTracker = lazy(() => import('./components/ComplianceTracker').then(m => ({ default: m.ComplianceTracker })));
const AccountSettings = lazy(() => import('./components/AccountSettings').then(m => ({ default: m.AccountSettings })));
const TeamSettings = lazy(() => import('./components/TeamSettings').then(m => ({ default: m.TeamSettings })));
const PaymentApproval = lazy(() => import('./components/PaymentApproval').then(m => ({ default: m.PaymentApproval })));
const EisCenter = lazy(() => import('./components/EisCenter').then(m => ({ default: m.EisCenter })));
const PayrollHub = lazy(() => import('./payroll/PayrollHub').then(m => ({ default: m.PayrollHub })));

/**
 * Route-level permission + module guard (Goal A). Wraps the whole <Routes> block so a
 * restricted user cannot open a sensitive page by typing its URL directly.
 * Mirrors the Sidebar `canUse` rule: every non-owner user (team subusers AND
 * standalone Accountant/Bookkeeper accounts viewing a shared client) is gated
 * by their client-scoped permissions; developer-only routes are blocked for
 * everyone except the developer account. Denied navigation bounces back to
 * the Dashboard ("/") and writes an audit-log entry.
 */
function RequirePermission({ children }: { children: React.ReactNode }) {
  const { hasPermission, isAdmin, user } = useAuth();
  const ent = useEntitlements();
  const location = useLocation();
  const path = location.pathname;

  const adminOnly = routeIsAdminOnly(path);
  const required = routeRequiresPermission(path);
  // Applies to BOTH invited team subusers AND standalone Accountant/Bookkeeper
  // accounts viewing a shared client — hasPermission() is client-scoped and
  // returns full access for the user's own clients. Owners/admins bypass via
  // hasPermission itself (returns true), so no role check is needed here.
  const denied = adminOnly ? !isAdmin : Boolean(required && !hasPermission(required));
  // Hard feature allowlist: every page EXCEPT those explicitly allowed is
  // blocked for every non-developer user (new and existing alike). The
  // developer account (isAdmin) bypasses this lock entirely.
  const featureLocked = !isAdmin && routeIsFeatureLocked(path);
  // Module gate: Core routes are never locked. Paid-module routes need an
  // active trial or paid entitlement (the developer account is exempt).
  const moduleId = moduleForRoute(path);
  const moduleLocked = moduleId !== null && !isModuleUnlocked(ent, moduleId, isAdmin);

  useEffect(() => {
    if ((denied || featureLocked) && user) {
      logAudit({
        userEmail: user.email || 'unknown',
        action: 'route_access_denied',
        entity: path,
        details: featureLocked ? 'feature not in allowlist' : adminOnly ? 'admin-only route' : `missing permission: ${required}`,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [denied, featureLocked, path]);

  if (denied || featureLocked) return <Navigate to="/" replace />;
  if (moduleId && !isAdmin && isResolving(ent)) return <PageSkeleton />;
  if (moduleLocked && moduleId) return <ModuleLocked moduleId={moduleId} />;
  return <>{children}</>;
}

function AppLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { clients, currentClient, navigateToPage, activePage, businessProfile } = useAccounting();
  const { userRole, isAdmin } = useAuth();

  const hasClients = Object.keys(clients).length > 0;

  // Payroll company identity follows the same active profile used throughout
  // CAPOTBOOKS (currentClient), rather than always showing the account owner's
  // Business Profile when a Client Profile is selected.
  const payrollCompany = currentClient ? {
    name: currentClient.registeredName || currentClient.tradeName || currentClient.name || 'CAPOTBOOKS Business',
    tin: currentClient.tin || '',
    address: [currentClient.substreet, currentClient.street, currentClient.barangay, currentClient.district, currentClient.city, currentClient.zipCode].filter(Boolean).join(', '),
    email: currentClient.email || '',
    planId: 'enterprise',
    watermarkEnabled: false,
  } : {
    name: businessProfile?.tradeName || businessProfile?.registeredName || businessProfile?.name || 'CAPOTBOOKS Business',
    tin: businessProfile?.tin || '',
    address: [businessProfile?.substreet, businessProfile?.street, businessProfile?.barangay, businessProfile?.district, businessProfile?.city, businessProfile?.zipCode].filter(Boolean).join(', '),
    email: businessProfile?.email || '',
    planId: 'enterprise',
    watermarkEnabled: false,
  };

  // Onboarding gate: once a role (Business Owner or Accountant) is chosen,
  // the Business Profile must be completed — TIN, Taxpayer Classification,
  // Trade Name, Address and RDO Code — before any other page can be opened.
  useEffect(() => {
    if (!userRole) return;
    if (activePage === 'business') return;
    const p = businessProfile;
    const incomplete = !p
      || !String(p.tin || '').trim()
      || !String(p.taxpayerClassification || '').trim()
      || !String(p.tradeName || '').trim()
      || ![p.substreet, p.street, p.barangay, p.district, p.city].some(v => String(v || '').trim())
      || !String(p.rdoCode || '').trim();
    if (incomplete) navigateToPage('business');
  }, [userRole, businessProfile, activePage, navigateToPage]);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 justify-center overflow-hidden font-sans">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      
      <main className="app-main flex-1 flex flex-col h-screen overflow-y-auto w-full relative">
        <Header onMenuClick={() => setIsSidebarOpen(true)} />
        <ErrorBoundary>
        <div className="app-content px-4 md:px-8 pt-[1.5px] pb-1 md:pb-2 max-w-[1400px] mx-auto w-full">
          {!activePage && (
            hasClients ? (
              <Dashboard />
            ) : (
              <div className="mt-8 card-surface">
                <EmptyState
                  icon={<Wallet className="w-7 h-7" />}
                  title="Welcome to your workspace"
                  description="Set up your business profile (TIN, Taxpayer Classification, Trade Name, Address and RDO Code) to begin tracking transactions and generating reports."
                  action={<Button size="lg" onClick={() => navigateToPage('business')}>Set up Business Profile</Button>}
                />
              </div>
            )
          )}
        </div>

        </ErrorBoundary>
        {/* Global stacked toasts (Run 003 / T003) — imperative API via `toast` */}
        <ToastContainer />
        {/* AI Assistant — developer-only until built out (isAdmin = developer account) */}
        {isAdmin && <AIAssistant />}

        {/* Pages: React Router only mounts the component matching the current
            route, so navigating away actually unmounts the previous page
            (fresh state each visit) instead of keeping ~20 components alive
            and toggling visibility. */}
        <div className="app-content transaction-page-content px-4 md:px-8 pt-[1.5px] pb-4 md:pb-8 max-w-[1400px] mx-auto w-full">
          <Suspense fallback={<PageSkeleton />}>
          <RequirePermission>
          <Routes>
            {/* HashRouter starts at "/" when the app is opened without a hash.
                Keep an explicit root route so React Router does not report
                "No routes matched location \"/\"" while the dashboard
                is rendered by AppLayout above. */}
            <Route path="/" element={null} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/journal-voucher" element={<JournalVoucher />} />
            {/* Purchases has three sub-workspaces (Invoiced, Other Payments,
                AP), each with its own URL so they're bookmarkable and work
                with browser back/forward, same pattern as Extras below. */}
            <Route path="/purchases" element={<Navigate to="/purchases/invoiced" replace />} />
            <Route path="/purchases/invoiced" element={<Purchases />} />
            <Route path="/purchases/other-payments" element={<Purchases />} />
            <Route path="/purchases/ap" element={<Purchases />} />
            <Route path="/tinlibrary" element={<TinLibrary />} />
            <Route path="/history" element={<History />} />
            <Route path="/coa" element={<ChartOfAccounts />} />
            <Route path="/cash-receipt" element={<CashReceiptsJournal />} />
            <Route path="/cash-disbursement" element={<CashDisbursementsJournal />} />
            <Route path="/purchase-journal" element={<PurchasesJournal />} />
            <Route path="/journal" element={<GeneralJournal />} />
            <Route path="/ledger" element={<GeneralLedger />} />
            <Route path="/pl" element={<ProfitAndLoss />} />
            {/* AFS Draft entries currently use the existing report components.
                Explicit routes prevent navigation to these sidebar entries from
                producing React Router "No routes matched" errors. */}
            <Route path="/afs-financial-position" element={<BalanceSheet />} />
            <Route path="/afs-income-statements" element={<ProfitAndLoss />} />
            <Route path="/afs-equity-retained-earnings" element={<BalanceSheet />} />
            <Route path="/afs-ppe" element={<AssetLapsing />} />
            <Route path="/developertools/systemconfig" element={<AdminSettings />} />
            <Route path="/developertools/diagnostics" element={<AdminSettings />} />
            <Route path="/admin/payments" element={<PaymentApproval />} />
            <Route path="/diagnostics" element={<Diagnostics />} />
            {/* Extras bundles several related pages in one file; each gets
                its own route but they all mount the same component, which
                internally shows only the section matching the current route. */}
            <Route path="/account-settings" element={<AccountSettings />} />
            <Route path="/team" element={<TeamSettings />} />
            <Route path="/clients" element={<Extras />} />
            <Route path="/business" element={<Extras />} />
            <Route path="/reports" element={<Extras />} />
            <Route path="/books" element={<Extras />} />
            <Route path="/taxnotes" element={<Extras />} />
            <Route path="/trialbalance" element={<Extras />} />
            <Route path="/balancesheet" element={<BalanceSheet />} />
            <Route path="/cashflow" element={<CashFlow />} />
            <Route path="/assetlapsing" element={<AssetLapsing />} />
            <Route path="/sales-journal" element={<SalesJournal />} />
            <Route path="/files" element={<FileManager />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/bir-forms" element={<BIRForms />} />
            <Route path="/relief" element={<Relief />} />
            <Route path="/compliance-tracker" element={<ComplianceTracker />} />
            <Route path="/eis-center" element={<EisCenter />} />
            <Route path="/payroll" element={<PayrollHub company={payrollCompany} initialPage="dashboard" />} />
            <Route path="/payroll/settings" element={<PayrollHub company={payrollCompany} initialPage="settings" />} />
            <Route path="/ap-workspace" element={<Navigate to="/purchases/ap" replace />} />
            <Route path="/functions" element={<Navigate to="/account-settings" replace />} />
          </Routes>
          </RequirePermission>
          </Suspense>
        </div>
      </main>
    </div>
  );
}


function MainApp() {
  const { user, loading, accountReady, userRole, setUserRole } = useAuth();

  // Load trial + module entitlements from the server once the user has chosen a
  // role (the server starts the trial clock on this first call), then refresh
  // whenever the tab regains focus so a newly approved payment unlocks quickly.
  const entitlementUserId = user && userRole ? user.id : null;
  useEffect(() => {
    if (!entitlementUserId) { resetEntitlements(); return; }
    loadEntitlements(entitlementUserId);
    const onVisible = () => { if (document.visibilityState === 'visible') loadEntitlements(entitlementUserId); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [entitlementUserId]);

  if (loading || (user && !accountReady)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 font-sans">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600"></div>
      </div>
    );
  }

  if (!user) {
    return <AuthContainer />;
  }

  // Primary role selection — shown FIRST after login so the user's role
  // (Business Owner vs Accountant) is persisted to their profile before the
  // workspace opens (the role also decides the trial length).
  const handleRoleSelect = (selectedRole: string) => {
    setUserRole(selectedRole);
  };

  if (!userRole) {
    return <RoleSelection onSelect={handleRoleSelect} />;
  }

  return (
    <AccountingProvider>
      <AppLayout />
    </AccountingProvider>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </HashRouter>
  );
}
