// ─── Service Worker Registration ────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ─── Login ──────────────────────────────────────────────
const APP_PASS = 'gr369888';

function checkLogin() {
  if (sessionStorage.getItem('grroi-auth') === '1') {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    return true;
  }
  return false;
}

document.addEventListener('DOMContentLoaded', () => {
  if (checkLogin()) return;

  document.getElementById('btn-login').addEventListener('click', doLogin);
  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
});

function doLogin() {
  const pwd = document.getElementById('login-password').value;
  if (pwd === APP_PASS) {
    sessionStorage.setItem('grroi-auth', '1');
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('login-error').textContent = '';
    initApp();
  } else {
    document.getElementById('login-error').textContent = '密码错误，请重试';
    document.getElementById('login-password').value = '';
  }
}

// ─── Supabase Cloud Storage ─────────────────────────────
const SUPABASE_URL = 'https://dooddrtgbbmioavjbtfi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvb2RkcnRnYmJtaW9hdmpidGZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNDAwNDUsImV4cCI6MjA5MDcxNjA0NX0.W__ZWwVLgZr-2Cd9Gd7Z8y6sznDryp_Cn4zbMC5_LlY';

const supaHeaders = {
  'apikey': SUPABASE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

const DEFAULT_DATA = { channels: ['小红书', '抖音', '微博', '快手', 'B站'], records: {} };

async function loadData() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_data?id=eq.1&select=data`, { headers: supaHeaders });
    const rows = await res.json();
    if (rows.length > 0 && rows[0].data) return rows[0].data;
  } catch (e) {
    console.error('Cloud load failed, using local fallback:', e);
  }
  // Fallback to localStorage
  try {
    const raw = localStorage.getItem('grroi-data');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return DEFAULT_DATA;
}

async function saveData(data) {
  // Always save locally as backup
  localStorage.setItem('grroi-data', JSON.stringify(data));
  // Save to cloud
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/app_data?id=eq.1`, {
      method: 'PATCH',
      headers: supaHeaders,
      body: JSON.stringify({ data, updated_at: new Date().toISOString() })
    });
  } catch (e) {
    console.error('Cloud save failed:', e);
  }
}

// ─── State ──────────────────────────────────────────────
let appData = DEFAULT_DATA;
let charts = {};

// ─── Utility ────────────────────────────────────────────
function fmt(n) {
  if (n == null || isNaN(n)) return '--';
  return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(n) {
  if (n == null || isNaN(n)) return '--';
  return Number(n).toLocaleString('zh-CN');
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => { t.className = 'toast'; }, 2200);
}

function calcMetrics(r) {
  const totalCost = (r.laborCost || 0) + (r.officeCost || 0) + (r.adCost || 0) + (r.otherCost || 0);
  const netProfit = (r.grossProfit || 0) - totalCost;
  const roi = totalCost > 0 ? (r.grossProfit || 0) / totalCost : 0;
  const cac = (r.newCustomers || 0) > 0 ? totalCost / r.newCustomers : 0;
  const margin = (r.orderAmount || 0) > 0 ? (r.grossProfit || 0) / r.orderAmount * 100 : 0;
  return { totalCost, netProfit, roi, cac, margin };
}

const COLORS = ['#FF2442','#6366f1','#10b981','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16'];
const FIELDS = ['laborCost','officeCost','adCost','otherCost','newCustomers','orderAmount','grossProfit'];

// ─── Init ───────────────────────────────────────────────
async function initApp() {
  appData = await loadData();
  initMonthPicker();
  populateChannelSelectors();
  setupNavigation();
  setupEntryForm();
  setupOverview();
  setupChannelManagement();
  loadRecord();
}

document.addEventListener('DOMContentLoaded', () => {
  if (checkLogin()) initApp();
});

// ─── Navigation ─────────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll('.tab-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.tab-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      item.classList.add('active');
      const tab = item.dataset.tab;
      document.getElementById('tab-' + tab).classList.add('active');
      if (tab === 'overview') renderOverviewTable();
      if (tab === 'trends') renderTrendCharts();
      if (tab === 'compare') { populateCompareMonths(); renderComparisonCharts(); }
    });
  });
}

