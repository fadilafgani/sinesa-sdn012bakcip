import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/stores/auth-store';

export const useNavigation = () => {
  const navigate = useNavigate();
  const profile = useAuthStore(state => state.profile);

  const goToDashboard = () => {
    if (profile?.role === 'teacher') {
      navigate('/teacher-dashboard');
    } else if (profile?.role === 'admin') {
      navigate('/admin-dashboard');
    } else {
      navigate('/student-dashboard');
    }
  };

  const exitQuiz = () => {
    goToDashboard();
  };

  return {
    navigate,
    goToDashboard,
    exitQuiz,
  };
};
export default useNavigation;
