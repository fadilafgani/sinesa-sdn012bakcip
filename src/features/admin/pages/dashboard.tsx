import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { supabase } from '@/core/supabase';
import { createClient } from '@supabase/supabase-js';
import type { Profile, UserRole, Quiz, QuizSession, ActivityLog, UserSession, Notification } from '@/types';
import { 
  LayoutDashboard, 
  Users, 
  BookOpen, 
  FileText, 
  Settings, 
  LogOut, 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  Key, 
  Download, 
  Activity, 
  X, 
  AlertTriangle, 
  Globe,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  UploadCloud,
  Menu
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThemeToggle } from '@/shared/components/theme-toggle';
import { showConfirm, showError, showSuccess } from '@/shared/utils/swal';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { LazyImage } from '@/shared/components/lazy-image';
import { mediaStorageService } from '@/shared/services/media-storage';

export const AdminDashboard: React.FC = () => {
  const { signOut, isMock, profile: adminProfile } = useAuthStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'quizzes' | 'logs' | 'settings'>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Unified Loading States
  const [loading, setLoading] = useState(true);

  // Database Data States
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [sessions, setSessions] = useState<QuizSession[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({
    app_name: 'SINESA',
    app_logo: 'https://api.dicebear.com/7.x/shapes/svg?seed=sinesa',
    theme_color: 'blue',
    registration_enabled: 'true',
    default_anti_cheat_enabled: 'false',
    default_leaderboard_enabled: 'true',
    default_show_final_result: 'true',
  });
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [userSessions, setUserSessions] = useState<UserSession[]>([]);

  // User CRUD states
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [userForm, setUserForm] = useState({
    fullName: '',
    email: '',
    username: '',
    password: '',
    role: 'student' as UserRole,
    status: 'active' as 'active' | 'inactive',
    avatarUrl: ''
  });
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarProgress, setAvatarProgress] = useState<number | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [showPasswordText, setShowPasswordText] = useState(false);

  // Filters & Searching & Pagination
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | UserRole>('all');
  const [userPage, setUserPage] = useState(1);
  const usersPerPage = 5;

  const [quizSearch, setQuizSearch] = useState('');
  const [quizPage, setQuizPage] = useState(1);
  const quizzesPerPage = 5;

  const [logSearch, setLogSearch] = useState('');
  const [logFilter, setLogFilter] = useState('all'); // all, login, logout, quiz, admin, cheat
  const [logPage, setLogPage] = useState(1);
  const logsPerPage = 10;

  // Initialize and load data
  const loadAdminData = async () => {
    setLoading(true);
    if (isMock) {
      // 1. Load profiles
      const savedProfiles = JSON.parse(localStorage.getItem('mock_profiles') || '[]');
      const defaultProfiles: Profile[] = [
        { id: 'mock-uuid-admin', role: 'admin', full_name: 'Administrator Sinesa', username: 'admin', email: 'admin@sinesa.com', status: 'active', avatar_url: null, created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() },
        { id: 'mock-uuid-teacher', role: 'teacher', full_name: 'Ibu Guru Pertiwi', username: 'pertiwi', email: 'guru@sinesa.com', status: 'active', avatar_url: null, created_at: new Date(Date.now() - 25 * 24 * 3600 * 1000).toISOString() },
        { id: 'mock-uuid-student', role: 'student', full_name: 'Budi Santoso', username: 'budi', email: 'murid@sinesa.com', status: 'active', avatar_url: null, created_at: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString() },
        { id: 'mock-uuid-student2', role: 'student', full_name: 'Ani Lestari', username: 'ani_lestari', email: 'ani_lestari@sinesa.com', status: 'inactive', avatar_url: null, created_at: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString() },
        { id: 'mock-uuid-student3', role: 'student', full_name: 'Doni Setiawan', username: 'doni', email: 'doni@sinesa.com', status: 'active', avatar_url: null, created_at: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString() }
      ];
      const customProfiles: Profile[] = savedProfiles.map((p: any, idx: number) => ({
        id: `mock-custom-${idx}`,
        role: p.role,
        full_name: p.fullName,
        username: p.username || p.fullName.toLowerCase().replace(/\s+/g, '_'),
        email: p.email || (p.username ? p.username + '@sinesa.com' : 'user@sinesa.com'),
        status: p.status || 'active',
        avatar_url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(p.fullName)}`,
        created_at: new Date().toISOString()
      }));
      const allProfiles = [...defaultProfiles, ...customProfiles];
      setProfiles(allProfiles);

      // 2. Load quizzes
      const allQuizzes: Quiz[] = JSON.parse(localStorage.getItem('quizzes') || '[]');
      const defaultQuizzes: Quiz[] = [
        {
          id: 'quiz-1',
          teacher_id: 'mock-uuid-teacher',
          title: 'Ulangan Harian Matematika Aljabar',
          description: 'Soal latihan persamaan linier',
          opening_text: 'Kerjakan jujur',
          closing_text: 'Kuis selesai',
          pin_code: '482019',
          duration_per_question: 30,
          random_questions: false,
          random_options: false,
          thumbnail_url: null,
          quiz_mode: 'serius',
          lives_count: 3,
          show_final_result: true,
          show_leaderboard: true,
          show_correct_answer: true,
          show_answer_review: true,
          show_question_result: true,
          show_explanation: true,
          show_score_per_question: true,
          show_question_statistics: true,
          anti_cheat_enabled: false,
          fullscreen_required: false,
          auto_submit_on_violation: 3,
          status: 'active',
          created_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
          updated_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString()
        },
        {
          id: 'quiz-2',
          teacher_id: 'mock-uuid-teacher',
          title: 'Kuis IPA Sistem Pencernaan',
          description: 'Organ-organ pencernaan manusia',
          opening_text: 'Ayo mulai',
          closing_text: 'Selesai',
          pin_code: '190284',
          duration_per_question: 20,
          random_questions: true,
          random_options: true,
          thumbnail_url: null,
          quiz_mode: 'santai',
          lives_count: 5,
          show_final_result: true,
          show_leaderboard: true,
          show_correct_answer: true,
          show_answer_review: true,
          show_question_result: true,
          show_explanation: true,
          show_score_per_question: true,
          show_question_statistics: true,
          anti_cheat_enabled: true,
          fullscreen_required: true,
          auto_submit_on_violation: 3,
          status: 'inactive',
          created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
          updated_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString()
        }
      ];
      setQuizzes(allQuizzes.length > 0 ? allQuizzes.map(q => ({ ...q, status: q.status || 'active' })) : defaultQuizzes);

      // 3. Load active sessions
      const activeSessions: QuizSession[] = [];
      // Look in localStorage keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('session_')) {
          try {
            const s = JSON.parse(localStorage.getItem(key)!) as QuizSession;
            activeSessions.push(s);
          } catch(e){}
        }
      }
      const defaultSessions: QuizSession[] = [
        {
          id: 'sess-active-1',
          quiz_id: 'quiz-1',
          host_id: 'mock-uuid-teacher',
          status: 'lobby',
          current_stage: 'waiting',
          current_question_index: -1,
          question_started_at: null,
          question_expires_at: null,
          quiz_mode: 'serius',
          lives_count: 3,
          show_final_result: true,
          show_leaderboard: true,
          show_correct_answer: true,
          show_answer_review: true,
          show_question_result: true,
          show_explanation: true,
          show_score_per_question: true,
          show_question_statistics: true,
          anti_cheat_enabled: false,
          fullscreen_required: false,
          auto_submit_on_violation: 3,
          created_at: new Date().toISOString(),
          completed_at: null
        }
      ];
      setSessions(activeSessions.length > 0 ? activeSessions : defaultSessions);

      // 4. Load Activity Logs
      const defaultLogs: ActivityLog[] = [
        { id: 'log-1', user_id: 'mock-uuid-admin', action: 'LOGIN', details: 'Administrator login ke panel admin.', created_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString() },
        { id: 'log-2', user_id: 'mock-uuid-teacher', action: 'CREATE_QUIZ', details: 'Membuat kuis baru: Ulangan Harian Matematika Aljabar.', created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString() },
        { id: 'log-3', user_id: 'mock-uuid-student', action: 'LOGIN', details: 'Murid masuk ke sistem.', created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString() },
        { id: 'log-4', user_id: 'mock-uuid-student2', action: 'CHEAT_VIOLATION', details: 'Pelanggaran Fullscreen keluar terdeteksi.', created_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString() }
      ];
      const savedLogs = JSON.parse(localStorage.getItem('mock_activity_logs') || '[]');
      setLogs(savedLogs.length > 0 ? savedLogs : defaultLogs);

      // 5. Load settings
      const savedSettings = JSON.parse(localStorage.getItem('mock_system_settings') || '{}');
      if (Object.keys(savedSettings).length > 0) {
        setSettings(savedSettings);
      }

      // 6. Notifications
      const defaultNotifs: Notification[] = [
        { id: 'notif-1', title: 'Upaya Kecurangan', message: 'Siswa Ani Lestari keluar dari mode fullscreen selama Kuis IPA.', type: 'warning', is_read: false, created_at: new Date(Date.now() - 10 * 60000).toISOString() },
        { id: 'notif-2', title: 'Kuis Baru Dibuat', message: 'Ibu Guru Pertiwi merilis kuis baru: Kuis IPA Sistem Pencernaan.', type: 'success', is_read: true, created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString() }
      ];
      const savedNotifs = JSON.parse(localStorage.getItem('mock_notifications') || '[]');
      setNotifications(savedNotifs.length > 0 ? savedNotifs : defaultNotifs);

      // 7. Active sessions online (user_sessions)
      const defaultUserSessions: UserSession[] = [
        { id: 'us-1', user_id: 'mock-uuid-admin', login_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), last_activity_at: new Date().toISOString(), is_online: true, ip_address: '192.168.1.1', user_agent: 'Chrome/Windows' },
        { id: 'us-2', user_id: 'mock-uuid-teacher', login_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(), last_activity_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(), is_online: true, ip_address: '192.168.1.20', user_agent: 'Safari/MacOS' },
        { id: 'us-3', user_id: 'mock-uuid-student', login_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(), last_activity_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(), is_online: false, ip_address: '192.168.1.5', user_agent: 'Chrome/Android' }
      ];
      setUserSessions(defaultUserSessions);

      setLoading(false);
    } else {
      // Supabase flow
      try {
        // Fetch profiles
        const { data: profData } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
        if (profData) setProfiles(profData as Profile[]);

        // Fetch quizzes
        const { data: quizData } = await supabase.from('quizzes').select('*').order('created_at', { ascending: false });
        if (quizData) setQuizzes(quizData as Quiz[]);

        // Fetch sessions
        const { data: sessData } = await supabase.from('quiz_sessions').select('*').order('created_at', { ascending: false });
        if (sessData) setSessions(sessData as QuizSession[]);

        // Fetch logs
        const { data: logData } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false });
        if (logData) setLogs(logData as ActivityLog[]);

        // Fetch system settings
        const { data: settsData } = await supabase.from('system_settings').select('*');
        if (settsData && settsData.length > 0) {
          const map: Record<string, string> = {};
          settsData.forEach((s: any) => {
            map[s.key] = s.value;
          });
          setSettings(prev => ({ ...prev, ...map }));
        }

        // Fetch notifications
        const { data: notifData } = await supabase.from('notifications').select('*').order('created_at', { ascending: false });
        if (notifData) setNotifications(notifData as Notification[]);

        // Fetch user sessions
        const { data: usData } = await supabase.from('user_sessions').select('*').order('last_activity_at', { ascending: false });
        if (usData) setUserSessions(usData as UserSession[]);

      } catch (err) {
        console.error('Failed to load Supabase admin data:', err);
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadAdminData();
  }, [isMock]);

  // Realtime Simulation (Interval mock logs and joins)
  useEffect(() => {
    if (!isMock || loading) return;

    const names = ['Andi', 'Siti', 'Rian', 'Dewi', 'Putra', 'Eka', 'Lina', 'Yoga'];
    const interval = setInterval(() => {
      // Simulate random activity
      const r = Math.random();
      if (r < 0.25) {
        // Add random log
        const randomName = names[Math.floor(Math.random() * names.length)];
        const actions = [
          { action: 'LOGIN', details: `Murid ${randomName} login ke aplikasi.` },
          { action: 'SUBMIT_ANSWER', details: `Murid ${randomName} mengirimkan jawaban Soal.` },
          { action: 'JOIN_LOBBY', details: `Murid ${randomName} bergabung ke kuis PIN 482019.` }
        ];
        const chosen = actions[Math.floor(Math.random() * actions.length)];
        const newLog: ActivityLog = {
          id: `log-sim-${Date.now()}`,
          user_id: `mock-uuid-student-${Math.floor(Math.random() * 100)}`,
          action: chosen.action,
          details: chosen.details,
          created_at: new Date().toISOString()
        };
        setLogs(prev => [newLog, ...prev]);

        // Save simulated log to localStorage
        const savedLogs = JSON.parse(localStorage.getItem('mock_activity_logs') || '[]');
        localStorage.setItem('mock_activity_logs', JSON.stringify([newLog, ...savedLogs].slice(0, 100)));
      } else if (r < 0.45) {
        // Add warning notification
        const randomName = names[Math.floor(Math.random() * names.length)];
        const newNotif: Notification = {
          id: `notif-sim-${Date.now()}`,
          title: 'Deteksi Pelanggaran',
          message: `Siswa ${randomName} dideteksi meminimalkan jendela kuis!`,
          type: 'warning',
          is_read: false,
          created_at: new Date().toISOString()
        };
        setNotifications(prev => [newNotif, ...prev]);

        const savedNotifs = JSON.parse(localStorage.getItem('mock_notifications') || '[]');
        localStorage.setItem('mock_notifications', JSON.stringify([newNotif, ...savedNotifs].slice(0, 50)));
      } else if (r < 0.65) {
        // Toggle user online status
        setUserSessions(prev => {
          return prev.map(s => {
            if (s.id === 'us-3') {
              return { ...s, is_online: !s.is_online, last_activity_at: new Date().toISOString() };
            }
            return s;
          });
        });
      }
    }, 9000);

    return () => clearInterval(interval);
  }, [isMock, loading]);

  // Supabase realtime channel integration
  useEffect(() => {
    if (isMock || loading) return;

    // Subscriptions channels
    const logChannel = supabase.channel('admin-logs-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs' }, (payload) => {
        setLogs(prev => [payload.new as ActivityLog, ...prev]);
      })
      .subscribe();

    const notifChannel = supabase.channel('admin-notifs-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        setNotifications(prev => [payload.new as Notification, ...prev]);
      })
      .subscribe();

    const sessionChannel = supabase.channel('admin-sessions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quiz_sessions' }, () => {
        // Reload sessions
        supabase.from('quiz_sessions').select('*').order('created_at', { ascending: false })
          .then(({ data }) => {
            if (data) setSessions(data as QuizSession[]);
          });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(logChannel);
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(sessionChannel);
    };
  }, [isMock, loading]);

  // Log Out admin
  const handleLogout = async () => {
    const confirmRes = await showConfirm('Keluar Sistem', 'Apakah Anda yakin ingin keluar dari Panel Admin?', 'Keluar', 'Batal');
    if (!confirmRes.isConfirmed) return;
    
    // Log logout activity
    if (isMock) {
      const newLog = {
        id: `log-${Date.now()}`,
        user_id: 'mock-uuid-admin',
        action: 'LOGOUT',
        details: 'Administrator logout dari panel.',
        created_at: new Date().toISOString()
      };
      const savedLogs = JSON.parse(localStorage.getItem('mock_activity_logs') || '[]');
      localStorage.setItem('mock_activity_logs', JSON.stringify([newLog, ...savedLogs].slice(0, 100)));
    } else {
      if (adminProfile?.id) {
        supabase.from('activity_logs').insert({
          user_id: adminProfile.id,
          action: 'LOGOUT',
          details: 'Administrator logout dari panel.'
        }).then(() => {}); // ponytail: fire and forget to avoid blocking signout on network issues
      }
    }

    await signOut();
    navigate('/login');
  };

  // Helper: Trigger and Log Action
  const createLog = async (action: string, details: string) => {
    const newLog: Omit<ActivityLog, 'id' | 'created_at'> = {
      user_id: adminProfile?.id || 'mock-uuid-admin',
      action,
      details
    };
    if (isMock) {
      const mockLog: ActivityLog = {
        ...newLog,
        id: `log-crud-${Date.now()}`,
        created_at: new Date().toISOString()
      };
      setLogs(prev => [mockLog, ...prev]);
      const savedLogs = JSON.parse(localStorage.getItem('mock_activity_logs') || '[]');
      localStorage.setItem('mock_activity_logs', JSON.stringify([mockLog, ...savedLogs].slice(0, 100)));
    } else {
      try {
        await supabase.from('activity_logs').insert(newLog);
      } catch(e){}
    }
  };

  // User CRUD Operations
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showError('Gagal', 'Format berkas harus berupa gambar (PNG, JPG, JPEG, WEBP).');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showError('Gagal', 'Ukuran gambar maksimal adalah 2 MB.');
      return;
    }

    setAvatarUploading(true);
    setAvatarProgress(0);

    try {
      const result = await mediaStorageService.replace(file, userForm.avatarUrl || '', {
        type: 'profiles',
        onProgress: (p) => setAvatarProgress(p)
      });

      if (!result.success) {
        throw new Error(result.message || 'Gagal mengunggah avatar.');
      }

      setUserForm(prev => ({ ...prev, avatarUrl: result.url }));
    } catch (err: any) {
      console.error('Avatar upload error:', err);
      showError('Gagal', `Gagal mengunggah foto profil: ${err.message}`);
    } finally {
      setAvatarUploading(false);
      setAvatarProgress(null);
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.fullName || !userForm.email || !userForm.username) {
      showError('Gagal', 'Harap isi semua kolom wajib!');
      return;
    }
    if (!selectedUser && !userForm.password) {
      showError('Gagal', 'Harap masukkan kata sandi untuk pengguna baru!');
      return;
    }

    if (isMock) {
      if (selectedUser) {
        // Edit User
        const updated = profiles.map(p => {
          if (p.id === selectedUser.id) {
            return {
              ...p,
              full_name: userForm.fullName,
              username: userForm.username,
              role: userForm.role,
              status: userForm.status,
              email: userForm.email,
              avatar_url: userForm.avatarUrl || p.avatar_url
            };
          }
          return p;
        });
        setProfiles(updated);
        
        // Update mock_profiles storage
        const customProfs = updated.filter(p => p.id.startsWith('mock-custom-')).map(p => ({
          fullName: p.full_name,
          email: p.email || (p.username ? p.username + '@sinesa.com' : 'user@sinesa.com'),
          username: p.username,
          role: p.role,
          status: p.status,
          avatarUrl: p.avatar_url
        }));
        localStorage.setItem('mock_profiles', JSON.stringify(customProfs));

        createLog('EDIT_USER', `Mengedit profil pengguna: ${userForm.fullName} (${userForm.role})`);
        showSuccess('Berhasil', 'Data pengguna berhasil diperbarui!');
      } else {
        // Add User
        const newProf: Profile = {
          id: `mock-custom-${Date.now()}`,
          full_name: userForm.fullName,
          username: userForm.username,
          role: userForm.role,
          status: userForm.status,
          email: userForm.email,
          avatar_url: userForm.avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(userForm.fullName)}`,
          created_at: new Date().toISOString()
        };
        setProfiles(prev => [newProf, ...prev]);

        // Save custom profiles
        const customProfs = JSON.parse(localStorage.getItem('mock_profiles') || '[]');
        customProfs.push({
          fullName: userForm.fullName,
          email: userForm.email,
          username: userForm.username,
          role: userForm.role,
          status: userForm.status,
          avatarUrl: userForm.avatarUrl
        });
        localStorage.setItem('mock_profiles', JSON.stringify(customProfs));

        createLog('ADD_USER', `Menambahkan pengguna baru: ${userForm.fullName} (${userForm.role})`);
        showSuccess('Berhasil', 'Pengguna baru berhasil ditambahkan!');
      }
      setShowAddUserModal(false);
      setShowEditUserModal(false);
      return;
    }

    // Supabase Online CRUD logic (RPC or direct signup if permitted)
    try {
      if (selectedUser) {
        // Edit profile details (including email directly to profiles table)
        const { error } = await supabase
          .from('profiles')
          .update({
            full_name: userForm.fullName,
            username: userForm.username,
            role: userForm.role,
            status: userForm.status,
            email: userForm.email,
            avatar_url: userForm.avatarUrl || null
          })
          .eq('id', selectedUser.id);
        
        if (error) throw error;
        setProfiles(profiles.map(p => p.id === selectedUser.id ? { ...p, full_name: userForm.fullName, username: userForm.username, role: userForm.role, status: userForm.status, email: userForm.email, avatar_url: userForm.avatarUrl || p.avatar_url } : p));
        createLog('EDIT_USER', `Mengedit profil pengguna online: ${userForm.fullName} (${selectedUser.id})`);
        showSuccess('Berhasil', 'Data pengguna online diperbarui!');
      } else {
        // In online flow, we sign up the user through a temporary Supabase client to avoid logging out the current admin
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy';
        const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false }
        });

        // 1. Sign up the user
        const { data: signUpData, error: signUpErr } = await tempClient.auth.signUp({
          email: userForm.email,
          password: userForm.password,
          options: {
            data: {
              role: userForm.role,
              full_name: userForm.fullName,
            }
          }
        });

        if (signUpErr) throw signUpErr;
        if (!signUpData.user) throw new Error('Gagal membuat user di auth database.');

        // 2. Upsert profile (to bypass the FK constraint and insert status, username, etc.)
        const newUid = signUpData.user.id;
        const { error: profErr } = await supabase
          .from('profiles')
          .upsert({
            id: newUid,
            full_name: userForm.fullName,
            username: userForm.username,
            role: userForm.role,
            status: userForm.status,
            email: userForm.email,
            avatar_url: userForm.avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(userForm.fullName)}`
          });
        
        if (profErr) throw profErr;

        setProfiles(prev => [{
          id: newUid,
          full_name: userForm.fullName,
          username: userForm.username,
          role: userForm.role,
          status: userForm.status,
          email: userForm.email,
          avatar_url: userForm.avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(userForm.fullName)}`,
          created_at: new Date().toISOString()
        }, ...prev]);

        createLog('ADD_USER', `Menambahkan pengguna online baru: ${userForm.fullName} (${userForm.role})`);
        showSuccess('Berhasil', 'Pengguna online baru berhasil ditambahkan!');
      }
      setShowAddUserModal(false);
      setShowEditUserModal(false);
    } catch(err: any) {
      showError('Gagal', `Gagal menyimpan data online: ${err.message}`);
    }
  };

  const handleDeleteUser = async (userId: string, name: string) => {
    if (userId.startsWith('mock-uuid-admin') || userId === adminProfile?.id) {
      showError('Gagal', 'Akun administrator utama tidak dapat dihapus!');
      return;
    }

    const confirmRes = await showConfirm('Hapus Pengguna', `Apakah Anda yakin ingin menghapus "${name}" secara permanen?`, 'Ya, Hapus', 'Batal');
    if (!confirmRes.isConfirmed) return;

    if (isMock) {
      const updated = profiles.filter(p => p.id !== userId);
      setProfiles(updated);

      // Save custom profiles
      const customProfs = updated.filter(p => p.id.startsWith('mock-custom-')).map(p => ({
        fullName: p.full_name,
        email: p.email || (p.username ? p.username + '@sinesa.com' : 'user@sinesa.com'),
        username: p.username,
        role: p.role,
        status: p.status
      }));
      localStorage.setItem('mock_profiles', JSON.stringify(customProfs));

      createLog('DELETE_USER', `Menghapus pengguna: ${name}`);
      showSuccess('Berhasil', 'Pengguna berhasil dihapus!');
      return;
    }

    try {
      const { error } = await supabase.from('profiles').delete().eq('id', userId);
      if (error) throw error;
      setProfiles(profiles.filter(p => p.id !== userId));
      createLog('DELETE_USER', `Menghapus pengguna online: ${name} (${userId})`);
      showSuccess('Berhasil', 'Pengguna online berhasil dihapus dari database!');
    } catch(err: any) {
      showError('Gagal', `Gagal menghapus online: ${err.message}`);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !resetPasswordValue) return;

    if (isMock) {
      createLog('RESET_PASSWORD', `Mereset password pengguna: ${selectedUser.full_name}`);
      showSuccess('Berhasil', `Password "${selectedUser.full_name}" diset ulang menjadi: ${resetPasswordValue} (Mode Mock)`);
      setShowResetPasswordModal(false);
      setResetPasswordValue('');
      return;
    }

    try {
      // Supabase Password Reset (invoking admin auth API if allowed, or alerting client)
      // Since normal clients cannot update other users auth password directly without custom security functions or RPC:
      // We will mock/sim or log, and display guidance to use Supabase panel
      showSuccess('Instruksi Dikirim', `Permintaan reset password online untuk "${selectedUser.full_name}" dicatat. Hubungi admin database jika link reset dibutuhkan.`);
      createLog('RESET_PASSWORD', `Meminta reset password online untuk: ${selectedUser.full_name} (${selectedUser.id})`);
      setShowResetPasswordModal(false);
      setResetPasswordValue('');
    } catch(err: any) {
      showError('Gagal', err.message);
    }
  };

  const toggleUserStatus = async (user: Profile) => {
    if (user.id.startsWith('mock-uuid-admin') || user.id === adminProfile?.id) {
      showError('Gagal', 'Status administrator utama tidak dapat diubah!');
      return;
    }
    const newStatus: 'active' | 'inactive' = user.status === 'active' ? 'inactive' : 'active';
    
    if (isMock) {
      const updated = profiles.map(p => p.id === user.id ? { ...p, status: newStatus } : p);
      setProfiles(updated);
      
      const customProfs = updated.filter(p => p.id.startsWith('mock-custom-')).map(p => ({
        fullName: p.full_name,
        email: p.email || (p.username ? p.username + '@sinesa.com' : 'user@sinesa.com'),
        username: p.username,
        role: p.role,
        status: p.status
      }));
      localStorage.setItem('mock_profiles', JSON.stringify(customProfs));

      createLog('TOGGLE_STATUS', `Mengubah status akun "${user.full_name}" menjadi: ${newStatus}`);
      showSuccess('Berhasil', `Status akun diubah menjadi: ${newStatus === 'active' ? 'Aktif' : 'Nonaktif'}`);
      return;
    }

    try {
      const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', user.id);
      if (error) throw error;
      setProfiles(profiles.map(p => p.id === user.id ? { ...p, status: newStatus } : p));
      createLog('TOGGLE_STATUS', `Mengubah status akun online "${user.full_name}" menjadi: ${newStatus}`);
      showSuccess('Berhasil', `Status akun online diubah menjadi: ${newStatus === 'active' ? 'Aktif' : 'Nonaktif'}`);
    } catch(err: any) {
      showError('Gagal', `Gagal mengubah status: ${err.message}`);
    }
  };

  // Quiz Management Operations
  const toggleQuizStatus = async (quiz: Quiz) => {
    const newStatus: 'active' | 'inactive' = quiz.status === 'active' ? 'inactive' : 'active';

    if (isMock) {
      const updated = quizzes.map(q => q.id === quiz.id ? { ...q, status: newStatus } : q);
      setQuizzes(updated);
      localStorage.setItem('quizzes', JSON.stringify(updated));
      createLog('TOGGLE_QUIZ_STATUS', `Mengubah status kuis "${quiz.title}" menjadi: ${newStatus}`);
      showSuccess('Berhasil', `Kuis diubah menjadi: ${newStatus === 'active' ? 'Aktif' : 'Nonaktif'}`);
      return;
    }

    try {
      const { error } = await supabase.from('quizzes').update({ status: newStatus }).eq('id', quiz.id);
      if (error) throw error;
      setQuizzes(quizzes.map(q => q.id === quiz.id ? { ...q, status: newStatus } : q));
      createLog('TOGGLE_QUIZ_STATUS', `Mengubah status kuis online "${quiz.title}" menjadi: ${newStatus}`);
      showSuccess('Berhasil', `Kuis online diubah menjadi: ${newStatus === 'active' ? 'Aktif' : 'Nonaktif'}`);
    } catch(err: any) {
      showError('Gagal', err.message);
    }
  };

  const handleDeleteQuiz = async (quiz: Quiz) => {
    const confirmRes = await showConfirm('Hapus Kuis', `Apakah Anda yakin ingin menghapus kuis "${quiz.title}" beserta seluruh pertanyaan didalamnya?`, 'Ya, Hapus', 'Batal');
    if (!confirmRes.isConfirmed) return;

    if (isMock) {
      const updated = quizzes.filter(q => q.id !== quiz.id);
      setQuizzes(updated);
      localStorage.setItem('quizzes', JSON.stringify(updated));
      createLog('DELETE_QUIZ', `Menghapus kuis: ${quiz.title}`);
      showSuccess('Berhasil', 'Kuis berhasil dihapus dari sistem (Mode Mock).');
      return;
    }

    try {
      const { error } = await supabase.from('quizzes').delete().eq('id', quiz.id);
      if (error) throw error;
      setQuizzes(quizzes.filter(q => q.id !== quiz.id));
      createLog('DELETE_QUIZ', `Menghapus kuis online: ${quiz.title} (${quiz.id})`);
      showSuccess('Berhasil', 'Kuis online berhasil dihapus dari database.');
    } catch(err: any) {
      showError('Gagal', err.message);
    }
  };

  // Settings Save Operation
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMock) {
      localStorage.setItem('mock_system_settings', JSON.stringify(settings));
      createLog('SAVE_SETTINGS', 'Menyimpan konfigurasi pengaturan sistem global.');
      showSuccess('Berhasil', 'Pengaturan sistem disimpan (Mode Mock)!');
      return;
    }

    try {
      // Save settings to system_settings table
      const rows = Object.entries(settings).map(([key, value]) => ({
        key,
        value,
        updated_at: new Date().toISOString()
      }));

      const { error } = await supabase.from('system_settings').upsert(rows);
      if (error) throw error;
      createLog('SAVE_SETTINGS', 'Menyimpan konfigurasi pengaturan sistem global online.');
      showSuccess('Berhasil', 'Pengaturan sistem berhasil disimpan online!');
    } catch(err: any) {
      showError('Gagal', err.message);
    }
  };

  // Activity Log Export to CSV
  const handleExportCSV = () => {
    if (logs.length === 0) {
      showError('Gagal', 'Tidak ada log untuk diekspor!');
      return;
    }

    const headers = ['ID Log', 'ID Pengguna', 'Aksi', 'Keterangan Detail', 'Waktu Dibuat'];
    const csvRows = [headers.join(',')];

    logs.forEach(log => {
      const row = [
        `"${log.id}"`,
        `"${log.user_id || 'SYSTEM'}"`,
        `"${log.action}"`,
        `"${(log.details || '').replace(/"/g, '""')}"`,
        `"${new Date(log.created_at).toLocaleString('id-ID')}"`
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SINESA_Activity_Logs_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    createLog('EXPORT_CSV', 'Mengekspor log aktivitas sistem ke format CSV.');
    showSuccess('Berhasil', 'File log CSV berhasil diunduh!');
  };

  // Notifications clear
  const clearNotification = (id: string) => {
    setNotifications(notifications.filter(n => n.id !== id));
    if (isMock) {
      const saved = JSON.parse(localStorage.getItem('mock_notifications') || '[]');
      localStorage.setItem('mock_notifications', JSON.stringify(saved.filter((n: any) => n.id !== id)));
    } else {
      supabase.from('notifications').delete().eq('id', id).then(() => {});
    }
  };

  // Filtered & Paginated Arrays
  const filteredUsers = profiles.filter(p => {
    const matchesSearch = p.full_name.toLowerCase().includes(userSearch.toLowerCase()) || 
                          (p.username && p.username.toLowerCase().includes(userSearch.toLowerCase()));
    const matchesRole = userRoleFilter === 'all' || p.role === userRoleFilter;
    return matchesSearch && matchesRole;
  });

  const totalUserPages = Math.ceil(filteredUsers.length / usersPerPage) || 1;
  const paginatedUsers = filteredUsers.slice((userPage - 1) * usersPerPage, userPage * usersPerPage);

  const filteredQuizzes = quizzes.filter(q => {
    const creator = profiles.find(p => p.id === q.teacher_id)?.full_name || 'Guru';
    return q.title.toLowerCase().includes(quizSearch.toLowerCase()) || creator.toLowerCase().includes(quizSearch.toLowerCase());
  });

  const totalQuizPages = Math.ceil(filteredQuizzes.length / quizzesPerPage) || 1;
  const paginatedQuizzes = filteredQuizzes.slice((quizPage - 1) * quizzesPerPage, quizPage * quizzesPerPage);

  const filteredLogs = logs.filter(l => {
    const matchesSearch = l.action.toLowerCase().includes(logSearch.toLowerCase()) || 
                          (l.details && l.details.toLowerCase().includes(logSearch.toLowerCase()));
    
    let matchesType = true;
    if (logFilter === 'login') matchesType = l.action === 'LOGIN';
    else if (logFilter === 'logout') matchesType = l.action === 'LOGOUT';
    else if (logFilter === 'quiz') matchesType = l.action.includes('QUIZ');
    else if (logFilter === 'admin') matchesType = l.action.includes('USER') || l.action.includes('SETTINGS') || l.action.includes('PASSWORD');
    else if (logFilter === 'cheat') matchesType = l.action.includes('CHEAT');

    return matchesSearch && matchesType;
  });

  const totalLogPages = Math.ceil(filteredLogs.length / logsPerPage) || 1;
  const paginatedLogs = filteredLogs.slice((logPage - 1) * logsPerPage, logPage * logsPerPage);

  // Stats computation
  const totalUsersCount = profiles.length;
  const totalTeachersCount = profiles.filter(p => p.role === 'teacher').length;
  const totalStudentsCount = profiles.filter(p => p.role === 'student').length;
  const totalQuizzesCount = quizzes.length;
  const totalSessionsCount = sessions.length;
  const totalActiveUsers = userSessions.filter(s => s.is_online).length;

  // Chart Data preparation
  const userStatsData = [
    { name: 'Admin', total: profiles.filter(p => p.role === 'admin').length, fill: '#ef4444' },
    { name: 'Guru', total: totalTeachersCount, fill: '#3b82f6' },
    { name: 'Murid', total: totalStudentsCount, fill: '#f59e0b' }
  ];

  const quizActivityData = [
    { name: 'Kuis Aktif', total: quizzes.filter(q => q.status === 'active').length },
    { name: 'Kuis Nonaktif', total: quizzes.filter(q => q.status === 'inactive').length },
    { name: 'Sesi Lobby', total: sessions.filter(s => s.status === 'lobby').length },
    { name: 'Sesi Aktif', total: sessions.filter(s => s.status === 'active').length },
    { name: 'Sesi Selesai', total: sessions.filter(s => s.status === 'completed').length }
  ];

  return (
    <div className="flex h-screen w-screen bg-mesh overflow-hidden text-foreground">
      {/* 1. SIDEBAR NAVIGATION */}
      <div className={`bg-card/85 backdrop-blur-md flex flex-col justify-between shrink-0 z-10 transition-all duration-300 ${isSidebarCollapsed ? 'w-0 overflow-hidden border-none' : 'w-64 border-r border-border'}`}>
        <div>
          {/* Brand Header */}
          <div className="p-6 border-b border-border flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-amber-500 flex items-center justify-center text-yellow-950 font-black text-xl shadow-lg shadow-amber-500/20">
              S
            </div>
            <div>
              <h1 className="font-extrabold text-base tracking-tight leading-none text-foreground">
                {settings.app_name} Admin
              </h1>
              <span className="text-[9px] text-muted-foreground font-black uppercase tracking-wider">
                Control Center
              </span>
            </div>
          </div>

          {/* Menu Items */}
          <nav className="p-4 space-y-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition active:scale-[0.98] ${
                activeTab === 'dashboard'
                  ? 'bg-amber-500 text-yellow-950 shadow-md shadow-amber-500/15'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <LayoutDashboard className="h-4.5 w-4.5" />
              Dashboard
            </button>
            
            <button
              onClick={() => setActiveTab('users')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition active:scale-[0.98] ${
                activeTab === 'users'
                  ? 'bg-amber-500 text-yellow-950 shadow-md shadow-amber-500/15'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Users className="h-4.5 w-4.5" />
              Kelola Pengguna
            </button>

            <button
              onClick={() => setActiveTab('quizzes')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition active:scale-[0.98] ${
                activeTab === 'quizzes'
                  ? 'bg-amber-500 text-yellow-950 shadow-md shadow-amber-500/15'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <BookOpen className="h-4.5 w-4.5" />
              Kelola Kuis
            </button>

            <button
              onClick={() => setActiveTab('logs')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition active:scale-[0.98] ${
                activeTab === 'logs'
                  ? 'bg-amber-500 text-yellow-950 shadow-md shadow-amber-500/15'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <FileText className="h-4.5 w-4.5" />
              Log Aktivitas
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition active:scale-[0.98] ${
                activeTab === 'settings'
                  ? 'bg-amber-500 text-yellow-950 shadow-md shadow-amber-500/15'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Settings className="h-4.5 w-4.5" />
              Pengaturan Sistem
            </button>
          </nav>
        </div>

        {/* Sidebar Footer Account */}
        <div className="p-4 border-t border-border bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LazyImage 
                src={adminProfile?.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=admin`}
                alt="Admin Avatar"
                className="h-9 w-9 rounded-xl border bg-background"
              />
              <div className="text-left">
                <p className="text-xs font-black text-foreground max-w-[110px] truncate leading-tight">
                  {adminProfile?.full_name || 'Admin SINESA'}
                </p>
                <span className="text-[9px] font-black text-muted-foreground uppercase">
                  Administrator
                </span>
              </div>
            </div>
            
            <button
              onClick={handleLogout}
              className="p-2 rounded-xl text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 active:scale-95 transition"
              title="Keluar"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. MAIN LAYOUT */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 border-b border-border bg-card/40 backdrop-blur-md flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-2 -ml-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition active:scale-95 shrink-0"
              title={isSidebarCollapsed ? "Tampilkan Sidebar" : "Sembunyikan Sidebar"}
            >
              <Menu className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-black text-foreground tracking-tight capitalize">
              {activeTab === 'dashboard' && 'Dashboard Utama'}
              {activeTab === 'users' && 'Manajemen Pengguna'}
              {activeTab === 'quizzes' && 'Manajemen Kuis'}
              {activeTab === 'logs' && 'Audit Log Sistem'}
              {activeTab === 'settings' && 'Konfigurasi Sistem'}
            </h2>
            {isMock && (
              <span className="rounded bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 text-[8px] font-bold text-amber-500 uppercase tracking-widest">
                Demo Mode
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            {/* System sync indicator */}
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-green-600 tracking-wider">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              Live Sync
            </div>

            <ThemeToggle />
          </div>
        </header>

        {/* Active Tab Panel Page Body */}
        <main className="flex-1 overflow-y-auto p-8">
          <AnimatePresence mode="wait">
            {loading ? (
              <div className="h-full w-full flex flex-col items-center justify-center space-y-4">
                <div className="h-12 w-12 animate-spin border-4 border-amber-500 border-t-transparent rounded-full" />
                <p className="text-sm font-semibold text-muted-foreground">Memuat data panel administrator...</p>
              </div>
            ) : (
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="h-full space-y-8"
              >
                {/* ==================== TAB: DASHBOARD ==================== */}
                {activeTab === 'dashboard' && (
                  <div className="space-y-8">
                    {/* Stats Premium Cards Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-6">
                      <div className="glass-panel p-5 rounded-3xl border text-left bg-card/30 flex flex-col justify-between min-h-[110px]">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Total Pengguna</span>
                        <h3 className="text-3xl font-black text-foreground leading-none">{totalUsersCount}</h3>
                      </div>
                      <div className="glass-panel p-5 rounded-3xl border text-left bg-card/30 flex flex-col justify-between min-h-[110px]">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Total Guru</span>
                        <h3 className="text-3xl font-black text-primary leading-none">{totalTeachersCount}</h3>
                      </div>
                      <div className="glass-panel p-5 rounded-3xl border text-left bg-card/30 flex flex-col justify-between min-h-[110px]">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Total Murid</span>
                        <h3 className="text-3xl font-black text-yellow-500 leading-none">{totalStudentsCount}</h3>
                      </div>
                      <div className="glass-panel p-5 rounded-3xl border text-left bg-card/30 flex flex-col justify-between min-h-[110px]">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Total Kuis</span>
                        <h3 className="text-3xl font-black text-green-500 leading-none">{totalQuizzesCount}</h3>
                      </div>
                      <div className="glass-panel p-5 rounded-3xl border text-left bg-card/30 flex flex-col justify-between min-h-[110px]">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Sesi Kuis</span>
                        <h3 className="text-3xl font-black text-purple-500 leading-none">{totalSessionsCount}</h3>
                      </div>
                      <div className="glass-panel p-5 rounded-3xl border text-left bg-card/30 flex flex-col justify-between min-h-[110px]">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Pengguna Aktif</span>
                        <h3 className="text-3xl font-black text-rose-500 leading-none">{totalActiveUsers}</h3>
                      </div>
                    </div>

                    {/* Chart Visualization Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* User growth chart */}
                      <div className="glass-panel p-6 rounded-3xl border bg-card/10 space-y-4">
                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                          <Users className="h-4 w-4 text-primary" /> Distribusi Role Pengguna
                        </h4>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                             <BarChart data={userStatsData}>
                               <XAxis dataKey="name" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                               <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                               <Tooltip 
                                 contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '12px', fontSize: '12px', color: '#fff' }}
                                 itemStyle={{ color: '#fff' }}
                                 labelStyle={{ color: '#fff' }}
                               />
                               <Bar dataKey="total" radius={[8, 8, 0, 0]} maxBarSize={50}>
                                 {userStatsData.map((entry, index) => (
                                   <Cell key={`cell-${index}`} fill={entry.fill} />
                                 ))}
                               </Bar>
                             </BarChart>
                           </ResponsiveContainer>
                         </div>
                       </div>

                       {/* Quiz activity chart */}
                       <div className="glass-panel p-6 rounded-3xl border bg-card/10 space-y-4">
                         <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                           <Activity className="h-4 w-4 text-yellow-500" /> Statistik Aktivitas Evaluasi
                         </h4>
                         <div className="h-64">
                           <ResponsiveContainer width="100%" height="100%">
                             <BarChart data={quizActivityData}>
                               <XAxis dataKey="name" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                               <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                               <Tooltip 
                                 contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '12px', fontSize: '12px', color: '#fff' }}
                                 itemStyle={{ color: '#fff' }}
                                 labelStyle={{ color: '#fff' }}
                               />
                               <Bar dataKey="total" fill="#fbbf24" radius={[8, 8, 0, 0]} maxBarSize={45} />
                             </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>

                    {/* Realtime Monitoring & Activity feed */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {/* Active Online Users Card */}
                      <div className="glass-panel p-6 rounded-3xl border bg-card/10 space-y-4">
                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                          <Globe className="h-4.5 w-4.5 text-blue-500 animate-pulse" /> Sesi Aktif Online ({totalActiveUsers})
                        </h4>
                        <div className="divide-y divide-border/50 max-h-72 overflow-y-auto space-y-2">
                          {userSessions.map(us => {
                            const u = profiles.find(p => p.id === us.user_id);
                            return (
                              <div key={us.id} className="flex items-center justify-between py-2 text-xs">
                                <div className="flex items-center gap-2 text-left">
                                  <div className="relative">
                                    <LazyImage 
                                      src={u?.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(u?.full_name || 'us')}`}
                                      alt="Avatar"
                                      className="h-8 w-8 rounded-lg bg-background"
                                    />
                                    <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-card ${us.is_online ? 'bg-green-500 animate-pulse' : 'bg-zinc-500'}`} />
                                  </div>
                                  <div>
                                    <span className="font-bold text-foreground block">{u?.full_name || 'System User'}</span>
                                    <span className="text-[10px] text-muted-foreground block">{us.user_agent || 'Unknown browser'}</span>
                                  </div>
                                </div>
                                <span className="text-[9px] text-muted-foreground font-semibold">
                                  {us.is_online ? 'Online' : 'Offline'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Realtime System activity log (live audit feed) */}
                      <div className="glass-panel p-6 rounded-3xl border bg-card/10 space-y-4 lg:col-span-2">
                        <div className="flex items-center justify-between border-b border-border/50 pb-2">
                          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            <Activity className="h-4.5 w-4.5 text-amber-500" /> Log Aktivitas Realtime
                          </h4>
                          <span className="text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded font-black uppercase">Live Logs</span>
                        </div>
                        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                          {logs.slice(0, 5).map(l => {
                            const u = profiles.find(p => p.id === l.user_id);
                            return (
                              <div key={l.id} className="flex flex-col sm:flex-row justify-between text-xs py-2 border-b border-dashed border-border/40 gap-1 text-left">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                                      l.action.includes('CHEAT') ? 'bg-red-500/10 text-red-500' :
                                      l.action.includes('LOGIN') ? 'bg-blue-500/10 text-blue-500' : 'bg-zinc-800 text-zinc-400'
                                    }`}>
                                      {l.action}
                                    </span>
                                    <span className="font-bold text-foreground">{u?.full_name || 'System / Guest'}</span>
                                  </div>
                                  <p className="text-muted-foreground text-[11px] leading-tight pr-4">{l.details}</p>
                                </div>
                                <span className="text-[9px] text-zinc-500 shrink-0 font-mono self-start sm:self-center">
                                  {new Date(l.created_at).toLocaleTimeString('id-ID')}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Alerts / Realtime notification panel */}
                    {notifications.filter(n => !n.is_read).length > 0 && (
                      <div className="glass-panel p-6 rounded-3xl border border-red-500/20 bg-red-500/5 space-y-3">
                        <h4 className="text-xs font-bold text-red-500 uppercase tracking-wider flex items-center gap-2">
                          <AlertTriangle className="h-4.5 w-4.5" /> Peringatan Keamanan Realtime
                        </h4>
                        <div className="space-y-2">
                          {notifications.filter(n => !n.is_read).map(n => (
                            <div key={n.id} className="flex items-center justify-between bg-card/60 border border-border p-3.5 rounded-2xl text-xs text-left">
                              <div>
                                <span className="font-bold text-foreground block">{n.title}</span>
                                <span className="text-muted-foreground text-[11px] block mt-0.5">{n.message}</span>
                              </div>
                              <button
                                onClick={() => clearNotification(n.id)}
                                className="px-2.5 py-1 text-[10px] font-bold rounded-xl hover:bg-accent border transition text-muted-foreground hover:text-foreground shrink-0"
                              >
                                Sembunyikan
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ==================== TAB: KELOLA PENGGUNA ==================== */}
                {activeTab === 'users' && (
                  <div className="space-y-6">
                    {/* Filter, search, and action bar */}
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                      <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                        {/* Search */}
                        <div className="glass-panel px-4 py-2.5 rounded-2xl flex items-center gap-3 shrink-0 max-w-xs border">
                          <Search className="h-4 w-4 text-muted-foreground" />
                          <input 
                            type="text" 
                            placeholder="Cari nama/username..." 
                            value={userSearch}
                            onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }}
                            className="bg-transparent text-xs outline-none border-none placeholder-muted-foreground w-40"
                          />
                        </div>
                        {/* Role filter */}
                        <select
                          value={userRoleFilter}
                          onChange={(e) => { setUserRoleFilter(e.target.value as any); setUserPage(1); }}
                          className="glass-panel px-4 py-2.5 rounded-2xl border text-xs text-foreground outline-none bg-card"
                        >
                          <option value="all">Semua Peran (Role)</option>
                          <option value="admin">Admin</option>
                          <option value="teacher">Guru</option>
                          <option value="student">Murid</option>
                        </select>
                      </div>

                      {/* Add user button */}
                      <button
                        onClick={() => {
                          setSelectedUser(null);
                          setUserForm({
                            fullName: '',
                            email: '',
                            username: '',
                            password: '',
                            role: 'student',
                            status: 'active',
                            avatarUrl: ''
                          });
                          setShowAddUserModal(true);
                        }}
                        className="flex items-center gap-2 rounded-2xl bg-amber-500 text-yellow-950 font-black text-xs px-5 py-3 hover:bg-amber-600 shadow shadow-amber-500/10 active:scale-95 transition"
                      >
                        <Plus className="h-4.5 w-4.5" />
                        Tambah Pengguna
                      </button>
                    </div>

                    {/* Data Table modern */}
                    <div className="glass-panel rounded-3xl overflow-hidden border">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-muted/40 border-b border-border text-xs text-muted-foreground uppercase font-bold">
                              <th className="px-6 py-4">Pengguna</th>
                              <th className="px-6 py-4">Username & Email</th>
                              <th className="px-6 py-4">Peran (Role)</th>
                              <th className="px-6 py-4">Status Akun</th>
                              <th className="px-6 py-4 text-right">Kelola</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border text-sm">
                            {paginatedUsers.map((u) => (
                              <tr key={u.id} className="hover:bg-muted/10 transition">
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-3 text-left">
                                    <LazyImage 
                                      src={u.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(u.full_name)}`}
                                      alt={u.full_name}
                                      className="h-10 w-10 rounded-full border bg-background"
                                    />
                                    <div>
                                      <span className="font-bold text-foreground block">{u.full_name}</span>
                                      <span className="text-[10px] text-muted-foreground block">ID: {u.id.slice(0, 8)}...</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-left">
                                  <span className="font-semibold text-xs text-foreground block">{u.username || '@' + u.full_name.toLowerCase().replace(/\s+/g, '')}</span>
                                  <span className="text-[11px] text-muted-foreground block">{u.email || (u.username ? u.username + '@sinesa.com' : 'user@sinesa.com')}</span>
                                </td>
                                <td className="px-6 py-4 text-left">
                                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                                    u.role === 'admin' ? 'bg-red-500/10 border-red-500/20 text-red-500' :
                                    u.role === 'teacher' ? 'bg-blue-500/10 border-blue-500/20 text-blue-500' :
                                    'bg-yellow-500/10 border-yellow-500/20 text-yellow-500'
                                  }`}>
                                    {u.role}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-left">
                                  <button
                                    onClick={() => toggleUserStatus(u)}
                                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${
                                      u.status !== 'inactive' 
                                        ? 'bg-green-500/10 border-green-500/20 text-green-500 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20' 
                                        : 'bg-red-500/10 border-red-500/20 text-red-500 hover:bg-green-500/10 hover:text-green-500 hover:border-green-500/20'
                                    }`}
                                    title={u.status !== 'inactive' ? 'Nonaktifkan Akun' : 'Aktifkan Akun'}
                                  >
                                    {u.status !== 'inactive' ? 'Aktif' : 'Nonaktif'}
                                  </button>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex justify-end gap-1">
                                    <button
                                      onClick={() => {
                                        setSelectedUser(u);
                                        setUserForm({
                                          fullName: u.full_name,
                                          email: u.email || (u.username ? u.username + '@sinesa.com' : ''),
                                          username: u.username || '',
                                          password: '',
                                          role: u.role,
                                          status: u.status || 'active',
                                          avatarUrl: u.avatar_url || ''
                                        });
                                        setShowEditUserModal(true);
                                      }}
                                      className="p-2 rounded-xl text-primary hover:bg-primary/10 border border-transparent transition"
                                      title="Edit Pengguna"
                                    >
                                      <Edit className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        setSelectedUser(u);
                                        setResetPasswordValue('');
                                        setShowResetPasswordModal(true);
                                      }}
                                      className="p-2 rounded-xl text-yellow-500 hover:bg-yellow-500/10 border border-transparent transition"
                                      title="Reset Password"
                                    >
                                      <Key className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteUser(u.id, u.full_name)}
                                      className="p-2 rounded-xl text-destructive hover:bg-destructive/10 border border-transparent transition"
                                      title="Hapus Pengguna"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination Controls */}
                      {totalUserPages > 1 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 border-t border-border/50">
                          <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                            Menampilkan <span className="text-foreground">{(userPage - 1) * usersPerPage + 1}</span> - <span className="text-foreground">{Math.min(userPage * usersPerPage, filteredUsers.length)}</span> dari <span className="text-foreground">{filteredUsers.length}</span> pengguna
                          </span>
                          
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setUserPage(prev => Math.max(1, prev - 1))}
                              disabled={userPage === 1}
                              className="p-2 rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </button>
                            {[...Array(totalUserPages)].map((_, i) => (
                              <button
                                key={i}
                                onClick={() => setUserPage(i + 1)}
                                className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold transition border ${
                                  userPage === i + 1 
                                    ? 'bg-amber-500 border-amber-500 text-yellow-950 font-black shadow-lg shadow-amber-500/15' 
                                    : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent'
                                }`}
                              >
                                {i + 1}
                              </button>
                            ))}
                            <button
                              onClick={() => setUserPage(prev => Math.min(totalUserPages, prev + 1))}
                              disabled={userPage === totalUserPages}
                              className="p-2 rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ==================== TAB: KELOLA KUIS ==================== */}
                {activeTab === 'quizzes' && (
                  <div className="space-y-8">
                    {/* Search and Header */}
                    <div className="flex items-center justify-between gap-4">
                      <div className="glass-panel px-4 py-2.5 rounded-2xl flex items-center gap-3 shrink-0 max-w-xs border">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <input 
                          type="text" 
                          placeholder="Cari kuis / guru..." 
                          value={quizSearch}
                          onChange={(e) => { setQuizSearch(e.target.value); setQuizPage(1); }}
                          className="bg-transparent text-xs outline-none border-none placeholder-muted-foreground w-40"
                        />
                      </div>
                    </div>

                    {/* Quizzes Table List */}
                    <div className="glass-panel rounded-3xl overflow-hidden border">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-muted/40 border-b border-border text-xs text-muted-foreground uppercase font-bold">
                              <th className="px-6 py-4">Judul Kuis</th>
                              <th className="px-6 py-4">Guru Pembuat</th>
                              <th className="px-6 py-4">Kode PIN</th>
                              <th className="px-6 py-4">Tanggal Dibuat</th>
                              <th className="px-6 py-4">Status</th>
                              <th className="px-6 py-4 text-right">Kelola</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border text-sm">
                            {paginatedQuizzes.map(q => {
                              const t = profiles.find(p => p.id === q.teacher_id);
                              return (
                                <tr key={q.id} className="hover:bg-muted/10 transition">
                                  <td className="px-6 py-4 text-left">
                                    <span className="font-bold text-foreground block line-clamp-1">{q.title}</span>
                                    <span className="text-[10px] text-muted-foreground block truncate max-w-xs">{q.description || 'Tanpa deskripsi'}</span>
                                  </td>
                                  <td className="px-6 py-4 text-left font-semibold text-xs">
                                    {t?.full_name || 'Guru Terhapus'}
                                  </td>
                                  <td className="px-6 py-4 text-left font-mono font-bold text-xs tracking-wider text-primary">
                                    {q.pin_code}
                                  </td>
                                  <td className="px-6 py-4 text-left text-xs text-muted-foreground">
                                    {new Date(q.created_at).toLocaleDateString('id-ID')}
                                  </td>
                                  <td className="px-6 py-4 text-left">
                                    <button
                                      onClick={() => toggleQuizStatus(q)}
                                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${
                                        q.status !== 'inactive' 
                                          ? 'bg-green-500/10 border-green-500/20 text-green-500 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20' 
                                          : 'bg-red-500/10 border-red-500/20 text-red-500 hover:bg-green-500/10 hover:text-green-500 hover:border-green-500/20'
                                      }`}
                                      title={q.status !== 'inactive' ? 'Nonaktifkan Kuis' : 'Aktifkan Kuis'}
                                    >
                                      {q.status !== 'inactive' ? 'Aktif' : 'Nonaktif'}
                                    </button>
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    <button
                                      onClick={() => handleDeleteQuiz(q)}
                                      className="p-2 rounded-xl text-destructive hover:bg-destructive/10 border border-transparent transition"
                                      title="Hapus Kuis"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination Controls */}
                      {totalQuizPages > 1 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 border-t border-border/50">
                          <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                            Menampilkan <span className="text-foreground">{(quizPage - 1) * quizzesPerPage + 1}</span> - <span className="text-foreground">{Math.min(quizPage * quizzesPerPage, filteredQuizzes.length)}</span> dari <span className="text-foreground">{filteredQuizzes.length}</span> kuis
                          </span>
                          
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setQuizPage(prev => Math.max(1, prev - 1))}
                              disabled={quizPage === 1}
                              className="p-2 rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </button>
                            {[...Array(totalQuizPages)].map((_, i) => (
                              <button
                                key={i}
                                onClick={() => setQuizPage(i + 1)}
                                className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold transition border ${
                                  quizPage === i + 1 
                                    ? 'bg-amber-500 border-amber-500 text-yellow-950 font-black shadow-lg shadow-amber-500/15' 
                                    : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent'
                                }`}
                              >
                                {i + 1}
                              </button>
                            ))}
                            <button
                              onClick={() => setQuizPage(prev => Math.min(totalQuizPages, prev + 1))}
                              disabled={quizPage === totalQuizPages}
                              className="p-2 rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Monitoring Sesi Kuis Realtime */}
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2 border-b border-border/50 pb-2 text-left">
                        <Activity className="h-4.5 w-4.5 text-amber-500" /> Monitoring Sesi Kuis Aktif ({sessions.filter(s => s.status !== 'completed').length})
                      </h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {sessions.filter(s => s.status !== 'completed').length === 0 ? (
                          <p className="text-xs italic text-muted-foreground col-span-full border border-dashed rounded-3xl p-8 text-center bg-card/10">
                            Tidak ada sesi kuis yang sedang berlangsung saat ini.
                          </p>
                        ) : (
                          sessions.filter(s => s.status !== 'completed').map(s => {
                            const q = quizzes.find(quiz => quiz.id === s.quiz_id);
                            const host = profiles.find(p => p.id === s.host_id);
                            return (
                              <div key={s.id} className="glass-panel p-5 rounded-3xl border bg-card/25 text-left flex flex-col justify-between space-y-4 shadow hover:border-amber-500/20 transition">
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                                      s.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'
                                    }`}>
                                      {s.status === 'active' ? '🔴 Sesi Aktif' : '🔵 Menunggu di Lobby'}
                                    </span>
                                    <span className="font-mono text-xs font-bold text-muted-foreground">
                                      PIN: {q?.pin_code || '------'}
                                    </span>
                                  </div>
                                  <h4 className="font-extrabold text-sm text-foreground line-clamp-1">{q?.title || 'Kuis Tanpa Judul'}</h4>
                                  <span className="text-[10px] text-muted-foreground font-semibold block">Host: {host?.full_name || 'Host'}</span>
                                </div>
                                <div className="border-t border-border/50 pt-3 flex items-center justify-between text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                                  <span>Soal Ke: {s.current_question_index + 1}</span>
                                  <span className="text-primary font-black">Online Monitoring</span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ==================== TAB: LOG AKTIVITAS ==================== */}
                {activeTab === 'logs' && (
                  <div className="space-y-6">
                    {/* Action panel bar */}
                    <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                      <div className="flex flex-wrap gap-4 w-full sm:w-auto">
                        {/* Search */}
                        <div className="glass-panel px-4 py-2.5 rounded-2xl flex items-center gap-3 shrink-0 max-w-xs border">
                          <Search className="h-4 w-4 text-muted-foreground" />
                          <input 
                            type="text" 
                            placeholder="Cari log..." 
                            value={logSearch}
                            onChange={(e) => { setLogSearch(e.target.value); setLogPage(1); }}
                            className="bg-transparent text-xs outline-none border-none placeholder-muted-foreground w-40"
                          />
                        </div>
                        {/* Type filter */}
                        <select
                          value={logFilter}
                          onChange={(e) => { setLogFilter(e.target.value); setLogPage(1); }}
                          className="glass-panel px-4 py-2.5 rounded-2xl border text-xs text-foreground outline-none bg-card"
                        >
                          <option value="all">Semua Tipe Aktivitas</option>
                          <option value="login">Masuk (Login)</option>
                          <option value="logout">Keluar (Logout)</option>
                          <option value="quiz">Kelola Kuis</option>
                          <option value="admin">Aktivitas Admin</option>
                          <option value="cheat">Kecurangan (Cheat)</option>
                        </select>
                      </div>

                      {/* Export CSV button */}
                      <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-2 rounded-2xl border border-border bg-card hover:bg-accent text-foreground text-xs font-bold px-5 py-3 active:scale-95 transition"
                      >
                        <Download className="h-4.5 w-4.5" />
                        Ekspor Log (.CSV)
                      </button>
                    </div>

                    {/* Table modern audit log */}
                    <div className="glass-panel rounded-3xl overflow-hidden border">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-muted/40 border-b border-border text-xs text-muted-foreground uppercase font-bold">
                              <th className="px-6 py-4">Waktu Kejadian</th>
                              <th className="px-6 py-4">Pengguna</th>
                              <th className="px-6 py-4">Jenis Aksi</th>
                              <th className="px-6 py-4">Detail Aktivitas</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border text-sm">
                            {paginatedLogs.map(l => {
                              const u = profiles.find(p => p.id === l.user_id);
                              return (
                                <tr key={l.id} className="hover:bg-muted/10 transition">
                                  <td className="px-6 py-4 text-xs font-mono text-muted-foreground text-left">
                                    {new Date(l.created_at).toLocaleString('id-ID')}
                                  </td>
                                  <td className="px-6 py-4 text-left font-semibold text-xs">
                                    {u?.full_name || 'SYSTEM / GUEST'}
                                    <span className="text-[10px] text-muted-foreground block uppercase font-mono mt-0.5">{u?.role || 'SYSTEM'}</span>
                                  </td>
                                  <td className="px-6 py-4 text-left">
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                      l.action.includes('CHEAT') ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                                      l.action.includes('LOGIN') ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' :
                                      l.action.includes('DELETE') ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                                      'bg-zinc-800 text-zinc-400 border border-zinc-700/50'
                                    }`}>
                                      {l.action}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-left text-xs text-muted-foreground leading-relaxed pr-8">
                                    {l.details}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination Controls */}
                      {totalLogPages > 1 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 border-t border-border/50">
                          <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                            Menampilkan <span className="text-foreground">{(logPage - 1) * logsPerPage + 1}</span> - <span className="text-foreground">{Math.min(logPage * logsPerPage, filteredLogs.length)}</span> dari <span className="text-foreground">{filteredLogs.length}</span> log
                          </span>
                          
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setLogPage(prev => Math.max(1, prev - 1))}
                              disabled={logPage === 1}
                              className="p-2 rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </button>
                            {[...Array(totalLogPages)].map((_, i) => (
                              <button
                                key={i}
                                onClick={() => setLogPage(i + 1)}
                                className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold transition border ${
                                  logPage === i + 1 
                                    ? 'bg-amber-500 border-amber-500 text-yellow-950 font-black shadow-lg shadow-amber-500/15' 
                                    : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent'
                                }`}
                              >
                                {i + 1}
                              </button>
                            ))}
                            <button
                              onClick={() => setLogPage(prev => Math.min(totalLogPages, prev + 1))}
                              disabled={logPage === totalLogPages}
                              className="p-2 rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ==================== TAB: PENGATURAN SISTEM ==================== */}
                {activeTab === 'settings' && (
                  <form onSubmit={handleSaveSettings} className="space-y-8 max-w-2xl text-left">
                    {/* General Settings */}
                    <div className="glass-panel p-6 rounded-3xl border bg-card/10 space-y-6">
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider border-b border-border/50 pb-2">
                        Pengaturan Tampilan & Aplikasi
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Nama Aplikasi</label>
                          <input 
                            type="text"
                            value={settings.app_name}
                            onChange={(e) => setSettings({ ...settings, app_name: e.target.value })}
                            className="w-full rounded-2xl border border-border bg-background/50 px-4 py-3 text-sm font-semibold outline-none focus:border-primary text-foreground"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Logo URL</label>
                          <input 
                            type="text"
                            value={settings.app_logo}
                            onChange={(e) => setSettings({ ...settings, app_logo: e.target.value })}
                            className="w-full rounded-2xl border border-border bg-background/50 px-4 py-3 text-sm font-semibold outline-none focus:border-primary text-foreground"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Warna Tema Utama</label>
                          <select
                            value={settings.theme_color}
                            onChange={(e) => setSettings({ ...settings, theme_color: e.target.value })}
                            className="w-full rounded-2xl border border-border bg-background/50 px-4 py-3 text-sm font-semibold outline-none focus:border-primary text-foreground"
                          >
                            <option value="blue">Biru Premium</option>
                            <option value="yellow">Kuning Neon</option>
                            <option value="emerald">Hijau Emerald</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">Pendaftaran Mandiri (Registrasi)</label>
                          <div className="flex gap-4">
                            <button
                              type="button"
                              onClick={() => setSettings({ ...settings, registration_enabled: 'true' })}
                              className={`flex-1 py-2.5 rounded-2xl border text-xs font-bold transition ${
                                settings.registration_enabled === 'true' 
                                  ? 'border-primary bg-primary/10 text-primary' 
                                  : 'border-border bg-background text-muted-foreground hover:bg-muted'
                              }`}
                            >
                              Aktif (Daftar Terbuka)
                            </button>
                            <button
                              type="button"
                              onClick={() => setSettings({ ...settings, registration_enabled: 'false' })}
                              className={`flex-1 py-2.5 rounded-2xl border text-xs font-bold transition ${
                                settings.registration_enabled === 'false' 
                                  ? 'border-red-500/50 bg-red-500/10 text-red-500' 
                                  : 'border-border bg-background text-muted-foreground hover:bg-muted'
                              }`}
                            >
                              Nonaktifkan
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Default Kuis settings */}
                    <div className="glass-panel p-6 rounded-3xl border bg-card/10 space-y-6">
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider border-b border-border/50 pb-2">
                        Pengaturan Bawaan Kuis Baru (Default Quiz Config)
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-2">Anti Cheat Default</label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setSettings({ ...settings, default_anti_cheat_enabled: 'true' })}
                              className={`flex-1 py-2 rounded-xl border text-[10px] font-bold transition ${
                                settings.default_anti_cheat_enabled === 'true' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground'
                              }`}
                            >
                              Aktif
                            </button>
                            <button
                              type="button"
                              onClick={() => setSettings({ ...settings, default_anti_cheat_enabled: 'false' })}
                              className={`flex-1 py-2 rounded-xl border text-[10px] font-bold transition ${
                                settings.default_anti_cheat_enabled === 'false' ? 'border-red-500/50 bg-red-500/10 text-red-500' : 'border-border bg-background text-muted-foreground'
                              }`}
                            >
                              Mati
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-2">Leaderboard Default</label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setSettings({ ...settings, default_leaderboard_enabled: 'true' })}
                              className={`flex-1 py-2 rounded-xl border text-[10px] font-bold transition ${
                                settings.default_leaderboard_enabled === 'true' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground'
                              }`}
                            >
                              Aktif
                            </button>
                            <button
                              type="button"
                              onClick={() => setSettings({ ...settings, default_leaderboard_enabled: 'false' })}
                              className={`flex-1 py-2 rounded-xl border text-[10px] font-bold transition ${
                                settings.default_leaderboard_enabled === 'false' ? 'border-red-500/50 bg-red-500/10 text-red-500' : 'border-border bg-background text-muted-foreground'
                              }`}
                            >
                              Mati
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-2">Tampil Hasil Default</label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setSettings({ ...settings, default_show_final_result: 'true' })}
                              className={`flex-1 py-2 rounded-xl border text-[10px] font-bold transition ${
                                settings.default_show_final_result === 'true' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground'
                              }`}
                            >
                              Aktif
                            </button>
                            <button
                              type="button"
                              onClick={() => setSettings({ ...settings, default_show_final_result: 'false' })}
                              className={`flex-1 py-2 rounded-xl border text-[10px] font-bold transition ${
                                settings.default_show_final_result === 'false' ? 'border-red-500/50 bg-red-500/10 text-red-500' : 'border-border bg-background text-muted-foreground'
                              }`}
                            >
                              Mati
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="rounded-2xl bg-amber-500 hover:bg-amber-600 text-yellow-950 font-black text-xs px-6 py-4 shadow-lg shadow-amber-500/25 transition active:scale-95"
                    >
                      Simpan Konfigurasi Sistem
                    </button>
                  </form>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* 3. MODALS POPUP / CONFIRMATION FORMS */}
      {/* Add / Edit User Modal */}
      {(showAddUserModal || showEditUserModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="glass-panel w-full max-w-md rounded-3xl shadow-2xl border-border bg-background overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-border p-5 bg-card/50">
              <h3 className="text-sm font-black text-foreground">
                {showAddUserModal ? 'Tambah Pengguna Baru' : 'Sunting Pengguna'}
              </h3>
              <button
                onClick={() => { setShowAddUserModal(false); setShowEditUserModal(false); }}
                className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-5 space-y-4 text-left">
              {/* Avatar Upload */}
              <div className="flex items-center gap-4 p-3 rounded-2xl border bg-muted/20">
                <div className="relative h-14 w-14 rounded-full border overflow-hidden shrink-0 bg-background flex items-center justify-center">
                  {userForm.avatarUrl ? (
                    <LazyImage src={userForm.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <LazyImage src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(userForm.fullName || 'User')}`} alt="Avatar placeholder" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="flex-1 space-y-1.5">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase block">Foto Profil (Opsional)</span>
                  {avatarUploading ? (
                    <div className="w-full">
                      <span className="text-[10px] text-primary font-bold block mb-1">Mengunggah... {avatarProgress}%</span>
                      <div className="w-full bg-muted rounded-full h-1 overflow-hidden">
                        <div className="bg-primary h-full transition-all duration-150" style={{ width: `${avatarProgress}%` }} />
                      </div>
                    </div>
                  ) : (
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed hover:bg-muted cursor-pointer text-[10px] font-semibold text-muted-foreground hover:text-foreground transition select-none">
                      <UploadCloud className="h-3.5 w-3.5" />
                      Pilih Foto Profil
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={handleAvatarUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                  <p className="text-[9px] text-muted-foreground font-semibold">Maksimal 2 MB (PNG, JPG, WEBP)</p>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Nama Lengkap</label>
                <input 
                  type="text" 
                  value={userForm.fullName}
                  onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
                  placeholder="Budi Santoso"
                  className="w-full rounded-2xl border border-border bg-background/50 px-4 py-2.5 text-xs outline-none focus:border-primary"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Username</label>
                <input 
                  type="text" 
                  value={userForm.username}
                  onChange={(e) => setUserForm({ ...userForm, username: e.target.value.trim().toLowerCase().replace(/\s+/g, '_') })}
                  placeholder="budi_s"
                  className="w-full rounded-2xl border border-border bg-background/50 px-4 py-2.5 text-xs outline-none focus:border-primary"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Email</label>
                <input 
                  type="email" 
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value.trim() })}
                  placeholder="budi@school.sch.id"
                  className="w-full rounded-2xl border border-border bg-background/50 px-4 py-2.5 text-xs outline-none focus:border-primary"
                  required
                />
              </div>

              {showAddUserModal && (
                <>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Kata Sandi (Password)</label>
                    <div className="relative">
                      <input 
                        type={showPasswordText ? 'text' : 'password'}
                        value={userForm.password}
                        onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                        placeholder="Minimal 6 karakter"
                        className="w-full rounded-2xl border border-border bg-background/50 pl-4 pr-10 py-2.5 text-xs outline-none focus:border-primary"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswordText(!showPasswordText)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                      >
                        {showPasswordText ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Peran (Role)</label>
                  <select
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value as UserRole })}
                    className="w-full rounded-2xl border border-border bg-background/50 px-3 py-2 text-xs outline-none focus:border-primary"
                  >
                    <option value="student">Murid</option>
                    <option value="teacher">Guru</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Status Akun</label>
                  <select
                    value={userForm.status}
                    onChange={(e) => setUserForm({ ...userForm, status: e.target.value as any })}
                    className="w-full rounded-2xl border border-border bg-background/50 px-3 py-2 text-xs outline-none focus:border-primary"
                  >
                    <option value="active">Aktif</option>
                    <option value="inactive">Nonaktif</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-2.5">
                <button
                  type="button"
                  onClick={() => { setShowAddUserModal(false); setShowEditUserModal(false); }}
                  className="flex-1 py-3 rounded-2xl border border-border bg-card hover:bg-accent text-xs font-semibold transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-yellow-950 font-black text-xs shadow-lg shadow-amber-500/15 transition"
                >
                  Simpan Pengguna
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetPasswordModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="glass-panel w-full max-w-sm rounded-3xl shadow-2xl border-border bg-background overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-border p-5 bg-card/50">
              <h3 className="text-sm font-black text-foreground">Reset Password Pengguna</h3>
              <button
                onClick={() => setShowResetPasswordModal(false)}
                className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="p-5 space-y-4 text-left">
              <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-2xl text-[11px] text-amber-600 dark:text-amber-400">
                Mereset sandi untuk: <span className="font-bold">{selectedUser.full_name}</span>.
              </div>

              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Password Baru</label>
                <div className="relative">
                  <input 
                    type={showPasswordText ? 'text' : 'password'}
                    value={resetPasswordValue}
                    onChange={(e) => setResetPasswordValue(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full rounded-2xl border border-border bg-background/50 pl-4 pr-10 py-2.5 text-xs outline-none focus:border-primary"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordText(!showPasswordText)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                  >
                    {showPasswordText ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResetPasswordModal(false)}
                  className="flex-1 py-3 rounded-2xl border border-border bg-card hover:bg-accent text-xs font-semibold transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-yellow-950 font-black text-xs shadow transition"
                >
                  Ganti Password
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};