// ─── Month Picker ───────────────────────────────────────
function initMonthPicker() {
  const now = new Date();
  document.getElementById('entry-month').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
}

// ─── Channel Selectors ──────────────────────────────────
function populateChannelSelectors() {
  const opts = appData.channels.map(c => `<option value="${c}">${c}</option>`).join('');
  document.getElementById('entry-channel').innerHTML = opts;
  document.getElementById('overview-channel-filter').innerHTML = '<option value="all">全部渠道</option>' + opts;
  document.getElementById('trends-channel').innerHTML = '<option value="all">全部渠道(汇总)</option>' + opts;
}

// ─── Data Entry ─────────────────────────────────────────
function setupEntryForm() {
  document.getElementById('entry-month').addEventListener('change', loadRecord);
  document.getElementById('entry-channel').addEventListener('change', loadRecord);
  FIELDS.forEach(f => document.getElementById('field-' + f).addEventListener('input', updateKPIPreview));
  document.getElementById('btn-save').addEventListener('click', saveRecord);
  document.getElementById('btn-clear-form').addEventListener('click', clearForm);
}

function loadRecord() {
  const month = document.getElementById('entry-month').value;
  const channel = document.getElementById('entry-channel').value;
  if (!month || !channel) return;
  const record = appData.records[month]?.[channel];
  FIELDS.forEach(f => { document.getElementById('field-' + f).value = record?.[f] ?? ''; });
  updateKPIPreview();
}

function getFormData() {
  const data = {};
  FIELDS.forEach(f => { const v = parseFloat(document.getElementById('field-' + f).value); data[f] = isNaN(v) ? 0 : v; });
  return data;
}

function updateKPIPreview() {
  const data = getFormData();
  const m = calcMetrics(data);
  document.getElementById('kpi-roi').textContent = m.totalCost > 0 ? m.roi.toFixed(2) : '--';
  const npEl = document.getElementById('kpi-net-profit');
  npEl.textContent = m.totalCost > 0 || data.grossProfit > 0 ? '¥' + fmt(m.netProfit) : '--';
  npEl.style.color = m.netProfit >= 0 ? '#10b981' : '#ef4444';
  document.getElementById('kpi-cac').textContent = data.newCustomers > 0 ? '¥' + fmt(m.cac) : '--';
  document.getElementById('kpi-margin').textContent = data.orderAmount > 0 ? m.margin.toFixed(1) + '%' : '--';
}

async function saveRecord() {
  const month = document.getElementById('entry-month').value;
  const channel = document.getElementById('entry-channel').value;
  if (!month || !channel) { showToast('请先选择月份和渠道', 'error'); return; }
  if (!appData.records[month]) appData.records[month] = {};
  appData.records[month][channel] = getFormData();
  await saveData(appData);
  showToast('数据已保存', 'success');
}

function clearForm() {
  FIELDS.forEach(f => { document.getElementById('field-' + f).value = ''; });
  updateKPIPreview();
}

// ─── Data Overview ──────────────────────────────────────
function setupOverview() {
  document.getElementById('overview-channel-filter').addEventListener('change', renderOverviewTable);
  document.getElementById('btn-export').addEventListener('click', exportCSV);
}

