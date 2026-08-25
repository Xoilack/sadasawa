function checkAuth() {
  const isAuth = localStorage.getItem('adni81_auth');
  if (!isAuth && !window.location.pathname.includes('index.html')) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

function redirectIfAuth() {
  if (localStorage.getItem('adni81_auth') && window.location.pathname.includes('index.html')) {
    window.location.href = 'dashboard.html';
  }
}

document.addEventListener('DOMContentLoaded', function() {
  if (window.location.pathname.includes('dashboard.html')) {
    checkAuth();
  }
  if (window.location.pathname.includes('index.html')) {
    redirectIfAuth();
  }
});