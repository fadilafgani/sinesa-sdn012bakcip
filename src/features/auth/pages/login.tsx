import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { AuthService } from '@/features/auth/services/auth.service';
import { useSettingsStore } from '@/features/settings';
import { apiClient } from '@/core/api-client';
import type { UserRole } from '@/types';
import { motion } from 'framer-motion';
import { 
  KeyRound, Mail, User, Shield, GraduationCap, School, 
  AlertCircle, CheckCircle, Download, X, Hash, Gamepad2, Lock 
} from 'lucide-react';
import { ThemeToggle } from '@/shared/components/theme-toggle';
import { usePlayStore } from '@/features/session/stores/play-store';
import { useUiStore } from '@/shared/stores/ui-store';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { isMock, loginMock, user, profile } = useAuthStore();
  const settings = useSettingsStore(s => s.settings);

  const [authTab, setAuthTab] = useState<'login' | 'register' | 'guest'>('login');
  const isSignUp = authTab === 'register';
  const setIsSignUp = (val: boolean) => setAuthTab(val ? 'register' : 'login');

  const [role, setRole] = useState<UserRole>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [allowGuestParticipants, setAllowGuestParticipants] = useState(true);

  // Guest join states (UAT-033)
  const [guestPin, setGuestPin] = useState('');
  const [guestDisplayName, setGuestDisplayName] = useState('');
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);

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

  // Load system settings and synchronize access settings
  useEffect(() => {
    useSettingsStore.getState().fetchSettings();
  }, [isMock]);

  useEffect(() => {
    setRegistrationEnabled(settings.registration_enabled !== 'false' && settings.allow_student_registration !== 'false');
    setAllowGuestParticipants(settings.allow_guest_participants !== 'false');
  }, [settings.registration_enabled, settings.allow_student_registration, settings.allow_guest_participants]);

  // Pre-fill credentials if provided in query params (useful for automated testing)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qEmail = params.get('email');
    const qPass = params.get('password');
    const qRole = params.get('role');
    const qTab = params.get('tab');
    const qPin = params.get('pin');
    const qName = params.get('name');

    if (qEmail) setEmail(qEmail);
    if (qPass) setPassword(qPass);
    if (qRole) setRole(qRole as UserRole);

    if (qTab === 'guest' || params.get('guest') === 'true' || qPin) {
      setAuthTab('guest');
      if (qPin) setGuestPin(qPin);
      if (qName) setGuestDisplayName(qName);
    } else if (qTab === 'register' || params.get('signup') === 'true') {
      setAuthTab('register');
    }

    if (params.get('auto_submit') === 'true' && qEmail && qPass) {
      setTimeout(() => {
        const form = document.querySelector('form');
        if (form) form.requestSubmit();
      }, 300);
    }
  }, []);

  // Guest join submit handler (UAT-033)
  const handleGuestJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuestError(null);

    if (!allowGuestParticipants) {
      setGuestError('Partisipan tamu dinonaktifkan oleh Administrator. Silakan masuk menggunakan akun murid.');
      return;
    }

    const cleanPin = guestPin.trim();
    const cleanName = guestDisplayName.trim();

    if (!cleanPin) {
      setGuestError('Kode PIN kuis wajib diisi.');
      return;
    }
    if (cleanPin.length < 5) {
      setGuestError('Kode PIN kuis minimal 5-6 karakter.');
      return;
    }
    if (!cleanName) {
      setGuestError('Nama tampilan wajib diisi.');
      return;
    }
    if (cleanName.length < 2) {
      setGuestError('Nama tampilan minimal 2 karakter.');
      return;
    }

    setGuestLoading(true);
    try {
      const joinSession = usePlayStore.getState().joinSession;
      const success = await joinSession(cleanPin, cleanName);
      if (success) {
        navigate(`/student/play-session?pin=${encodeURIComponent(cleanPin)}&name=${encodeURIComponent(cleanName)}`);
      } else {
        const uiErr = useUiStore.getState().error;
        setGuestError(uiErr || 'Kuis tidak ditemukan atau sesi belum dimulai oleh guru.');
      }
    } catch (err: any) {
      setGuestError(err.message || 'Gagal bergabung ke room kuis.');
    } finally {
      setGuestLoading(false);
    }
  };

  // Automatically redirect if already logged in with an active access token
  useEffect(() => {
    if (user && profile && (isMock || apiClient.getAccessToken())) {
      if (profile.role === 'admin') {
        navigate('/admin');
      } else if (profile.role === 'teacher') {
        navigate('/teacher/dashboard');
      } else {
        navigate('/student/dashboard');
      }
    }
  }, [user, profile, isMock, navigate]);

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

    // Online Auth Flow
    try {
      if (isSignUp) {
        const signUpRes = await AuthService.signUp(email, password, role, fullName);
        if (!signUpRes.success) throw signUpRes.error;
        const data = signUpRes.data;

        if (data.user) {
          if (data.session) {
            // Pengguna langsung terautentikasi dan sesi aktif
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
                <p className="font-bold text-xs text-foreground">Pasang Aplikasi {settings.app_name || 'SINESA'}</p>
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
            className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-white text-primary-foreground shadow-lg shadow-primary/10 mb-4 p-2 overflow-hidden border border-border/50"
          >
            <img 
              data-testid="brand-logo"
              src={settings.app_logo || '/logo-sdn012.png'} 
              alt={`Logo ${settings.school_name || 'Sekolah'}`}
              className="h-16 w-16 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/logo-sdn012.png';
              }}
            />
          </motion.div>
          <h1 data-testid="brand-app-name" className="text-3xl font-extrabold tracking-tight text-foreground">
            {settings.app_name || 'SINESA'}
          </h1>
          <div className="mt-1.5 text-sm text-muted-foreground font-medium flex flex-col items-center">
            <span>{settings.app_title || 'Sistem Nilai Dan Evaluasi Siswa Aktif'}</span>
            <span data-testid="brand-school-name" className="text-xs font-bold text-primary mt-1">
              {settings.school_name || 'SDN 012 Babakan Ciparay'}
              {settings.school_npsn ? (
                <span data-testid="brand-school-npsn" className="ml-1 text-muted-foreground font-normal">
                  (NPSN: {settings.school_npsn})
                </span>
              ) : null}
            </span>
            {settings.school_address && (
              <span data-testid="brand-school-address" className="text-[11px] text-muted-foreground mt-0.5 text-center max-w-sm">
                {settings.school_address}
              </span>
            )}
          </div>
        </div>

        {/* Auth Box glass container */}
        <div className="glass-panel rounded-3xl p-8 shadow-xl">
          {/* Tab Switcher: Masuk | Daftar | Tamu */}
          <div className="mb-6 grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-muted/50 border border-border">
            <button
              type="button"
              id="tab-login-btn"
              onClick={() => { setAuthTab('login'); setError(null); setGuestError(null); }}
              className={`py-2 text-xs font-bold rounded-xl transition-all ${
                authTab === 'login'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              id="tab-register-btn"
              onClick={() => { setAuthTab('register'); setError(null); setGuestError(null); }}
              className={`py-2 text-xs font-bold rounded-xl transition-all ${
                authTab === 'register'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Daftar
            </button>
            <button
              type="button"
              id="tab-guest-btn"
              onClick={() => { setAuthTab('guest'); setError(null); setGuestError(null); }}
              className={`py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                authTab === 'guest'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-primary hover:text-primary/90'
              }`}
            >
              <Gamepad2 className="h-3.5 w-3.5" />
              Tamu
            </button>
          </div>

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

          {authTab === 'guest' ? (
            /* GUEST FORM (UAT-033) */
            !allowGuestParticipants ? (
              <div className="text-center py-4 space-y-4">
                <div className="h-12 w-12 rounded-full bg-destructive/15 text-destructive mx-auto flex items-center justify-center">
                  <Lock className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-destructive">Partisipan Tamu Dinonaktifkan</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Administrator telah menonaktifkan fitur partisipan tamu. Silakan masuk menggunakan akun murid Anda untuk mengerjakan kuis.
                  </p>
                </div>
                <button
                  type="button"
                  id="guest-disabled-back-btn"
                  onClick={() => setAuthTab('login')}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-2xl text-xs font-bold shadow-md hover:bg-primary/90 transition-all"
                >
                  Kembali ke Form Masuk
                </button>
              </div>
            ) : (
              <div>
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-foreground">Gabung Kuis sebagai Tamu</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Masukkan PIN Kuis dari guru dan nama Anda tanpa perlu registrasi akun
                  </p>
                </div>

                {guestError && (
                  <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive font-medium flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{guestError}</span>
                  </div>
                )}

                <form onSubmit={handleGuestJoin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      PIN Kuis (6 Digit)
                    </label>
                    <div className="relative">
                      <Hash className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        id="guest-pin-input"
                        type="text"
                        value={guestPin}
                        onChange={(e) => setGuestPin(e.target.value.toUpperCase())}
                        placeholder="Contoh: 123456"
                        maxLength={10}
                        className="w-full rounded-2xl border border-border bg-background/50 pl-10 pr-4 py-3 text-sm font-mono tracking-widest outline-none transition duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20 font-bold"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      Nama Tampilan Anda
                    </label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        id="guest-name-input"
                        type="text"
                        value={guestDisplayName}
                        onChange={(e) => setGuestDisplayName(e.target.value)}
                        placeholder="Contoh: Budi Santoso"
                        maxLength={50}
                        className="w-full rounded-2xl border border-border bg-background/50 pl-10 pr-4 py-3 text-sm outline-none transition duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20"
                        required
                      />
                    </div>
                  </div>

                  <button
                    id="guest-submit-button"
                    type="submit"
                    disabled={guestLoading}
                    className="w-full mt-6 rounded-2xl bg-primary text-primary-foreground py-3 text-sm font-semibold shadow-lg shadow-primary/25 transition duration-200 hover:bg-primary/95 disabled:opacity-50"
                  >
                    {guestLoading ? 'Menghubungkan...' : 'Gabung ke Room Kuis'}
                  </button>
                </form>

                <div className="mt-5 text-center text-xs">
                  <button
                    type="button"
                    onClick={() => setAuthTab('login')}
                    className="text-primary font-semibold hover:underline bg-transparent border-none cursor-pointer"
                  >
                    Sudah memiliki akun murid? Masuk di sini
                  </button>
                </div>
              </div>
            )
          ) : (
            /* LOGIN / REGISTER FORM */
            <>
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
                      id="login-email"
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
                      id="login-password"
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
                      id="role-btn-teacher"
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
                  id="login-submit-button"
                  type="submit"
                  disabled={loading}
                  className="w-full mt-6 rounded-2xl bg-primary text-primary-foreground py-3 text-sm font-semibold shadow-lg shadow-primary/25 transition duration-200 hover:bg-primary/95 disabled:opacity-50"
                >
                  {loading ? 'Memproses...' : isSignUp ? 'Registrasi Akun' : 'Masuk Sekarang'}
                </button>
              </form>

              {/* Direct button to join as guest if guest is enabled */}
              {allowGuestParticipants && !isSignUp && (
                <div className="mt-4 pt-4 border-t border-border/50 text-center">
                  <button
                    type="button"
                    id="btn-guest-join-direct"
                    onClick={() => { setAuthTab('guest'); setError(null); }}
                    className="w-full py-2.5 rounded-2xl border border-primary/30 bg-primary/5 text-primary text-xs font-bold hover:bg-primary/10 transition-all flex items-center justify-center gap-2 active:scale-95"
                  >
                    <Gamepad2 className="h-4 w-4" />
                    Gabung sebagai Tamu (PIN Kuis)
                  </button>
                </div>
              )}

              {/* Swap Register <-> Login */}
              <div className="mt-5 text-center text-xs">
                {isSignUp ? (
                  <button
                    onClick={() => setAuthTab('login')}
                    className="text-primary font-semibold hover:underline bg-transparent border-none cursor-pointer"
                  >
                    Sudah memiliki akun? Masuk
                  </button>
                ) : registrationEnabled ? (
                  <button
                    onClick={() => setAuthTab('register')}
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
            </>
          )}
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-muted-foreground font-semibold">
          Untuk SDN 012 Babakan Ciparay dari Telkom University
        </p>
      </motion.div>
    </div>
  );
};