function renderOverviewTable() {
  const filter = document.getElementById('overview-channel-filter').value;
  const tbody = document.getElementById('overview-tbody');
  const emptyEl = document.getElementById('overview-empty');
  const tableWrapper = document.querySelector('#tab-overview .table-wrapper');
  const months = Object.keys(appData.records).sort().reverse();
  let rows = [];

  for (const month of months) {
    for (const [channel, r] of Object.entries(appData.records[month])) {
      if (filter !== 'all' && channel !== filter) continue;
      rows.push({ month, channel, ...r, ...calcMetrics(r) });
    }
  }

  if (rows.length === 0) {
    tbody.innerHTML = '';
    emptyEl.style.display = 'block';
    tableWrapper.style.display = 'none';
    return;
  }

  emptyEl.style.display = 'none';
  tableWrapper.style.display = 'block';
  tbody.innerHTML = rows.map(r => {
    const cls = r.netProfit >= 0 ? 'cell-profit' : 'cell-loss';
    return `<tr>
      <td>${r.month}</td><td>${r.channel}</td>
      <td>¥${fmt(r.totalCost)}</td><td>¥${fmt(r.orderAmount)}</td>
      <td>¥${fmt(r.grossProfit)}</td><td class="${cls}">¥${fmt(r.netProfit)}</td>
      <td>${r.roi.toFixed(2)}</td>
      <td><button class="btn-delete-row" onclick="deleteRecord('${r.month}','${r.channel}')"><i class="ri-delete-bin-line"></i></button></td>
    </tr>`;
  }).join('');
}

window.deleteRecord = async function(month, channel) {
  if (!confirm(`删除 ${month} ${channel} 的数据？`)) return;
  if (appData.records[month]) {
    delete appData.records[month][channel];
    if (Object.keys(appData.records[month]).length === 0) delete appData.records[month];
  }
  await saveData(appData);
  renderOverviewTable();
  showToast('已删除', 'success');
};

function exportCSV() {
  const months = Object.keys(appData.records).sort();
  let csv = '\uFEFF月份,渠道,人工成本,办公成本,广告费,其他成本,总成本,企微新增,订单金额,毛利润,净利润,ROI,获客成本,毛利率\n';
  for (const month of months) {
    for (const [ch, r] of Object.entries(appData.records[month])) {
      const m = calcMetrics(r);
      csv += `${month},${ch},${r.laborCost||0},${r.officeCost||0},${r.adCost||0},${r.otherCost||0},${m.totalCost},${r.newCustomers||0},${r.orderAmount||0},${r.grossProfit||0},${m.netProfit},${m.roi.toFixed(2)},${m.cac.toFixed(2)},${m.margin.toFixed(1)}%\n`;
    }
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ROI报表_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('已导出 CSV', 'success');
}

// ─── Trend Charts ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('trends-channel').addEventListener('change', renderTrendCharts);
});

function getAggregatedData(channelFilter) {
  const months = Object.keys(appData.records).sort();
  return months.map(month => {
    let agg = { laborCost:0, officeCost:0, adCost:0, otherCost:0, newCustomers:0, orderAmount:0, grossProfit:0 };
    for (const [ch, r] of Object.entries(appData.records[month])) {
      if (channelFilter !== 'all' && ch !== channelFilter) continue;
      FIELDS.forEach(f => { agg[f] += (r[f] || 0); });
    }
    return { month, ...agg, ...calcMetrics(agg) };
  });
}

function destroyChart(key) { if (charts[key]) { charts[key].destroy(); delete charts[key]; } }

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true, pointStyleWidth: 8, font: { size: 11 } } },
    tooltip: { backgroundColor: '#1a1a2e', padding: 10, cornerRadius: 8, titleFont: { size: 12 }, bodyFont: { size: 11 },
      callbacks: { label: ctx => ctx.dataset.label + ': ¥' + (ctx.parsed.y != null ? ctx.parsed.y.toLocaleString('zh-CN',{minimumFractionDigits:2}) : '0') }
    }
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 10 } } },
    y: { grid: { color: '#f3f4f6' }, ticks: { font: { size: 10 }, callback: v => '¥' + (v/1000).toFixed(0) + 'k' } }
  }
};

