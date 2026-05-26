import { Shield, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { addAdminCredit, listAdminUsers, updateAdminUser } from '../lib/api.js';
import { formatRupiah } from '../lib/pricing.js';

export default function AdminPanel({ session, enabled }) {
  const [users, setUsers] = useState([]);
  const [amountByUser, setAmountByUser] = useState({});
  const [message, setMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  async function loadUsers() {
    if (!enabled || !session?.access_token) return;
    setIsBusy(true);
    setMessage('');
    try {
      const data = await listAdminUsers(session.access_token);
      setUsers(data.users || []);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsBusy(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, [enabled, session?.access_token]);

  async function addCredit(userId) {
    const amount = Number.parseInt(amountByUser[userId] || '0', 10);
    if (!amount) return;
    setIsBusy(true);
    try {
      await addAdminCredit({ userId, amountIdr: amount, reason: 'manual_topup_shopee' }, session.access_token);
      setAmountByUser((current) => ({ ...current, [userId]: '' }));
      await loadUsers();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsBusy(false);
    }
  }

  async function setUserPatch(userId, patch) {
    setIsBusy(true);
    try {
      await updateAdminUser({ userId, patch }, session.access_token);
      await loadUsers();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsBusy(false);
    }
  }

  if (!enabled) return null;

  return (
    <section className="border border-line bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-spruce" aria-hidden="true" />
          <h2 className="text-base font-semibold text-ink">Admin user & credit</h2>
        </div>
        <button
          type="button"
          onClick={loadUsers}
          disabled={isBusy}
          className="border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-spruce disabled:opacity-60"
        >
          Refresh
        </button>
      </div>

      {message && <p className="mb-3 border border-line bg-panel px-3 py-2 text-sm text-gray-700">{message}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase text-gray-600">
              <th className="py-2 pr-3">Email</th>
              <th className="py-2 pr-3">Role</th>
              <th className="py-2 pr-3">Credit</th>
              <th className="py-2 pr-3">Top up</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-line">
                <td className="py-2 pr-3 font-medium text-ink">{user.email}</td>
                <td className="py-2 pr-3">
                  <select
                    value={user.role}
                    onChange={(event) => setUserPatch(user.id, { role: event.target.value })}
                    className="border border-line bg-white px-2 py-1"
                  >
                    <option value="user">user</option>
                    <option value="superuser">superuser</option>
                  </select>
                </td>
                <td className="py-2 pr-3">{user.is_unlimited ? 'Unlimited' : formatRupiah(user.balance || 0)}</td>
                <td className="py-2 pr-3">
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={amountByUser[user.id] || ''}
                      onChange={(event) => setAmountByUser((current) => ({ ...current, [user.id]: event.target.value }))}
                      className="w-28 border border-line px-2 py-1"
                      placeholder="10000"
                    />
                    <button type="button" onClick={() => addCredit(user.id)} className="border border-spruce px-2 py-1 font-semibold text-spruce">
                      Tambah
                    </button>
                  </div>
                </td>
                <td className="py-2 pr-3">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={user.is_active}
                      onChange={(event) => setUserPatch(user.id, { is_active: event.target.checked })}
                    />
                    Aktif
                  </label>
                </td>
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    onClick={() => setUserPatch(user.id, { is_active: false, deleted_at: new Date().toISOString() })}
                    className="inline-flex h-8 w-8 items-center justify-center border border-tomato text-tomato"
                    title="Deactivate user"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
