import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/auth-store';
import { supabase } from '../../lib/supabase';
import type { Profile, UserRole } from '../../types';
import { Search, Trash2, UserPlus, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ThemeToggle } from '../../components/theme-toggle';
import { showConfirm, showError, showSuccess } from '../../lib/swal';
import { getSafeMediaUrl } from '../../lib/media';

export const UsersCrud: React.FC = () => {
  const { signOut, isMock } = useAuthStore();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // New Profile Form State
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('student');
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchProfiles = async () => {
    setLoading(true);
    if (isMock) {
      // Fetch mock profiles from local storage
      const mockProfiles = JSON.parse(localStorage.getItem('mock_profiles') || '[]');
      const defaultProfiles: Profile[] = [
        { id: 'mock-uuid-admin', role: 'admin', full_name: 'Administrator Sinesa', avatar_url: null, created_at: new Date().toISOString() },
        { id: 'mock-uuid-teacher', role: 'teacher', full_name: 'Ibu Guru Pertiwi', avatar_url: null, created_at: new Date().toISOString() },
        { id: 'mock-uuid-student', role: 'student', full_name: 'Budi Santoso', avatar_url: null, created_at: new Date().toISOString() },
      ];
      
      const customProfiles: Profile[] = mockProfiles.map((p: any, idx: number) => ({
        id: `mock-custom-${idx}`,
        role: p.role,
        full_name: p.fullName,
        avatar_url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(p.fullName)}`,
        created_at: new Date().toISOString()
      }));

      setProfiles([...defaultProfiles, ...customProfiles]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setProfiles(data as Profile[]);
      }
    } catch (err) {
      console.error('Error fetching profiles:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const handleRoleChange = async (userId: string, role: UserRole) => {
    if (isMock) {
      // Update local profile list
      const updated = profiles.map(p => p.id === userId ? { ...p, role } : p);
      setProfiles(updated);
      return;
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', userId);

      if (!error) {
        setProfiles(profiles.map(p => p.id === userId ? { ...p, role } : p));
      }
    } catch (err) {
      console.error('Error changing role:', err);
    }
  };

  const handleDeleteProfile = async (userId: string) => {
    if (userId.startsWith('mock-uuid-')) {
      showError('Gagal', 'Akun bawaan sistem demonstrasi tidak dapat dihapus.');
      return;
    }

    const confirmRes = await showConfirm(
      'Hapus Pengguna',
      'Apakah Anda yakin ingin menghapus pengguna ini secara permanen?',
      'Ya, Hapus',
      'Batal'
    );
    if (!confirmRes.isConfirmed) return;

    if (isMock) {
      const updated = profiles.filter(p => p.id !== userId);
      setProfiles(updated);
      showSuccess('Berhasil', 'Pengguna telah dihapus (Mode Mock).');
      return;
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (!error) {
        setProfiles(profiles.filter(p => p.id !== userId));
        showSuccess('Berhasil', 'Pengguna telah dihapus secara permanen.');
      } else {
        showError('Gagal', `Gagal menghapus pengguna: ${error.message}`);
      }
    } catch (err: any) {
      console.error('Error deleting profile:', err);
      showError('Kesalahan', `Terjadi kesalahan: ${err.message || err}`);
    }
  };

  const handleCreateMockUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFullName || !newEmail) return;

    const mockProfiles = JSON.parse(localStorage.getItem('mock_profiles') || '[]');
    mockProfiles.push({ email: newEmail, role: newRole, fullName: newFullName });
    localStorage.setItem('mock_profiles', JSON.stringify(mockProfiles));

    setNewFullName('');
    setNewEmail('');
    setNewRole('student');
    setShowAddForm(false);
    fetchProfiles();
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const filteredProfiles = profiles.filter(p =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header bar */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-foreground tracking-tight">SINESA Admin Panel</h1>
            <p className="text-muted-foreground text-sm">Kelola pengguna, profil, dan peran sistem evaluasi</p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 px-4 py-2 text-sm font-semibold transition hover:bg-destructive hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              Keluar
            </button>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Form & Stats Panel */}
          <div className="lg:col-span-1 space-y-6">
            <div className="glass-panel p-6 rounded-3xl shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-foreground">Statistik Pengguna</h2>
              <div className="space-y-2">
                <div className="flex justify-between text-sm py-1.5 border-b">
                  <span className="text-muted-foreground">Total Pengguna</span>
                  <span className="font-bold">{profiles.length}</span>
                </div>
                <div className="flex justify-between text-sm py-1.5 border-b">
                  <span className="text-muted-foreground">Total Admin</span>
                  <span className="font-bold text-red-500">{profiles.filter(p => p.role === 'admin').length}</span>
                </div>
                <div className="flex justify-between text-sm py-1.5 border-b">
                  <span className="text-muted-foreground">Total Guru</span>
                  <span className="font-bold text-primary">{profiles.filter(p => p.role === 'teacher').length}</span>
                </div>
                <div className="flex justify-between text-sm py-1.5">
                  <span className="text-muted-foreground">Total Murid</span>
                  <span className="font-bold text-yellow-500">{profiles.filter(p => p.role === 'student').length}</span>
                </div>
              </div>

              {isMock && (
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="w-full mt-4 flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground py-2.5 text-xs font-semibold shadow hover:bg-primary/95 transition"
                >
                  <UserPlus className="h-4 w-4" />
                  Tambah Pengguna Demo
                </button>
              )}
            </div>

            {/* Create Mock User Form Modal Inline */}
            {isMock && showAddForm && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-panel p-6 rounded-3xl shadow-md border-primary/20"
              >
                <h3 className="text-sm font-bold text-foreground mb-4">Pengguna Demonstrasi Baru</h3>
                <form onSubmit={handleCreateMockUser} className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Nama Lengkap</label>
                    <input
                      type="text"
                      value={newFullName}
                      onChange={e => setNewFullName(e.target.value)}
                      placeholder="Contoh: Ani"
                      className="w-full rounded-xl border border-border bg-background/50 px-3 py-2 text-xs outline-none focus:border-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Email</label>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                      placeholder="ani@sinesa.com"
                      className="w-full rounded-xl border border-border bg-background/50 px-3 py-2 text-xs outline-none focus:border-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Peran</label>
                    <select
                      value={newRole}
                      onChange={e => setNewRole(e.target.value as UserRole)}
                      className="w-full rounded-xl border border-border bg-background/50 px-3 py-2 text-xs outline-none focus:border-primary"
                    >
                      <option value="student">Murid</option>
                      <option value="teacher">Guru</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-green-600 text-white py-2 text-xs font-semibold hover:bg-green-700 transition"
                  >
                    Simpan Pengguna
                  </button>
                </form>
              </motion.div>
            )}
          </div>

          {/* User List Panel */}
          <div className="lg:col-span-3 space-y-4">
            <div className="glass-panel p-4 rounded-3xl shadow-sm flex items-center gap-3">
              <Search className="h-5 w-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Cari pengguna berdasarkan nama atau peran..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-transparent text-sm outline-none border-none placeholder-muted-foreground"
              />
            </div>

            <div className="glass-panel rounded-3xl shadow-sm overflow-hidden border">
              {loading ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Memuat daftar pengguna SINESA...</div>
              ) : filteredProfiles.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Tidak ada pengguna yang cocok.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-muted/40 border-b border-border text-xs text-muted-foreground uppercase font-bold">
                        <th className="px-6 py-4">Foto Profil</th>
                        <th className="px-6 py-4">Nama Pengguna</th>
                        <th className="px-6 py-4">Status / Peran</th>
                        <th className="px-6 py-4 text-right">Aksi Kelola</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-sm">
                      {filteredProfiles.map((p, idx) => (
                        <motion.tr
                          key={p.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: idx * 0.03 }}
                          className="hover:bg-muted/10 transition"
                        >
                          <td className="px-6 py-4">
                            <img
                              src={getSafeMediaUrl(p.avatar_url) || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(p.full_name)}`}
                              alt={p.full_name}
                              className="h-10 w-10 rounded-full border bg-background"
                            />
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-bold text-foreground block">{p.full_name}</span>
                            <span className="text-xs text-muted-foreground block">{p.id}</span>
                          </td>
                          <td className="px-6 py-4">
                            <select
                              value={p.role}
                              onChange={e => handleRoleChange(p.id, e.target.value as UserRole)}
                              className={`rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-bold ${
                                p.role === 'admin' ? 'text-red-500' : p.role === 'teacher' ? 'text-primary' : 'text-yellow-500'
                              }`}
                            >
                              <option value="student">Murid</option>
                              <option value="teacher">Guru</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleDeleteProfile(p.id)}
                              className="p-2 rounded-xl text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 transition-all"
                              title="Hapus Profil"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