function renderTrendCharts() {
  const data = getAggregatedData(document.getElementById('trends-channel').value);
  if (!data.length) return;
  const labels = data.map(d => d.month);

  destroyChart('costProfit');
  charts.costProfit = new Chart(document.getElementById('chart-cost-profit'), {
    type:'bar', data: { labels, datasets: [
      { label:'总投入', data:data.map(d=>d.totalCost), backgroundColor:'rgba(255,36,66,0.15)', borderColor:'#FF2442', borderWidth:2, borderRadius:4 },
      { label:'毛利润', data:data.map(d=>d.grossProfit), backgroundColor:'rgba(16,185,129,0.15)', borderColor:'#10b981', borderWidth:2, borderRadius:4 }
    ]}, options: chartDefaults
  });

  destroyChart('netProfit');
  charts.netProfit = new Chart(document.getElementById('chart-net-profit'), {
    type:'line', data: { labels, datasets: [{
      label:'净利润', data:data.map(d=>d.netProfit), borderColor:'#6366f1', backgroundColor:'rgba(99,102,241,0.1)',
      borderWidth:2, fill:true, tension:0.35, pointRadius:3, pointBackgroundColor:'#6366f1'
    }]}, options: { ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, ticks: { ...chartDefaults.scales.y.ticks, callback: v => (v>=0?'+':'')+'¥'+(v/1000).toFixed(0)+'k' }}}}
  });

  destroyChart('cumulative');
  let cum = 0;
  charts.cumulative = new Chart(document.getElementById('chart-cumulative'), {
    type:'line', data: { labels, datasets: [{
      label:'累计净利润', data:data.map(d => { cum += d.netProfit; return cum; }),
      borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,0.1)', borderWidth:2, fill:true, tension:0.35, pointRadius:3, pointBackgroundColor:'#f59e0b'
    }]}, options: chartDefaults
  });

  destroyChart('customers');
  charts.customers = new Chart(document.getElementById('chart-customers'), {
    type:'bar', data: { labels, datasets: [{
      label:'企微新增', data:data.map(d=>d.newCustomers), backgroundColor:'rgba(99,102,241,0.7)', borderRadius:4, borderSkipped:false
    }]}, options: { ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, ticks: { font:{size:10}, callback:v=>v+'人' }}},
      plugins: { ...chartDefaults.plugins, tooltip: { ...chartDefaults.plugins.tooltip, callbacks: { label: ctx => ctx.dataset.label+': '+ctx.parsed.y+'人' }}}
    }
  });
}

// ─── Channel Comparison ─────────────────────────────────
function populateCompareMonths() {
  const sel = document.getElementById('compare-month');
  const months = Object.keys(appData.records).sort().reverse();
  const cur = sel.value;
  sel.innerHTML = months.map(m => `<option value="${m}">${m}</option>`).join('');
  if (cur && months.includes(cur)) sel.value = cur;
  sel.onchange = renderComparisonCharts;
}

