import Swal from 'sweetalert2';

// Pre-configured SweetAlert2 with SINESA glassmorphic theme
export const swal = Swal.mixin({
  background: '#18181b', // Match tailwind zinc-900 / dark card
  color: '#f4f4f5', // zinc-100
  confirmButtonColor: '#3b82f6', // primary blue
  cancelButtonColor: '#ef4444', // destructive red
  customClass: {
    popup: 'swal-premium-popup',
    title: 'swal-premium-title',
    htmlContainer: 'swal-premium-text',
    confirmButton: 'swal-premium-btn swal-premium-btn-confirm',
    cancelButton: 'swal-premium-btn swal-premium-btn-cancel',
  },
  buttonsStyling: true,
});

export const showAlert = (title: string, text: string, icon: 'info' | 'success' | 'warning' | 'error' = 'info') => {
  return swal.fire({
    title,
    text,
    icon,
  });
};

export const showSuccess = (title: string, text: string) => {
  return swal.fire({
    title,
    text,
    icon: 'success',
  });
};

export const showError = (title: string, text: string) => {
  return swal.fire({
    title,
    text,
    icon: 'error',
  });
};

export const showConfirm = (title: string, text: string, confirmButtonText = 'Ya', cancelButtonText = 'Batal') => {
  return swal.fire({
    title,
    text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
    reverseButtons: true,
  });
};
