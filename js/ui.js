export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = document.createElement('div');
  const colors = type === 'success'
    ? 'bg-emerald-600 text-white border-emerald-500'
    : 'bg-red-600 text-white border-red-500';
  t.className = `${colors} border shadow-2xl px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 opacity-0 -translate-y-3 pointer-events-auto`;
  t.innerText = message;
  container.appendChild(t);
  requestAnimationFrame(() => t.classList.remove('opacity-0', '-translate-y-3'));
  setTimeout(() => {
    t.classList.add('opacity-0', '-translate-y-3');
    setTimeout(() => t.remove(), 300);
  }, 2500);
}

export function getEmoji(category) {
  return ({
    attraction: '📸',
    activity: '🎯',
    food: '🍽️',
    coffee: '☕',
    essentials: '🛒',
    facilities: '🚻'
  })[category] || '📍';
}