function renderComparisonCharts() {
  const month = document.getElementById('compare-month').value;
  if (!month || !appData.records[month]) return;
  const cd = appData.records[month];
  const channels = Object.keys(cd);
  const metrics = channels.map(ch => ({ channel:ch, ...cd[ch], ...calcMetrics(cd[ch]) }));
  const labels = channels;
  const bgColors = channels.map((_,i) => COLORS[i%COLORS.length]);

  destroyChart('compareRoi');
  charts.compareRoi = new Chart(document.getElementById('chart-compare-roi'), {
    type:'bar', data: { labels, datasets: [{ label:'ROI', data:metrics.map(m=>+m.roi.toFixed(2)),
      backgroundColor:bgColors.map(c=>c+'CC'), borderColor:bgColors, borderWidth:2, borderRadius:6, borderSkipped:false
    }]}, options: { ...chartDefaults, indexAxis:'y',
      scales: { x:{grid:{color:'#f3f4f6'},ticks:{font:{size:10}}}, y:{grid:{display:false},ticks:{font:{size:11}}} },
      plugins: { ...chartDefaults.plugins, tooltip: { ...chartDefaults.plugins.tooltip, callbacks: { label: ctx=>'ROI: '+ctx.parsed.x }}}
    }
  });

  destroyChart('compareCac');
  charts.compareCac = new Chart(document.getElementById('chart-compare-cac'), {
    type:'bar', data: { labels, datasets: [{ label:'获客成本', data:metrics.map(m=>+m.cac.toFixed(2)),
      backgroundColor:bgColors.map(c=>c+'CC'), borderColor:bgColors, borderWidth:2, borderRadius:6, borderSkipped:false
    }]}, options: { ...chartDefaults, indexAxis:'y',
      scales: { x:{grid:{color:'#f3f4f6'},ticks:{font:{size:10},callback:v=>'¥'+v}}, y:{grid:{display:false},ticks:{font:{size:11}}} },
      plugins: { ...chartDefaults.plugins, tooltip: { ...chartDefaults.plugins.tooltip, callbacks: { label: ctx=>'获客成本: ¥'+ctx.parsed.x.toFixed(2) }}}
    }
  });

  destroyChart('compareProfit');
  charts.compareProfit = new Chart(document.getElementById('chart-compare-profit'), {
    type:'bar', data: { labels, datasets: [{ label:'净利润', data:metrics.map(m=>m.netProfit),
      backgroundColor:metrics.map(m=>m.netProfit>=0?'#10b981CC':'#ef4444CC'),
      borderColor:metrics.map(m=>m.netProfit>=0?'#10b981':'#ef4444'), borderWidth:2, borderRadius:6, borderSkipped:false
    }]}, options: chartDefaults
  });

  destroyChart('compareCost');
  charts.compareCost = new Chart(document.getElementById('chart-compare-cost'), {
    type:'bar', data: { labels, datasets: [
      { label:'人工成本', data:metrics.map(m=>m.laborCost||0), backgroundColor:'#FF244299', borderRadius:2 },
      { label:'办公成本', data:metrics.map(m=>m.officeCost||0), backgroundColor:'#6366f199', borderRadius:2 },
      { label:'广告费', data:metrics.map(m=>m.adCost||0), backgroundColor:'#f59e0b99', borderRadius:2 },
      { label:'其他成本', data:metrics.map(m=>m.otherCost||0), backgroundColor:'#10b98199', borderRadius:2 }
    ]}, options: { ...chartDefaults, scales: { ...chartDefaults.scales, x:{...chartDefaults.scales.x,stacked:true}, y:{...chartDefaults.scales.y,stacked:true} }}
  });
}

// ─── Channel Management ─────────────────────────────────
function setupChannelManagement() {
  document.getElementById('btn-add-channel').addEventListener('click', addChannel);
  document.getElementById('new-channel-name').addEventListener('keydown', e => { if (e.key === 'Enter') addChannel(); });
  renderChannelList();
}

function renderChannelList() {
  document.getElementById('channel-list').innerHTML = appData.channels.map(ch => {
    let count = 0;
    for (const m of Object.keys(appData.records)) { if (appData.records[m][ch]) count++; }
    return `<div class="channel-item">
      <div class="channel-item-name"><span class="channel-dot"></span><span>${ch}</span></div>
      <div class="channel-item-actions">
        <span class="channel-count">${count} 条记录</span>
        <button class="btn btn-danger btn-sm" onclick="removeChannel('${ch}')"><i class="ri-delete-bin-line"></i></button>
      </div>
    </div>`;
  }).join('');
}

async function addChannel() {
  const input = document.getElementById('new-channel-name');
  const name = input.value.trim();
  if (!name) { showToast('请输入渠道名称', 'error'); return; }
  if (appData.channels.includes(name)) { showToast('渠道已存在', 'error'); return; }
  appData.channels.push(name);
  await saveData(appData);
  input.value = '';
  populateChannelSelectors();
  renderChannelList();
  showToast(`已添加「${name}」`, 'success');
}

window.removeChannel = async function(name) {
  if (!confirm(`删除渠道「${name}」及其所有数据？`)) return;
  appData.channels = appData.channels.filter(c => c !== name);
  for (const m of Object.keys(appData.records)) {
    delete appData.records[m][name];
    if (Object.keys(appData.records[m]).length === 0) delete appData.records[m];
  }
  await saveData(appData);
  populateChannelSelectors();
  renderChannelList();
  showToast(`已删除「${name}」`, 'success');
};

