import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { AccountingProvider, useAccounting } from './context/AccountingContext';
import { AnimatePresence, motion } from 'motion/react';
import { SalesModal } from './components/modals/SalesModal';
import { BillingModal } from './components/modals/BillingModal';
import { JournalVoucherModal } from './components/modals/JournalVoucherModal';
import { PurchasesModal } from './components/modals/PurchasesModal';
import { TinLibraryModal } from './components/modals/TinLibraryModal';
import { HistoryModal } from './components/modals/HistoryModal';
import { ChartOfAccountsModal } from './components/modals/ChartOfAccountsModal';
import { CashReceiptsJournalModal } from './components/modals/CashReceiptsJournalModal';
import { CashDisbursementsJournalModal } from './components/modals/CashDisbursementsJournalModal';
import { PurchasesJournalModal } from './components/modals/PurchasesJournalModal';
import { GeneralJournalModal } from './components/modals/GeneralJournalModal';
import { GeneralLedgerModal } from './components/modals/GeneralLedgerModal';
import { ProfitAndLossModal } from './components/modals/ProfitAndLossModal';
import { ExtraModals } from './components/modals/ExtraModals';
import { AdminSettingsModal } from './components/modals/AdminSettingsModal';
import { FileManagerModal } from './components/modals/FileManagerModal';
import { InventoryModal } from './components/modals/InventoryModal';
import { BIRFormsModal } from './components/modals/BIRFormsModal';
import { ComplianceTrackerModal } from './components/modals/ComplianceTrackerModal';
import AccountsPayableModal from './components/modals/AccountsPayableModal';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthContainer } from './components/AuthContainer';
import { HashRouter } from 'react-router-dom';

function AppLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { toastMsg, clients, openModal, activeModal } = useAccounting();
  const { userRole } = useAuth();

  const hasClients = Object.keys(clients).length > 0;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 justify-center overflow-hidden font-sans">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      
      <main className="flex-1 flex flex-col h-screen overflow-y-auto w-full relative">
        <div className="p-4 md:p-8 max-w-[1400px] mx-auto w-full">
          <Header onMenuClick={() => setIsSidebarOpen(true)} />
          {!activeModal && (
            hasClients ? (
              <Dashboard />
            ) : (
              <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm mt-8">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">Welcome to your workspace</h2>
                <p className="text-slate-500 dark:text-slate-400 max-w-md mb-8">Let's get started by creating your first {userRole === 'owner' ? 'business' : 'client'} profile to begin tracking transactions and generating reports.</p>
                <button 
                   onClick={() => openModal(userRole === 'owner' ? 'business' : 'clients')}
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

        {/* Modal Declarations */}
        <SalesModal />
        <BillingModal />
        <JournalVoucherModal />
        <PurchasesModal />
        <TinLibraryModal />
        <HistoryModal />
        <ChartOfAccountsModal />
        <CashReceiptsJournalModal />
        <CashDisbursementsJournalModal />
        <PurchasesJournalModal />
        <GeneralJournalModal />
        <GeneralLedgerModal />
        <ProfitAndLossModal />
        <AdminSettingsModal />
        <ExtraModals />
        <FileManagerModal />
        <InventoryModal />
        <BIRFormsModal />
        <ComplianceTrackerModal />
        {activeModal === 'ap-workspace' && <AccountsPayableModal />}
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