import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { AccountingProvider, useAccounting } from './context/AccountingContext';
import { AnimatePresence, motion } from 'motion/react';
import { Sales } from './components/Sales';
import { Billing } from './components/Billing';
import { JournalVoucher } from './components/JournalVoucher';
import { Purchases } from './components/Purchases';
import { TinLibrary } from './components/TinLibrary';
import { History } from './components/History';
import { ChartOfAccounts } from './components/ChartOfAccounts';
import { CashReceiptsJournal } from './components/CashReceiptsJournal';
import { CashDisbursementsJournal } from './components/CashDisbursementsJournal';
import { PurchasesJournal } from './components/PurchasesJournal';
import { GeneralJournal } from './components/GeneralJournal';
import { GeneralLedger } from './components/GeneralLedger';
import { ProfitAndLoss } from './components/ProfitAndLoss';
import { Extras } from './components/Extras';
import { AdminSettings } from './components/AdminSettings';
import { FileManager } from './components/FileManager';
import { Inventory } from './components/Inventory';
import { BIRForms } from './components/BIRForms';
import { ComplianceTracker } from './components/ComplianceTracker';
import AccountsPayable from './components/AccountsPayable';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthContainer } from './components/AuthContainer';
import { HashRouter, Routes, Route } from 'react-router-dom';

function AppLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { toastMsg, clients, navigateToPage, activePage } = useAccounting();
  const { userRole } = useAuth();

  const hasClients = Object.keys(clients).length > 0;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 justify-center overflow-hidden font-sans">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      
      <main className="flex-1 flex flex-col h-screen overflow-y-auto w-full relative">
        <Header onMenuClick={() => setIsSidebarOpen(true)} />
        <div className="px-4 md:px-8 pt-[1.5px] pb-1 md:pb-2 max-w-[1400px] mx-auto w-full">
          {!activePage && (
            hasClients ? (
              <Dashboard />
            ) : (
              <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm mt-8">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">Welcome to your workspace</h2>
                <p className="text-slate-500 dark:text-slate-400 max-w-md mb-8">Let's get started by creating your first {userRole === 'owner' ? 'business' : 'client'} profile to begin tracking transactions and generating reports.</p>
                <button 
                   onClick={() => navigateToPage(userRole === 'owner' ? 'business' : 'clients')}
                   className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 transition-all"
                >
                  {userRole === 'owner' ? 'Create Business Profile' : 'Create Client Profile'}
                </button>
              </div>
            )
          )}
        </div>

        {/* Global Toast */}
        <AnimatePresence>
          {toastMsg && (
            <motion.div
              initial={{ opacity: 0, y: 50, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, scale: 0.9, x: '-50%' }}
              className="fixed bottom-6 left-1/2 bg-emerald-500 text-white px-6 py-3 rounded-full font-semibold shadow-xl shadow-emerald-500/20 z-50 flex items-center gap-2"
            >
              ✓ {toastMsg}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pages: React Router only mounts the component matching the current
            route, so navigating away actually unmounts the previous page
            (fresh state each visit) instead of keeping ~20 components alive
            and toggling visibility. */}
        <div className="px-4 md:px-8 pt-[1.5px] pb-4 md:pb-8 max-w-[1400px] mx-auto w-full">
          <Routes>
            <Route path="/sales" element={<Sales />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/journal-voucher" element={<JournalVoucher />} />
            <Route path="/purchases" element={<Purchases />} />
            <Route path="/tinlibrary" element={<TinLibrary />} />
            <Route path="/history" element={<History />} />
            <Route path="/coa" element={<ChartOfAccounts />} />
            <Route path="/cash-receipt" element={<CashReceiptsJournal />} />
            <Route path="/cash-disbursement" element={<CashDisbursementsJournal />} />
            <Route path="/purchase-journal" element={<PurchasesJournal />} />
            <Route path="/journal" element={<GeneralJournal />} />
            <Route path="/ledger" element={<GeneralLedger />} />
            <Route path="/pl" element={<ProfitAndLoss />} />
            <Route path="/admin-settings" element={<AdminSettings />} />
            {/* Extras bundles several related pages in one file; each gets
                its own route but they all mount the same component, which
                internally shows only the section matching the current route. */}
            <Route path="/clients" element={<Extras />} />
            <Route path="/business" element={<Extras />} />
            <Route path="/reports" element={<Extras />} />
            <Route path="/books" element={<Extras />} />
            <Route path="/taxnotes" element={<Extras />} />
            <Route path="/trialbalance" element={<Extras />} />
            <Route path="/sales-journal" element={<Extras />} />
            <Route path="/files" element={<FileManager />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/bir-forms" element={<BIRForms />} />
            <Route path="/compliance-tracker" element={<ComplianceTracker />} />
            <Route path="/ap-workspace" element={<AccountsPayable />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

import { RoleSelection } from './components/RoleSelection';

function MainApp() {
  const { user, loading, userRole, setUserRole } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 font-sans">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600"></div>
      </div>
    );
  }

  if (!user) {
    return <AuthContainer />;
  }

  const handleRoleSelect = (selectedRole: string) => {
    setUserRole(selectedRole);
  };

  if (!userRole && user) {
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
