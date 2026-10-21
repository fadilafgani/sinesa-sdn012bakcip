import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { ProfileService } from '@/features/profile/services/profile.service';
import { UploadService } from '@/shared/services/upload.service';
import { ThemeToggle } from '@/shared/components/theme-toggle';
import { getSafeMediaUrl } from '@/shared/utils/media';
import { showSuccess, showError } from '@/shared/utils/swal';
import { 
  ArrowLeft, 
  User, 
  Mail, 
  AtSign, 
  Lock, 
  Eye, 
  EyeOff, 
  Save, 
  X, 
  Camera, 
  RefreshCw, 
  ShieldCheck, 
  Calendar, 
  CheckCircle2, 
  AlertCircle,
  GraduationCap
} from 'lucide-react';
import { motion } from 'framer-motion';

export const StudentProfile: React.FC = () => {
  const navigate = useNavigate();
  const { profile, setProfile, isMock } = useAuthStore();

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Sync state whenever profile in store updates
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setUsername(profile.username || '');
      setEmail(profile.email || '');
      setAvatarUrl(profile.avatar_url || '');
    }
  }, [profile]);

  // Format joined date
  const joinedDateFormatted = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '-';

  // Computed avatar display
  const effectiveAvatar =
    getSafeMediaUrl(avatarUrl) ||
    `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(fullName || profile?.full_name || 'student')}`;

  const handleRandomAvatar = () => {
    // Generate a fresh Dicebear avatar using timestamp seed
    const randomSeed = `${fullName || 'student'}_${Date.now()}`;
    const newAvatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(randomSeed)}`;
    setAvatarUrl(newAvatar);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showError('Gagal', 'File yang diunggah harus berupa gambar.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showError('Gagal', 'Ukuran gambar maksimal adalah 2MB.');
      return;
    }

    setUploadingAvatar(true);
    try {
      const res = await UploadService.uploadImage(file, 'profiles');
      if (res.success && res.data?.url) {
        setAvatarUrl(res.data.url);
      } else {
        showError('Gagal', (typeof res.error === 'string' ? res.error : res.error?.message) || 'Gagal mengunggah foto profil.');
      }
    } catch (err: any) {
      showError('Gagal', err?.message || 'Terjadi kesalahan saat mengunggah foto.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleCancel = () => {
    // Revert form fields to current store profile state
    if (profile) {
      setFullName(profile.full_name || '');
      setUsername(profile.username || '');
      setEmail(profile.email || '');
      setAvatarUrl(profile.avatar_url || '');
      setNewPassword('');
      setConfirmPassword('');
      setFormError(null);
      setFormSuccess(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    // Validation
    const trimmedName = fullName.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setFormError('Nama lengkap minimal harus terdiri dari 2 karakter.');
      return;
    }

    const trimmedUsername = username.trim();
    if (trimmedUsername) {
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(trimmedUsername)) {
        setFormError('Nama pengguna harus 3-30 karakter dan hanya boleh berisi huruf, angka, atau garis bawah (_).');
        return;
      }
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setFormError('Format alamat email tidak valid.');
      return;
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        setFormError('Kata sandi baru minimal harus 6 karakter.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setFormError('Konfirmasi kata sandi tidak cocok.');
        return;
      }
    }

    if (!profile?.id) {
      setFormError('Data sesi profil tidak ditemukan. Silakan login kembali.');
      return;
    }

    setSaving(true);

    try {
      if (isMock) {
        // ponytail: Mock mode persistence shortcut via localStorage and Zustand
        const updatedProfile = {
          ...profile,
          full_name: trimmedName,
          username: trimmedUsername || null,
          email: trimmedEmail,
          avatar_url: avatarUrl || null,
        };

        localStorage.setItem('sinesa_mock_profile', JSON.stringify(updatedProfile));
        setProfile(updatedProfile);

        // Also sync mock user metadata
        const user = useAuthStore.getState().user;
        if (user) {
          const updatedUser = {
            ...user,
            email: trimmedEmail,
            user_metadata: {
              ...(user.user_metadata || {}),
              full_name: trimmedName,
              username: trimmedUsername || null,
              avatar_url: avatarUrl || null,
            },
          };
          localStorage.setItem('sinesa_mock_user', JSON.stringify(updatedUser));
          useAuthStore.getState().setUserAndProfile(updatedUser, updatedProfile);
        }

        setNewPassword('');
        setConfirmPassword('');
        setFormSuccess('Profil berhasil disimpan!');
        showSuccess('Berhasil!', 'Profil Anda berhasil diperbarui.');
        return;
      }

      // Online backend flow
      const payload: any = {
        full_name: trimmedName,
        username: trimmedUsername || null,
        email: trimmedEmail,
        avatar_url: avatarUrl || null,
      };

      if (newPassword) {
        payload.password = newPassword;
      }

      const res = await ProfileService.updateProfile(profile.id, payload);

      if (!res.success || !res.data) {
        const errorMsg =
          typeof res.error === 'string'
            ? res.error
            : res.error?.message || 'Gagal menyimpan perubahan profil.';
        setFormError(errorMsg);
        showError('Gagal', errorMsg);
        return;
      }

      const updated = res.data;
      setProfile(updated);

      // Sync active user store
      const user = useAuthStore.getState().user;
      if (user) {
        useAuthStore.getState().setUserAndProfile(
          {
            ...user,
            email: updated.email || user.email,
            user_metadata: {
              ...(user.user_metadata || {}),
              full_name: updated.full_name,
              username: updated.username,
              avatar_url: updated.avatar_url,
            },
          },
          updated
        );
      }

      setNewPassword('');
      setConfirmPassword('');
      setFormSuccess('Profil berhasil disimpan dan diperbarui!');
      showSuccess('Berhasil!', 'Perubahan profil Anda berhasil disimpan.');
    } catch (err: any) {
      console.error('Update profile error:', err);
      const msg = err?.message || 'Terjadi kesalahan internal server.';
      setFormError(msg);
      showError('Gagal', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-mesh p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Navbar */}
        <div className="flex items-center justify-between pb-4 border-b border-border/50">
          <button
            onClick={() => navigate('/student/dashboard')}
            className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-card hover:border-border transition active:scale-95 shadow-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Kembali ke Dashboard</span>
          </button>

          <div className="flex items-center gap-3">
            <ThemeToggle />
          </div>
        </div>

        {/* Profile Card Header */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-6 md:p-8 rounded-3xl shadow-lg border-primary/20 flex flex-col md:flex-row items-center gap-6"
        >
          {/* Avatar with upload overlay */}
          <div className="relative group shrink-0">
            <div className="h-28 w-28 md:h-32 md:w-32 rounded-3xl overflow-hidden border-4 border-primary/20 bg-primary/10 shadow-md">
              <img
                src={effectiveAvatar}
                alt={fullName || 'Avatar Siswa'}
                className="h-full w-full object-cover"
              />
            </div>
            {uploadingAvatar && (
              <div className="absolute inset-0 rounded-3xl bg-black/60 flex items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
            <label
              htmlFor="avatar-upload"
              className="absolute -bottom-2 -right-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md hover:bg-primary/90 transition active:scale-95"
              title="Unggah Foto Profil"
            >
              <Camera className="h-4 w-4" />
              <input
                id="avatar-upload"
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
                disabled={uploadingAvatar}
              />
            </label>
          </div>

          {/* User Bio & Badges */}
          <div className="space-y-2 text-center md:text-left flex-1">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
              <h1 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight">
                {profile?.full_name || 'Siswa SINESA'}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-xl bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                <GraduationCap className="h-3.5 w-3.5" />
                Siswa
              </span>
              <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                Aktif
              </span>
            </div>

            <p className="text-sm font-semibold text-muted-foreground flex items-center justify-center md:justify-start gap-2">
              <span>{profile?.email || '-'}</span>
              {profile?.username && (
                <>
                  <span>•</span>
                  <span className="text-primary font-mono">@{profile.username}</span>
                </>
              )}
            </p>

            <div className="pt-2 flex flex-wrap items-center justify-center md:justify-start gap-4 text-xs font-semibold text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                Bergabung sejak {joinedDateFormatted}
              </span>
              <span className="font-mono text-[11px] opacity-75">
                ID: {profile?.id?.substring(0, 8)}...
              </span>
            </div>
          </div>

          {/* Quick random avatar generator button */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={handleRandomAvatar}
              className="flex items-center gap-2 rounded-2xl border border-border/80 bg-background/50 hover:bg-background px-4 py-2 text-xs font-bold text-foreground transition active:scale-95 shadow-sm"
              title="Ganti avatar acak bergaya kartun"
            >
              <RefreshCw className="h-3.5 w-3.5 text-primary" />
              <span>Acak Avatar</span>
            </button>
          </div>
        </motion.div>

        {/* Profile Edit Form */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-panel p-6 md:p-8 rounded-3xl shadow-lg border-border/60"
        >
          <div className="mb-6">
            <h2 className="text-lg font-bold text-foreground">Edit Informasi Profil</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Perbarui nama lengkap, nama pengguna, email, atau ubah kata sandi akun Anda.
            </p>
          </div>

          {formError && (
            <div className="mb-6 rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm font-semibold text-destructive flex items-center gap-2.5">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {formSuccess && (
            <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-2.5">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span>{formSuccess}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Field: Nama Lengkap */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Nama Lengkap <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Masukkan nama lengkap Anda..."
                  required
                  className="w-full rounded-2xl border border-border bg-background/50 pl-10 pr-4 py-3 text-sm font-medium outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            {/* Field: Username & Email Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Nama Pengguna (Username)
                </label>
                <div className="relative">
                  <AtSign className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="contoh: budi_santoso"
                    className="w-full rounded-2xl border border-border bg-background/50 pl-10 pr-4 py-3 text-sm font-mono outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">Huruf kecil, angka, dan garis bawah (_).</p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Alamat Email <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@school.sch.id"
                    required
                    className="w-full rounded-2xl border border-border bg-background/50 pl-10 pr-4 py-3 text-sm font-medium outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            </div>

            {/* Security Section: Password */}
            <div className="pt-4 border-t border-border/40">
              <h3 className="text-sm font-bold text-foreground mb-1">Ganti Kata Sandi</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Kosongkan bidang di bawah jika Anda tidak ingin mengubah kata sandi akun.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Kata Sandi Baru
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimal 6 karakter..."
                      className="w-full rounded-2xl border border-border bg-background/50 pl-10 pr-10 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Konfirmasi Kata Sandi Baru
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Ulangi kata sandi baru..."
                      className="w-full rounded-2xl border border-border bg-background/50 pl-10 pr-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons: Simpan & Batal */}
            <div className="pt-6 border-t border-border/40 flex flex-col sm:flex-row items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-2xl border border-border bg-card/60 px-6 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-card transition active:scale-95 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                <span>Batal</span>
              </button>

              <button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground px-8 py-3 text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/95 transition active:scale-95 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span>Simpan Perubahan</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
};
