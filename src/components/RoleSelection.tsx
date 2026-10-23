import React from 'react';
import { motion } from 'motion/react';
import { Building2, Briefcase, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { PreselectedOnboardingCategory } from './LandingPage';

interface RoleSelectionProps {
  onSelect: (role: string) => void;
  preselectedCategory?: PreselectedOnboardingCategory | null;
}

export function RoleSelection({ onSelect, preselectedCategory }: RoleSelectionProps) {
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl w-full"
      >
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-800 dark:text-slate-100 mb-4">
            Welcome to your Accounting Workspace
          </h1>
          <p className="text-lg text-slate-500 dark:text-slate-400">
            How will you be using this application? Confirm your primary role.
          </p>
          {preselectedCategory && (
            <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-800 text-xs font-bold text-cyan-700 dark:text-cyan-300">
              <CheckCircle2 className="w-4 h-4 text-cyan-600" />
              <span>
                Pre-selected Category: <strong>{preselectedCategory.title}</strong> ({preselectedCategory.taxpayerClassification} ·{' '}
                {preselectedCategory.vatRegistrationType.toUpperCase()})
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button 
            onClick={() => onSelect('owner')}
            className={`group relative flex flex-col items-center p-8 bg-white dark:bg-slate-800 border-2 rounded-3xl hover:border-cyan-500 dark:hover:border-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-500/20 transition-all text-left overflow-hidden h-full ${
              preselectedCategory?.userRole === 'owner'
                ? 'border-cyan-500 ring-2 ring-cyan-500/20'
                : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity translate-x-4 group-hover:translate-x-0">
               <ChevronRight className="w-6 h-6 text-cyan-500" />
            </div>
            <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Building2 className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-3 text-center">Business Owner</h3>
            <p className="text-slate-500 dark:text-slate-400 text-center leading-relaxed">
              I want to manage my own business records, track sales and purchases, and monitor my financial health.
            </p>
          </button>

          <button 
            onClick={() => onSelect('accountant')}
            className={`group relative flex flex-col items-center p-8 bg-white dark:bg-slate-800 border-2 rounded-3xl hover:border-indigo-500 dark:hover:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 transition-all text-left overflow-hidden h-full ${
              preselectedCategory?.userRole === 'accountant'
                ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity translate-x-4 group-hover:translate-x-0">
               <ChevronRight className="w-6 h-6 text-indigo-500" />
            </div>
            <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Briefcase className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-3 text-center">Accountant / Bookkeeper</h3>
            <p className="text-slate-500 dark:text-slate-400 text-center leading-relaxed">
              I am a professional managing books for multiple clients and generating compliance reports.
            </p>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
