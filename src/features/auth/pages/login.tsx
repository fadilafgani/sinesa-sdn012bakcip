import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { AuthService } from '@/features/auth/services/auth.service';
import { SettingsService } from '@/features/settings/services/settings.service';
import type { UserRole } from '@/types';
import { motion } from 'framer-motion';
import { KeyRound, Mail, User, Shield, GraduationCap, School, AlertCircle, CheckCircle, Download, X } from 'lucide-react';
import { ThemeToggle } from '@/shared/components/theme-toggle';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { isMock, loginMock, user, profile } = useAuthStore();

  const [isSignUp, setIsSignUp] = useState(false);
  const [role, setRole] = useState<UserRole>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);

  // PWA installation states
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);

  useEffect(() => {
    // Check if already in standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    if (isStandalone) return;

    // Detect iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOSDevice(isIOS);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // If iOS and not standalone, show help instructions
    if (isIOS) {
      setShowInstallBanner(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBanner(false);
    }
    setDeferredPrompt(null);
  };

  // Check if self-registration is enabled from DB or mock settings
  useEffect(() => {
    const checkRegistrationSetting = async () => {
      if (isMock) {
        try {
          const savedSettings = JSON.parse(localStorage.getItem('mock_system_settings') || '{}');
          if (savedSettings.registration_enabled === 'false') {
            setRegistrationEnabled(false);
          } else {
            setRegistrationEnabled(true);
          }
        } catch (e) {
          setRegistrationEnabled(true);
        }
      } else {
        try {
          const res = await SettingsService.getSystemSettings();
          if (res.success && res.data) {
            const regSetting = res.data.find(s => s.key === 'registration_enabled');
            setRegistrationEnabled(!regSetting || regSetting.value !== 'false');
          } else {
            setRegistrationEnabled(true);
          }
        } catch (e) {
          setRegistrationEnabled(true);
        }
      }
    };
    checkRegistrationSetting();
  }, [isMock]);

  // Automatically redirect if already logged in
  useEffect(() => {
    if (user && profile) {
      if (profile.role === 'admin') {
        navigate('/admin');
      } else if (profile.role === 'teacher') {
        navigate('/teacher/dashboard');
      } else {
        navigate('/student/dashboard');
      }
    }
  }, [user, profile, navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    if (isSignUp && !registrationEnabled) {
      setError('Pendaftaran mandiri dinonaktifkan oleh Administrator.');
      setLoading(false);
      return;
    }

    if (!email || !password || (isSignUp && !fullName)) {
      setError('Harap lengkapi semua bidang.');
      setLoading(false);
      return;
    }

    if (isMock) {
      // Mock mode auth handler
      setTimeout(() => {
        if (isSignUp) {
          // Register mock user
          const mockDb = JSON.parse(localStorage.getItem('mock_profiles') || '[]');
          if (mockDb.some((u: any) => u.email === email)) {
            setError('Email sudah terdaftar (mode mock).');
            setLoading(false);
            return;
          }
          mockDb.push({ email, role, fullName });
          localStorage.setItem('mock_profiles', JSON.stringify(mockDb));
          loginMock(email, role, fullName);
        } else {
          // Login mock user
          const mockDb = JSON.parse(localStorage.getItem('mock_profiles') || '[]');
          const existing = mockDb.find((u: any) => u.email === email);
          
          if (email === 'admin@sinesa.com') {
            loginMock(email, 'admin', 'Administrator Sinesa');
          } else if (email === 'guru@sinesa.com') {
            loginMock(email, 'teacher', 'Ibu Guru Pertiwi');
          } else if (email === 'murid@sinesa.com') {
            loginMock(email, 'student', 'Budi Santoso');
          } else if (existing) {
            loginMock(email, existing.role, existing.fullName);
          } else {
            // Default user fallback
            loginMock(email, role, 'Pengguna Baru Sinesa');
          }
        }
        setLoading(false);
        // Redirect to dashboard
        if (role === 'admin' || (email === 'admin@sinesa.com')) {
          navigate('/admin');
        } else if (role === 'teacher' || (email === 'guru@sinesa.com')) {
          navigate('/teacher/dashboard');
        } else {
          navigate('/student/dashboard');
        }
      }, 800);
      return;
    }

    // Supabase Online Auth Flow
    try {
      if (isSignUp) {
        const signUpRes = await AuthService.signUp(email, password, role, fullName);
        if (!signUpRes.success) throw signUpRes.error;
        const data = signUpRes.data;

        if (data.user) {
          if (data.session) {
            // Email confirmations are disabled in Supabase, meaning they are logged in immediately
            setSuccessMessage('Registrasi berhasil! Mengalihkan ke dashboard...');
            // Let the useEffect handle the redirection or navigate manually
            const userRole = role || 'student';
            setTimeout(() => {
              if (userRole === 'admin') navigate('/admin');
              else if (userRole === 'teacher') navigate('/teacher/dashboard');
              else navigate('/student/dashboard');
            }, 1000);
          } else {
            // Email confirmation is enabled
            setSuccessMessage('Registrasi berhasil! Silakan periksa email Anda untuk mengonfirmasi akun.');
            setIsSignUp(false);
          }
        }
      } else {
        const signInRes = await AuthService.signIn(email, password);
        if (!signInRes.success) throw signInRes.error;
        const data = signInRes.data;

        if (data.user) {
          // Fetch profile to route correctly
          const profileRes = await AuthService.getOrCreateProfile(data.user);
          const profile = profileRes.success ? profileRes.data : null;

          const userRole = profile?.role || 'student';
          
          if (userRole === 'admin') {
            navigate('/admin');
          } else if (userRole === 'teacher') {
            navigate('/teacher/dashboard');
          } else {
            navigate('/student/dashboard');
          }
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(err.message || 'Terjadi kesalahan otentikasi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      {/* Theme toggle positioning */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* PWA Install Banner */}
        {showInstallBanner && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground shadow-lg backdrop-blur-md"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Download className="h-5 w-5" />
              </div>
              <div>
                <p className="font-bold text-xs text-foreground">Pasang Aplikasi SINESA</p>
                <p className="text-[10px] leading-snug text-muted-foreground mt-0.5">
                  {isIOSDevice 
                    ? "Tekan tombol 'Bagikan' (Share) lalu 'Tambahkan ke Layar Utama' di Safari." 
                    : "Pasang di HP / Laptop untuk akses cepat & hemat kuota."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isIOSDevice && (
                <button
                  onClick={handleInstallClick}
                  className="shrink-0 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all active:scale-95 shadow-md shadow-primary/20"
                >
                  Pasang
                </button>
              )}
              <button
                onClick={() => setShowInstallBanner(false)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg hover:bg-muted-foreground/10 text-muted-foreground transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Title Brand Header */}
        <div className="mb-6 text-center">
          <motion.div 
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-white text-primary-foreground shadow-lg shadow-primary/10 mb-4 p-2"
          >
            <img 
              src="https://sekolahanak.com/wp-content/uploads/2025/03/SDN-012-Babakan-Ciparay-logo.webp" 
              alt="Logo SDN 012 Babakan Ciparay"
              className="h-16 w-16 object-contain"
            />
          </motion.div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            SINESA
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground font-medium flex flex-col items-center">
            <span>Sistem Nilai Dan Evaluasi Siswa Aktif</span>
            <span className="text-xs font-bold text-primary mt-1">SDN 012 Babakan Ciparay</span>
          </p>
        </div>

        {/* Auth Box glass container */}
        <div className="glass-panel rounded-3xl p-8 shadow-xl">
          {isMock && (
            <div className="mb-5 flex gap-2.5 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <div>
                <span className="font-semibold block mb-0.5">Mode Demonstrasi Offline Aktif</span>
                Gunakan sandi acak. Akun bawaan:
                <ul className="list-disc list-inside mt-1 font-mono text-[10px] space-y-0.5">
                  <li>Guru: guru@sinesa.com</li>
                  <li>Murid: murid@sinesa.com</li>
                  <li>Admin: admin@sinesa.com</li>
                </ul>
              </div>
            </div>
          )}

          <h2 className="text-xl font-bold mb-6 text-foreground text-center">
            {isSignUp ? 'Buat Akun Baru' : 'Masuk ke Platform'}
          </h2>

          {error && (
            <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Nama Lengkap
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Contoh: Budi Santoso"
                    className="w-full rounded-2xl border border-border bg-background/50 pl-10 pr-4 py-3 text-sm outline-none transition duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Alamat Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@school.sch.id"
                  className="w-full rounded-2xl border border-border bg-background/50 pl-10 pr-4 py-3 text-sm outline-none transition duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Kata Sandi
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-2xl border border-border bg-background/50 pl-10 pr-4 py-3 text-sm outline-none transition duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>
            </div>

            {/* Role switchers */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Peran Pengguna
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setRole('student')}
                  className={`flex flex-col items-center justify-center py-2.5 rounded-2xl border text-xs font-semibold transition-all duration-200 ${
                    role === 'student'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background/30 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <GraduationCap className="h-5 w-5 mb-1" />
                  Murid
                </button>
                <button
                  type="button"
                  onClick={() => setRole('teacher')}
                  className={`flex flex-col items-center justify-center py-2.5 rounded-2xl border text-xs font-semibold transition-all duration-200 ${
                    role === 'teacher'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background/30 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <School className="h-5 w-5 mb-1" />
                  Guru
                </button>
                <button
                  type="button"
                  onClick={() => setRole('admin')}
                  className={`flex flex-col items-center justify-center py-2.5 rounded-2xl border text-xs font-semibold transition-all duration-200 ${
                    role === 'admin'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background/30 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Shield className="h-5 w-5 mb-1" />
                  Admin
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-6 rounded-2xl bg-primary text-primary-foreground py-3 text-sm font-semibold shadow-lg shadow-primary/25 transition duration-200 hover:bg-primary/95 disabled:opacity-50"
            >
              {loading ? 'Memproses...' : isSignUp ? 'Registrasi Akun' : 'Masuk Sekarang'}
            </button>
          </form>

          {/* Swap Register <-> Login */}
          <div className="mt-5 text-center text-xs">
            {isSignUp ? (
              <button
                onClick={() => setIsSignUp(false)}
                className="text-primary font-semibold hover:underline bg-transparent border-none cursor-pointer"
              >
                Sudah memiliki akun? Masuk
              </button>
            ) : registrationEnabled ? (
              <button
                onClick={() => setIsSignUp(true)}
                className="text-primary font-semibold hover:underline bg-transparent border-none cursor-pointer"
              >
                Belum punya akun? Daftar gratis
              </button>
            ) : (
              <span className="text-muted-foreground font-medium">
                🔒 Pendaftaran akun dinonaktifkan oleh Administrator.
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-muted-foreground font-semibold">
          Untuk SDN 012 Babakan Ciparay dari Telkom University
        </p>
      </motion.div>
    </div>
  );
};
