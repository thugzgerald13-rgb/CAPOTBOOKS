import { useState } from 'react';
import { useTeam } from '@/context/TeamContext';

export default function InviteUser() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const { sendInvitation } = useTeam();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    const ok = await sendInvitation(email, role);
    setSending(false);
    if (ok) {
      setSent(true);
      setEmail('');
      setTimeout(() => setSent(false), 4000);
    }
  }

  return (
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-800">
      <h3 className="text-lg font-semibold mb-2">Invite Team Member</h3>
      <p className="text-sm text-gray-500 mb-4">
        They will keep their own independent account — they simply gain access to your workspace.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium">Email Address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mt-1 px-3 py-2 border rounded-md"
            placeholder="colleague@example.com"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full mt-1 px-3 py-2 border rounded-md"
          >
            <option value="admin">Admin — full management</option>
            <option value="accountant">Accountant — ledger & transactions</option>
            <option value="member">Member — standard access</option>
            <option value="viewer">Viewer — read-only</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={sending}
          className="w-full py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {sending ? 'Sending Invite…' : 'Send Invitation'}
        </button>

        {sent && (
          <p className="text-green-600 text-sm font-medium">
            ✅ Invitation sent! They accept from THEIR account dashboard.
          </p>
        )}
      </form>
    </div>
  );
}
