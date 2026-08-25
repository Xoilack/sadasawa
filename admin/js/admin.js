let storeData = {
  name: 'Adni81',
  rows: [],
  promos: [],
  stores: ['ADNI81'],
  months: [],
  lastUpdated: null
};

function loadData() {
  const saved = localStorage.getItem('adni81_data');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      storeData = { ...storeData, ...parsed };
      return true;
    } catch(e) { return false; }
  }
  return false;
}

function saveData() {
  storeData.lastUpdated = new Date().toISOString();
  localStorage.setItem('adni81_data', JSON.stringify(storeData));
}

function generateSampleData() {
  const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
  const rows = [];
  
  months.forEach(month => {
    const daysInMonth = new Date(Number(month.split('-')[0]), Number(month.split('-')[1]), 0).getDate();
    const [year, monthNum] = month.split('-').map(Number);
    
    for (let day = 1; day <= daysInMonth; day++) {
      const isWeekend = day % 7 === 0 || day % 7 === 6;
      const multiplier = isWeekend ? 0.7 : 1;
      
      const deposit_count = Math.round((500 + Math.random() * 400) * multiplier);
      const deposit_amount = Math.round((80000 + Math.random() * 120000) * multiplier);
      const withdrawal_count = Math.round((80 + Math.random() * 100) * multiplier);
      const withdrawal_amount = Math.round((60000 + Math.random() * 80000) * multiplier);
      const ftd = Math.round((10 + Math.random() * 30) * multiplier);
      const profit = -Math.round((10000 + Math.random() * 50000) * multiplier);
      const net_turnover = Math.round((500000 + Math.random() * 1000000) * multiplier);
      
      rows.push({
        store: 'ADNI81',
        date: `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        year,
        month: monthNum,
        day,
        deposit_count,
        deposit_amount,
        withdrawal_count,
        withdrawal_amount,
        ftd,
        remarks: Math.random() > 0.85 ? ['BONUS', 'QRIS'][Math.floor(Math.random() * 2)] : [],
        member_win: profit,
        net_turnover,
        profit,
        reported: true
      });
    }
  });
  
  storeData.rows = rows;
  storeData.months = months;
  storeData.stores = ['ADNI81'];
  storeData.lastUpdated = new Date().toISOString();
  saveData();
}

function exportJSON() {
  const payload = {
    generated_at: new Date().toISOString(),
    source: 'admin-panel',
    amount_scale: 1000,
    stores: storeData.stores,
    months: storeData.months,
    rows: storeData.rows,
    promos: storeData.promos || []
  };
  
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reports_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function renderDashboard() {
  const rows = storeData.rows || [];
  const reported = rows.filter(r => r.reported);
  
  const totalDeposit = reported.reduce((sum, r) => sum + (r.deposit_amount || 0), 0);
  const totalWithdrawal = reported.reduce((sum, r) => sum + (r.withdrawal_amount || 0), 0);
  const totalProfit = reported.reduce((sum, r) => sum + (r.profit || 0), 0);
  const totalTurnover = reported.reduce((sum, r) => sum + (r.net_turnover || 0), 0);
  const totalFTD = reported.reduce((sum, r) => sum + (r.ftd || 0), 0);
  const daysCount = reported.length;
  
  document.getElementById('statDays').textContent = daysCount || 0;
  document.getElementById('statDeposit').textContent = formatRupiah(totalDeposit);
  document.getElementById('statWithdrawal').textContent = formatRupiah(totalWithdrawal);
  document.getElementById('statProfit').textContent = formatRupiah(totalProfit);
  document.getElementById('statProfit').className = `stat-value ${totalProfit < 0 ? 'neg' : 'pos'}`;
  document.getElementById('statFTD').textContent = totalFTD.toLocaleString();
  document.getElementById('statTurnover').textContent = formatRupiah(totalTurnover);
  
  renderMonthlyTable();
  renderRecentTable();
  
  document.getElementById('lastUpdate').textContent = storeData.lastUpdated 
    ? new Date(storeData.lastUpdated).toLocaleString('id-ID') 
    : 'Belum diupdate';
  document.getElementById('rowCount').textContent = `${reported.length} baris`;
}

function renderMonthlyTable() {
  const months = storeData.months || [];
  const rows = storeData.rows || [];
  
  const monthlyData = months.map(month => {
    const monthRows = rows.filter(r => r.date && r.date.startsWith(month) && r.reported);
    const days = monthRows.length;
    if (!days) return null;
    
    return {
      month,
      days,
      deposit: monthRows.reduce((s, r) => s + (r.deposit_amount || 0), 0),
      withdrawal: monthRows.reduce((s, r) => s + (r.withdrawal_amount || 0), 0),
      profit: monthRows.reduce((s, r) => s + (r.profit || 0), 0),
      turnover: monthRows.reduce((s, r) => s + (r.net_turnover || 0), 0),
      ftd: monthRows.reduce((s, r) => s + (r.ftd || 0), 0)
    };
  }).filter(Boolean);
  
  const tbody = document.getElementById('monthlyTableBody');
  if (!monthlyData.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-2);padding:30px;">Belum ada data bulanan</td></tr>`;
    return;
  }
  
  tbody.innerHTML = monthlyData.map(m => `
    <tr>
      <td><strong>${formatMonth(m.month)}</strong></td>
      <td class="num">${m.days}</td>
      <td class="num">${formatRupiah(m.deposit)}</td>
      <td class="num">${formatRupiah(m.withdrawal)}</td>
      <td class="num ${m.profit < 0 ? 'neg' : 'pos'}">${formatRupiah(m.profit)}</td>
      <td class="num">${formatRupiah(m.turnover)}</td>
    </tr>
  `).join('');
}

function renderRecentTable() {
  const rows = storeData.rows || [];
  const recent = rows.filter(r => r.reported).slice(-30).reverse();
  
  const tbody = document.getElementById('recentTableBody');
  if (!recent.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-2);padding:30px;">Belum ada data harian</td></tr>`;
    return;
  }
  
  tbody.innerHTML = recent.map(r => `
    <tr>
      <td><strong>${formatDate(r.date)}</strong></td>
      <td class="num">${(r.deposit_count || 0).toLocaleString()}</td>
      <td class="num">${formatRupiah(r.deposit_amount)}</td>
      <td class="num">${(r.withdrawal_count || 0).toLocaleString()}</td>
      <td class="num">${formatRupiah(r.withdrawal_amount)}</td>
      <td class="num ${(r.profit || 0) < 0 ? 'neg' : 'pos'}">${formatRupiah(r.profit)}</td>
      <td class="num">${formatRupiah(r.net_turnover)}</td>
    </tr>
  `).join('');
}

function formatRupiah(value) {
  if (value == null) return 'Rp 0';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${sign}Rp ${(abs / 1e9).toFixed(2)} M`;
  if (abs >= 1e6) return `${sign}Rp ${(abs / 1e6).toFixed(2)} jt`;
  return `${sign}Rp ${abs.toLocaleString('id-ID')}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${parseInt(parts[2])} ${months[parseInt(parts[1]) - 1]} ${parts[0]}`;
}

function formatMonth(monthStr) {
  if (!monthStr) return '—';
  const parts = monthStr.split('-');
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return `${months[parseInt(parts[1]) - 1]} ${parts[0]}`;
}

function showToast(title, body, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-title">${title}</div>
    <div class="toast-body">${body}</div>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function importDataFromJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.rows && data.rows.length) {
          storeData.rows = data.rows;
          storeData.months = data.months || [...new Set(data.rows.map(r => r.date ? r.date.slice(0,7) : null))].filter(Boolean).sort();
          storeData.stores = data.stores || ['ADNI81'];
          saveData();
          renderDashboard();
          showToast('✅ Berhasil', `${data.rows.length} baris data diimpor`, 'success');
        } else {
          showToast('❌ Gagal', 'Format file tidak valid', 'error');
        }
      } catch(err) {
        showToast('❌ Gagal', 'File JSON tidak valid: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function logout() {
  localStorage.removeItem('adni81_auth');
  window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', function() {
  if (!localStorage.getItem('adni81_auth')) {
    window.location.href = 'index.html';
    return;
  }
  
  if (!loadData() || !storeData.rows || storeData.rows.length === 0) {
    generateSampleData();
    showToast('📊 Data Awal', 'Data sample telah dibuat untuk Adni81', 'info');
  }
  
  renderDashboard();
  
  document.getElementById('btnExport').addEventListener('click', exportJSON);
  document.getElementById('btnImport').addEventListener('click', importDataFromJSON);
  document.getElementById('btnLogout').addEventListener('click', logout);
  document.getElementById('btnRefresh').addEventListener('click', function() {
    renderDashboard();
    showToast('🔄 Refresh', 'Dashboard diperbarui', 'success');
  });
});