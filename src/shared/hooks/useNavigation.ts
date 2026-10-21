import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/stores/auth-store';

export const useNavigation = () => {
  const navigate = useNavigate();
  const profile = useAuthStore(state => state.profile);

  const goToDashboard = () => {
    if (profile?.role === 'teacher') {
      navigate('/teacher/dashboard');
    } else if (profile?.role === 'admin') {
      navigate('/admin');
    } else {
      navigate('/student/dashboard');
    }
  };

  const goToProfile = () => {
    if (profile?.role === 'student') {
      navigate('/student/profile');
    } else {
      goToDashboard();
    }
  };

  const exitQuiz = () => {
    goToDashboard();
  };

  return {
    navigate,
    goToDashboard,
    goToProfile,
    exitQuiz,
  };
};
export default useNavigation;
