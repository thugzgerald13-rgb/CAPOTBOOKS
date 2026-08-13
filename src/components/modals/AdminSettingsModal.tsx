import React, { useEffect, useState } from 'react';
import { ShieldAlert, Download, Users, RefreshCw, Mail, Calendar } from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { useAccounting } from '../../context/AccountingContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  userRole?: string;
  lastLogin?: any;
  updatedAt?: any;
}

export function AdminSettingsModal() {
  const { currentClient } = useAccounting();
  const { isAdmin, userRole, setUserRole } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, display_name, user_role, last_login, updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      const userList = (data || []).map((row) => ({
        uid: row.id,
        email: row.email,
        displayName: row.display_name,
        userRole: row.user_role,
        lastLogin: row.last_login,
        updatedAt: row.updated_at,
      })) as UserProfile[];
      setUsers(userList);
    } catch (err) {
      console.error("Error fetching users:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const handleBackup = () => {
    const dataStr = JSON.stringify(users, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `capotbooks_users_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  if (!isAdmin) return null;

  return (
    <div className="w-full bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm mt-8 flex flex-col overflow-hidden">
      <PageHeader title="Developer System Config" icon={<ShieldAlert className="text-emerald-500" />} />
      <div className="p-4 md:p-6 flex-1">
      <div className="p-6 overflow-y-auto max-h-[80vh]">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Superuser Dashboard</h3>
          <button 
            onClick={handleBackup}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md transition-all active:scale-95"
          >
            <Download className="w-4 h-4" />
            Backup User Directory
          </button>
        </div>
        
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 mb-8">
          <p className="text-sm text-emerald-800 dark:text-emerald-300 font-medium mb-4">
            Authorized Developer: thugz.gerald13@gmail.com
          </p>
          
          <div className="flex items-center gap-4">
            <label className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
              Current Active View:
            </label>
            <select 
              value={userRole || ''} 
              onChange={(e) => setUserRole(e.target.value)}
              className="bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-700 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="owner">Business Owner</option>
              <option value="accountant">Accountant / Bookkeeper</option>
            </select>
          </div>
        </div>

        {/* User List Table */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-500" />
              <h4 className="font-bold text-slate-700 dark:text-slate-200">Registered Users ({users.length})</h4>
            </div>
            <button 
              onClick={fetchUsers}
              className="p-2 text-slate-400 hover:text-blue-500 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-3 font-bold text-slate-600 dark:text-slate-400">User</th>
                  <th className="px-4 py-3 font-bold text-slate-600 dark:text-slate-400">Role</th>
                  <th className="px-4 py-3 font-bold text-slate-600 dark:text-slate-400 text-right">Last Sync</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {users.map((u) => (
                  <tr key={u.uid} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          {u.displayName || 'Anonymous'}
                          {u.email === 'thugz.gerald13@gmail.com' && <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-600 text-[10px] px-1 rounded border border-amber-200">DEV</span>}
                        </span>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {u.email}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${u.userRole === 'owner' ? 'bg-cyan-100 text-cyan-700' : 'bg-indigo-100 text-indigo-700'}`}>
                        {u.userRole || 'Not Set'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-400 tabular-nums">
                      <div className="flex items-center justify-end gap-1">
                        <Calendar className="w-3 h-3" />
                        {u.lastLogin?.toDate ? u.lastLogin.toDate().toLocaleString() : 'N/A'}
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-slate-400 italic">
                      No users synchronized with central database yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-white dark:bg-slate-800">
            <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-2">Current Active Client Context</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {currentClient ? currentClient.id : 'No client selected'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Data is synced to Supabase Postgres under `clients` (row id = `${currentClient?.id || 'CLIENT_ID'}`), with LocalStorage as an offline fallback.
            </p>
          </div>

          <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-white dark:bg-slate-800">
            <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-2">System Status</h4>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse"></span>
              Local Database Active
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mt-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
              Supabase Auth Active
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mt-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
              Supabase Postgres Sync Active
            </div>
          </div>
        </div>
      </div>
          </div>
    </div>
  );
}
