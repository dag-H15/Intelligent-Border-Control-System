import { useEffect, useState } from 'react';
import { userService, type UserRecord } from '../services/userService';
import { getApiErrorMessage } from '../services/api';
import { Search, UserPlus, Shield, Pencil, Trash2, X, Check, Loader2, AlertCircle, Lock, Unlock } from 'lucide-react';

type ModalMode = 'create' | 'edit' | 'resetPassword' | 'delete' | null;

const emptyForm = {
  name: '',
  email: '',
  password: '',
  role: 'OFFICER' as UserRecord['role'],
};

export function UserManagementPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRecord['role']>('all');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [activeUser, setActiveUser] = useState<UserRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await userService.getUsers();
      setUsers(data);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to load users.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const filtered = users.filter((u) => {
    const mq = u.name.toLowerCase().includes(query.toLowerCase()) || u.email.toLowerCase().includes(query.toLowerCase());
    const mr = roleFilter === 'all' || u.role === roleFilter;
    return mq && mr;
  });

  const startCreate = () => {
    setModalMode('create');
    setActiveUser(null);
    setForm(emptyForm);
    setActionError('');
    setOpenMenu(null);
  };

  const startEdit = (user: UserRecord) => {
    setModalMode('edit');
    setActiveUser(user);
    setForm({ name: user.name, email: user.email, password: '', role: user.role });
    setActionError('');
    setOpenMenu(null);
  };

  const startResetPassword = (user: UserRecord) => {
    setModalMode('resetPassword');
    setActiveUser(user);
    setForm({ ...emptyForm, role: user.role });
    setActionError('');
    setOpenMenu(null);
  };

  const handleUnlockUser = async (user: UserRecord) => {
    try {
      await userService.unlockUser(user.id);
      await loadUsers();
      setOpenMenu(null);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to unlock user account.'));
    }
  };

  const startDelete = (user: UserRecord) => {
    setModalMode('delete');
    setActiveUser(user);
    setActionError('');
    setOpenMenu(null);
  };

  const closeModal = () => {
    setModalMode(null);
    setActiveUser(null);
    setActionError('');
    setActionLoading(false);
  };

  const handleConfirm = async () => {
    setActionLoading(true);
    setActionError('');

    try {
      if (modalMode === 'create') {
        await userService.createUser({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
        });
      } else if (modalMode === 'edit' && activeUser) {
        await userService.updateUser(activeUser.id, {
          name: form.name,
          email: form.email,
          role: form.role,
        });
      } else if (modalMode === 'resetPassword' && activeUser) {
        await userService.resetPassword(activeUser.id, form.password);
      } else if (modalMode === 'delete' && activeUser) {
        await userService.deleteUser(activeUser.id);
      }

      await loadUsers();
      closeModal();
    } catch (err: unknown) {
      setActionError(getApiErrorMessage(err, 'Action failed.'));
    } finally {
      setActionLoading(false);
    }
  };

  const roleLabel = (role: string) => {
    if (role === 'ADMIN') return 'Administrator';
    if (role === 'SUPERVISOR') return 'Supervisor';
    return 'Border Officer';
  };

  return (
    <div className="space-y-6">
      <div className="card p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-navy-800">User Management</h2>
          <p className="text-sm text-navy-400">Manage system users, roles, and access status</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative md:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-300" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search users..." className="input pl-10" />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as 'all' | UserRecord['role'])}
            className="rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm text-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-200"
          >
            <option value="all">All Roles</option>
            <option value="OFFICER">Border Officer</option>
            <option value="SUPERVISOR">Supervisor</option>
            <option value="ADMIN">Administrator</option>
          </select>
          <button onClick={startCreate} className="btn-primary">
            <UserPlus size={16} /> Add User
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-navy-400">
              <Loader2 size={20} className="animate-spin mr-2" /> Loading...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-accent-red">
              <AlertCircle size={18} className="mr-2" /> {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-navy-400 text-sm">No users found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-navy-50">
                <tr>
                  <th className="table-header px-5 py-3">User</th>
                  <th className="table-header px-5 py-3">Email</th>
                  <th className="table-header px-5 py-3">Role</th>
                  <th className="table-header px-5 py-3">Status</th>
                  <th className="table-header px-5 py-3">Created Date</th>
                  <th className="table-header px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-navy-50/60 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-navy-700 text-white flex items-center justify-center text-xs font-semibold">
                          {u.name.split(' ').slice(-1)[0].slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-navy-800">{u.name}</div>
                          <div className="text-xs text-navy-400 font-mono">{u.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-navy-600">{u.email}</td>
                    <td className="px-5 py-3">
                      <span className={`badge ${u.role === 'ADMIN' ? 'badge-info' : u.role === 'SUPERVISOR' ? 'badge-pending' : 'badge-neutral'}`}>
                        <Shield size={12} /> {roleLabel(u.role)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {u.isLocked ? (
                        <span className="badge-rejected"><Lock size={12} /> Locked</span>
                      ) : (
                        <span className="badge-verified"><Check size={12} /> Active</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-navy-600 whitespace-nowrap">{u.createdDate}</td>
                    <td className="px-5 py-3 text-right relative">
                      <button
                        onClick={() => setOpenMenu(openMenu === u.id ? null : u.id)}
                        className="h-8 w-8 rounded-lg border border-navy-200 flex items-center justify-center text-navy-500 hover:bg-navy-50 inline-flex"
                      >
                        <Pencil size={15} />
                      </button>
                      {openMenu === u.id && (
                        <div className="absolute right-5 mt-1 w-48 rounded-lg border border-navy-100 bg-white shadow-card-hover z-10 py-1 text-left">
                          {u.isLocked && (
                            <button onClick={() => handleUnlockUser(u)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-accent-green hover:bg-accent-green-soft">
                              <Unlock size={14} /> Unlock Account
                            </button>
                          )}
                          <button onClick={() => startEdit(u)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-navy-700 hover:bg-navy-50">
                            <Shield size={14} /> Edit User
                          </button>
                          <button onClick={() => startResetPassword(u)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-accent-amber hover:bg-accent-amber-soft">
                            <Lock size={14} /> Reset Password
                          </button>
                          <button onClick={() => startDelete(u)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-accent-red hover:bg-accent-red-soft">
                            <Trash2 size={14} /> Delete User
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {!loading && !error && (
          <div className="px-5 py-4 border-t border-navy-100 text-xs text-navy-400">
            Showing {filtered.length} of {users.length} users
          </div>
        )}
      </div>

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/50 px-4">
          <div className="card w-full max-w-md p-6">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-base font-semibold text-navy-800">
                {modalMode === 'create' && 'Add User'}
                {modalMode === 'edit' && 'Edit User'}
                {modalMode === 'resetPassword' && 'Reset Password'}
                {modalMode === 'delete' && 'Delete User'}
              </h3>
              <button onClick={closeModal} className="text-navy-400 hover:text-navy-600">
                <X size={18} />
              </button>
            </div>

            {activeUser && modalMode !== 'create' && (
              <div className="rounded-lg bg-navy-50 border border-navy-100 p-3 mb-4">
                <div className="text-sm font-medium text-navy-800">{activeUser.name}</div>
                <div className="text-xs text-navy-400">{activeUser.email} · {activeUser.id}</div>
              </div>
            )}

            {(modalMode === 'create' || modalMode === 'edit') && (
              <div className="space-y-3">
                <div>
                  <label className="label">Name</label>
                  <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} className="input" />
                </div>
                {modalMode === 'create' && (
                  <div>
                    <label className="label">Password</label>
                    <input type="password" value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} className="input" />
                  </div>
                )}
                <div>
                  <label className="label">Assign Role</label>
                  <select value={form.role} onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as UserRecord['role'] }))} className="input">
                    <option value="OFFICER">Border Officer</option>
                    <option value="SUPERVISOR">Supervisor</option>
                    <option value="ADMIN">Administrator</option>
                  </select>
                </div>
              </div>
            )}

            {modalMode === 'resetPassword' && (
              <div>
                <label className="label">New Password</label>
                <input type="password" value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} className="input" />
              </div>
            )}

            {modalMode === 'delete' && (
              <p className="text-sm text-accent-red mb-4">
                Warning: This permanently removes the user and cannot be undone.
              </p>
            )}

            {actionError && (
              <div className="mb-3 flex items-center gap-2 text-sm text-accent-red bg-accent-red-soft rounded-lg px-3 py-2">
                <AlertCircle size={15} /> {actionError}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-5">
              <button onClick={closeModal} className="btn-secondary" disabled={actionLoading}>
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={actionLoading || (modalMode === 'create' && (!form.name || !form.email || !form.password)) || (modalMode === 'edit' && (!form.name || !form.email)) || (modalMode === 'resetPassword' && !form.password)}
                className={`btn text-white disabled:opacity-60 ${modalMode === 'delete' ? 'bg-accent-red hover:bg-red-700' : 'bg-accent-green hover:bg-green-700'}`}
              >
                {actionLoading ? <Loader2 size={15} className="animate-spin" /> : <><Check size={15} /> Confirm</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
