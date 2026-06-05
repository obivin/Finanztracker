
const $ = s => document.querySelector(s);
const app = $('#app');
const eur = n => Number(n || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
const today = () => new Date().toISOString().slice(0, 10);
const monthKey = d => (d || '').slice(0, 7);
const thisMonth = () => today().slice(0, 7);
const storeKey = 'finanztracker_v2_accountId';

const cycles = {
  monthly: ['Monatlich', 1],
  quarterly: ['Vierteljährlich', 1 / 3],
  yearly: ['Jährlich', 1 / 12]
};

const expenseCategories = [
  ['Essen', '🍴'], ['Shopping', '🛍️'], ['Auto', '🚗'], ['Freizeit', '🎮'],
  ['Gesundheit', '➕'], ['Bildung', '📚'], ['Haushalt', '🏠'], ['Kleidung', '👕'],
  ['Streaming', '📺'], ['Musik', '🎵'], ['Telekommunikation', '📱'], ['Sport', '🏋️'],
  ['Versicherung', '🛡️'], ['Miete', '🏡'], ['Software', '💻'], ['Energie', '⚡'], ['Sonstiges', '☷']
];
const incomeCategories = [['Gehalt', '⬇️'], ['Einnahme', '💶'], ['Nebenjob', '💼'], ['Geschenk', '🎁'], ['Verkauf', '🏷️'], ['Sonstiges', '☷']];
const transferCategory = ['Umbuchung', '↔️'];
const colors = ['blue', 'green', 'orange', 'purple', 'red', 'pink', 'teal'];

let tab = 'overview';
let analysisTab = 0;
let state = load();
migrate();
processDueRecurring();
save();

function defaults() {
  const a1 = uid(), a2 = uid();
  return {
    accounts: [
      { id: a1, name: 'Giro', startBalance: 100, icon: '💳', color: 'blue', includeInTotal: true },
      { id: a2, name: 'Spar', startBalance: 0, icon: '🏦', color: 'purple', includeInTotal: true }
    ],
    transactions: [],
    recurring: [
      { id: uid(), name: 'Gehalt', amount: 800, category: 'Gehalt', accountId: a1, targetAccountId: '', billingCycle: 'monthly', nextDueDate: today(), icon: '⬇️', note: '', isActive: true, type: 'income', includeInMonthly: true },
      { id: uid(), name: 'Netflix', amount: 12.99, category: 'Streaming', accountId: a1, targetAccountId: '', billingCycle: 'monthly', nextDueDate: today(), icon: '📺', note: '', isActive: true, type: 'expense', includeInMonthly: true }
    ],
    goals: [{ id: uid(), name: 'Urlaub', targetAmount: 1500, savedAmount: 0, accountId: a2, icon: '✈️', color: 'orange', targetDate: '', note: '' }],
    budgets: [{ id: uid(), category: 'Essen', limit: 200, icon: '🍴', color: 'orange' }],
    categories: expenseCategories.map(x => x[0]).filter((v, i, a) => a.indexOf(v) === i),
    lastRecurringRun: {}
  };
}
function load() { try { return JSON.parse(localStorage.getItem(storeKey)) || defaults(); } catch { return defaults(); } }
function save() { localStorage.setItem(storeKey, JSON.stringify(state)); }
function migrate() {
  state.accounts ||= []; state.transactions ||= []; state.recurring ||= []; state.goals ||= []; state.budgets ||= []; state.lastRecurringRun ||= {};
  state.accounts.forEach(a => { if (a.includeInTotal === undefined) a.includeInTotal = true; if (a.startBalance === undefined) a.startBalance = a.balance || 0; });
  state.recurring.forEach(r => { if (r.includeInMonthly === undefined) r.includeInMonthly = true; if (r.includeInAnalysis === undefined) r.includeInAnalysis = true; if (!r.type) r.type = r.isIncome ? 'income' : 'expense'; });
  state.transactions.forEach(t => { if (t.includeInMonthly === undefined) t.includeInMonthly = true; if (t.includeInAnalysis === undefined) t.includeInAnalysis = true; if (!t.type) t.type = t.isTransfer ? 'transfer' : t.isIncome ? 'income' : 'expense'; });
  state.categories = [...new Set([...(state.categories || []), ...expenseCategories.map(x => x[0])])];
}

function acc(id) { return state.accounts.find(a => a.id === id); }
function accName(id) { return acc(id)?.name || 'Konto gelöscht'; }
function catIcon(cat) { return [...expenseCategories, ...incomeCategories, transferCategory].find(x => x[0] === cat)?.[1] || '☷'; }
function iconForType(type, cat) { if (type === 'transfer') return '↔️'; if (type === 'income') return catIcon(cat || 'Gehalt'); return catIcon(cat || 'Essen'); }
function options(arr, selected) { return arr.map(([name, icon]) => `<option value="${esc(name)}" ${name === selected ? 'selected' : ''}>${icon} ${esc(name)}</option>`).join(''); }
function optionAccounts(selected) { return state.accounts.map(a => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.name)}</option>`).join(''); }
function esc(s='') { return String(s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

function advanceDate(date, cycle) {
  const d = new Date(date + 'T00:00:00');
  if (cycle === 'monthly') d.setMonth(d.getMonth() + 1);
  if (cycle === 'quarterly') d.setMonth(d.getMonth() + 3);
  if (cycle === 'yearly') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}
function recurringTxKey(r, due) { return r.id + '_' + due; }
function processDueRecurring() {
  let changed = false, now = today();
  state.recurring.forEach(r => {
    let guard = 0;
    while (r.isActive && r.nextDueDate && r.nextDueDate <= now && guard < 24) {
      const due = r.nextDueDate, key = recurringTxKey(r, due);
      if (!state.lastRecurringRun[key]) {
        const tx = {
          id: uid(), recurringId: r.id, autoFromRecurring: true,
          name: r.name, amount: +r.amount, category: r.type === 'transfer' ? 'Umbuchung' : r.category,
          accountId: r.accountId, targetAccountId: r.targetAccountId || '',
          date: due, note: 'Automatisch durch Vertrag',
          isIncome: r.type === 'income', isTransfer: r.type === 'transfer', type: r.type,
          includeInMonthly: r.includeInMonthly !== false,
          includeInAnalysis: r.includeInAnalysis !== false
        };
        state.transactions.push(tx);
        state.lastRecurringRun[key] = tx.id;
        changed = true;
      }
      r.lastBookedDate = due;
      r.nextDueDate = advanceDate(due, r.billingCycle);
      changed = true; guard++;
    }
  });
  if (changed) save();
}
function syncRecurringTransactions(r) {
  state.transactions.filter(t => t.recurringId === r.id).forEach(t => {
    t.name = r.name; t.amount = +r.amount; t.category = r.type === 'transfer' ? 'Umbuchung' : r.category;
    t.accountId = r.accountId; t.targetAccountId = r.targetAccountId || '';
    t.note = 'Automatisch durch Vertrag'; t.isIncome = r.type === 'income'; t.isTransfer = r.type === 'transfer'; t.type = r.type;
    t.includeInMonthly = r.includeInMonthly !== false;
    t.includeInAnalysis = r.includeInAnalysis !== false;
    if (r.lastBookedDate) t.date = r.lastBookedDate;
  });
}
function transactionDelta(accountId) {
  let d = 0;
  state.transactions.forEach(t => {
    if (t.isTransfer || t.type === 'transfer') {
      if (t.accountId === accountId) d -= +t.amount;
      if (t.targetAccountId === accountId) d += +t.amount;
    } else if (t.accountId === accountId) {
      d += (t.isIncome || t.type === 'income') ? +t.amount : -+t.amount;
    }
  });
  return d;
}
function accountBalance(id) { const a = acc(id); return a ? (+a.startBalance || 0) + transactionDelta(id) : 0; }
function totalBalance() { return state.accounts.filter(a => a.includeInTotal !== false).reduce((s, a) => s + accountBalance(a.id), 0); }
function monthTx(onlyIncluded = true, ym = thisMonth()) { return state.transactions.filter(t => monthKey(t.date) === ym && (!onlyIncluded || t.includeInMonthly !== false)); }
function analysisTx(ym = thisMonth()) { return state.transactions.filter(t => monthKey(t.date) === ym && t.includeInAnalysis !== false); }
function monthlyIncome() { return monthTx(true).filter(t => (t.isIncome || t.type === 'income') && !(t.isTransfer || t.type === 'transfer')).reduce((s, t) => s + +t.amount, 0); }
function monthlyExpenses() { return monthTx(true).filter(t => !(t.isIncome || t.type === 'income') && !(t.isTransfer || t.type === 'transfer')).reduce((s, t) => s + +t.amount, 0); }
function monthlyTransfers() { return monthTx(true).filter(t => t.isTransfer || t.type === 'transfer').reduce((s, t) => s + +t.amount, 0); }
function spentInCategory(c, ym = thisMonth()) { return analysisTx(ym).filter(t => !(t.isIncome || t.type === 'income') && !(t.isTransfer || t.type === 'transfer') && t.category === c).reduce((s, t) => s + +t.amount, 0); }
function categoryTotals() { return [...new Set([...state.categories, ...state.transactions.map(t => t.category).filter(Boolean)])].map(c => ({ category: c, total: spentInCategory(c), icon: catIcon(c) })).filter(x => x.total > 0).sort((a, b) => b.total - a.total); }
function last6() {
  const out = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const ym = d.toISOString().slice(0, 7), name = d.toLocaleString('de-DE', { month: 'short' });
    const txs = monthTx(true, ym);
    const inc = txs.filter(t => (t.isIncome || t.type === 'income') && !(t.isTransfer || t.type === 'transfer')).reduce((s, t) => s + +t.amount, 0);
    const exp = txs.filter(t => !(t.isIncome || t.type === 'income') && !(t.isTransfer || t.type === 'transfer')).reduce((s, t) => s + +t.amount, 0);
    const tr = txs.filter(t => t.isTransfer || t.type === 'transfer').reduce((s, t) => s + +t.amount, 0);
    out.push({ month: name, income: inc, expenses: exp, transfers: tr, balance: inc - exp - tr });
  }
  return out;
}

function nav() { return `<div class="tabs">${[['overview','🏠','Übersicht'],['recurring','📄','Verträge'],['analysis','◔','Analyse'],['savings','▣','Sparen'],['budgets','☷','Budgets']].map(x => `<button class="tab ${tab===x[0]?'active':''}" onclick="tab='${x[0]}';render()"><span>${x[1]}</span>${x[2]}</button>`).join('')}</div>`; }
function shell(content, title='Übersicht') { app.innerHTML = `<div class="wrap"><div class="top"><div class="title">${title}</div>${tab==='analysis'?'': '<button class="plus" onclick="openAddMenu()">+</button>'}</div>${content}</div>${nav()}`; if (tab === 'analysis') setTimeout(drawCharts, 0); }
function render() { processDueRecurring(); closeMenuOnly(); if (tab === 'overview') overview(); else if (tab === 'recurring') recurring(); else if (tab === 'analysis') analysis(); else if (tab === 'savings') savings(); else budgets(); }
function closeMenuOnly(){ const m=$('#addMenu'); if(m)m.remove(); }
function openAddMenu() {
  closeMenuOnly();
  if (tab === 'analysis') return;
  if (tab === 'overview') { openModal('tx'); return; }
  const menus = {
    overview: [
      ['🍴 Ausgabe', 'z. B. Einkauf, Essen, Benzin', "openModal('tx',null,'expense')"],
      ['⬇️ Einnahme', 'z. B. Gehalt oder Geschenk', "openModal('tx',null,'income')"],
      ['↔️ Umbuchung', 'Geld von einem Konto auf ein anderes', "openModal('tx',null,'transfer')"]
    ],
    recurring: [['📄 Vertrag', 'Wiederkehrende Einnahme, Ausgabe oder Umbuchung', "openModal('rec')"]],
    savings: [['⭐ Sparziel', 'Mit Konto verknüpfen', "openModal('goal')"]],
    budgets: [['☷ Budget', 'Limit für eine Kategorie', "openModal('budget')"]]
  };
  const items = menus[tab] || menus.overview;
  const m = document.createElement('div'); m.id = 'addMenu'; m.className = 'modal show';
  m.innerHTML = `<div class="sheet"><div class="sheetHead"><button class="link" onclick="closeMenuOnly()">Abbrechen</button><h2>Neu erstellen</h2><span></span></div><div class="menuGrid">
    ${items.map(i => `<button class="menuBtn" onclick="${i[2]}">${i[0]}<small>${i[1]}</small></button>`).join('')}
  </div></div>`;
  document.body.appendChild(m);
}


function overview() {
  const inc = monthlyIncome(), exp = monthlyExpenses(), tr = monthlyTransfers(), rem = inc - exp - tr;
  const remainText = rem >= 0 ? `● Noch ${eur(rem)} diesen Monat verfügbar` : `● Diesen Monat überzogen um ${eur(Math.abs(rem))}`;
  shell(`<div class="hero"><h2>Gesamtvermögen</h2><div class="balance">${eur(totalBalance())}</div><div class="stats"><div class="stat"><span>Monatliche Einnahmen</span><b>${eur(inc)}</b></div><div class="stat red"><span>Monatliche Ausgaben</span><b>${eur(exp)}</b></div><div class="stat purple"><span>Monatliche Umbuchungen</span><b>${eur(tr)}</b></div></div><div class="${rem>=0?'remain':'remain danger'}">${remainText}</div></div>
  <div class="card"><div class="head"><h3>Konten</h3><button class="link" onclick="openManage('acc')">Bearbeiten</button></div><div class="allAccountsHint">Alle Konten werden angezeigt. Nur aktivierte Konten zählen oben ins Gesamtvermögen.</div>${state.accounts.map(a => row(a.icon, a.name, `${a.includeInTotal!==false?'Im Gesamtvermögen':'Nicht im Gesamtvermögen'}`, eur(accountBalance(a.id)), a.color || '', `openModal('acc','${a.id}')`)).join('') || '<div class="empty">Keine Konten</div>'}</div>
  <div class="card"><div class="head"><h3>Letzte Buchungen</h3></div>${state.transactions.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,10).map(txRow).join('') || '<div class="empty">Keine Buchungen</div>'}<button class="link" onclick="openManage('tx')">Alle Buchungen anzeigen</button></div>`, 'Übersicht');
}
function row(icon, title, sub, amount, cls='', click='') { return `<div class="row" ${click ? `onclick="${click}"` : ''}><div class="ico ${cls}">${icon}</div><div class="main"><b>${esc(title)}</b><div class="sub">${esc(sub)}</div></div><div class="amount">${amount}</div></div>`; }
function txRow(t) { const type = t.isTransfer || t.type === 'transfer' ? 'transfer' : (t.isIncome || t.type === 'income') ? 'income' : 'expense'; const sub = type === 'transfer' ? `${accName(t.accountId)} → ${accName(t.targetAccountId)} • ${fmtDate(t.date)}` : `${t.category} • ${accName(t.accountId)} • ${fmtDate(t.date)}`; const sign = type === 'transfer' ? '↔ ' : type === 'income' ? '+' : '-'; const badge = t.includeInMonthly === false ? '<small>Nicht in Monatswerten</small>' : ''; return row(iconForType(type, t.category), t.name, sub, sign + eur(t.amount) + badge, type === 'income' ? 'green' : type === 'transfer' ? 'purple' : 'orange', `openModal('tx','${t.id}')`); }
function fmtDate(d){ return d ? new Date(d+'T00:00:00').toLocaleDateString('de-DE') : ''; }

function recurring() {
  const groups = [['income','Einnahmen'], ['expense','Ausgaben'], ['transfer','Umbuchungen']];
  const fixed = state.recurring.filter(r => r.isActive && r.type === 'expense' && r.includeInMonthly !== false).reduce((s,r)=>s+(+r.amount)*cycles[r.billingCycle][1],0);
  shell(`<div class="card"><div class="head"><div><div class="sub">Monatliche Fixkosten</div><h3>${eur(fixed)}</h3></div><div><div class="sub">Jährlich</div><h3>${eur(fixed*12)}</h3></div></div></div>${groups.map(g => { const arr = state.recurring.filter(r => r.type === g[0] && r.isActive); return arr.length ? `<div class="listTitle">${g[1]}</div><div class="card">${arr.map(recRow).join('')}</div>` : ''; }).join('')}${state.recurring.some(r=>!r.isActive) ? `<div class="listTitle">Pausiert</div><div class="card">${state.recurring.filter(r=>!r.isActive).map(recRow).join('')}</div>` : ''}`, 'Verträge');
}
function recRow(r) { const sub = `${cycles[r.billingCycle]?.[0] || 'Monatlich'} • ${accName(r.accountId)} • fällig ${fmtDate(r.nextDueDate)}${r.includeInMonthly===false?' • nicht in Monatswerten':''}${r.includeInAnalysis===false?' • nicht in Analyse':''}`; const val = (r.type === 'income' ? '+' : r.type === 'transfer' ? '↔ ' : '-') + eur(r.amount); return row(r.icon || iconForType(r.type, r.category), r.name, sub, val, r.type === 'income' ? 'green' : r.type === 'transfer' ? 'purple' : 'red', `openModal('rec','${r.id}')`); }

function analysis() {
  const cats = categoryTotals();
  const total = cats.reduce((s,c)=>s+c.total,0);
  const bars = cats.map(c => {
    const w = total ? Math.max(5, c.total / total * 100) : 0;
    return `<div class="barRow"><div class="barLabel"><span>${c.icon}</span><b>${esc(c.category)}</b></div><div class="barTrack"><div class="barFill" style="width:${w}%"></div></div><strong>${eur(c.total)}</strong></div>`;
  }).join('') || '<div class="empty">Keine Daten</div>';
  const months = last6();
  const content = analysisTab === 0
    ? `<div class="card analysisHero"><div class="head"><h3>Ausgaben nach Kategorie</h3></div><canvas id="donut"></canvas></div><div class="card"><div class="head"><h3>Balkendiagramm</h3></div>${bars}</div>`
    : analysisTab === 1
      ? `<div class="card"><div class="head"><h3>Einnahmen vs. Ausgaben</h3></div><canvas id="bars"></canvas><div class="legend"><span>🟢 Einnahmen</span><span>🔴 Ausgaben</span><span>🟣 Umbuchungen</span></div></div>`
      : `<div class="card"><div class="head"><h3>Saldo-Entwicklung</h3></div><canvas id="line"></canvas></div><div class="card"><div class="head"><h3>Monatsübersicht</h3></div>${months.map(x => `<div class="row"><div class="main"><b>${x.month}</b></div><div class="amount"><small>+${eur(x.income)} / -${eur(x.expenses)} / ↔ ${eur(x.transfers)}</small>${x.balance>=0?'+':''}${eur(x.balance)}</div></div>`).join('')}</div>`;
  shell(`<div class="seg"><button class="${analysisTab===0?'active':''}" onclick="analysisTab=0;render()">Kategorien</button><button class="${analysisTab===1?'active':''}" onclick="analysisTab=1;render()">Verlauf</button><button class="${analysisTab===2?'active':''}" onclick="analysisTab=2;render()">Saldo</button></div>${content}`, 'Analyse');
}


function savings() { const saved = state.goals.reduce((s,g)=>s + +g.savedAmount,0), target = state.goals.reduce((s,g)=>s + +g.targetAmount,0); shell(`<div class="card"><div class="head"><div><div class="sub">Gesamt gespart</div><h3>${eur(saved)}</h3></div><div><div class="sub">Gesamtziel</div><h3>${eur(target)}</h3></div></div><div class="progress"><div class="bar green" style="width:${target?Math.min(saved/target*100,100):0}%"></div></div></div><div class="listTitle">Meine Ziele</div><div class="card">${state.goals.map(goalRow).join('') || '<div class="empty">Keine Sparziele</div>'}</div>`, 'Sparen'); }
function goalRow(g){ const p = g.targetAmount ? Math.min(g.savedAmount/g.targetAmount,1) : 0; return `<div class="row" onclick="openModal('goal','${g.id}')"><div class="ico ${g.color||''}">${g.icon||'⭐'}</div><div class="main"><b>${esc(g.name)}</b><div class="sub">${accName(g.accountId)} • ${Math.round(p*100)}%</div><div class="progress"><div class="bar green" style="width:${p*100}%"></div></div></div><div class="amount">${eur(g.savedAmount)}<small>Ziel: ${eur(g.targetAmount)}</small></div></div>`; }
function budgets(){ const totalLimit=state.budgets.reduce((s,b)=>s+ +b.limit,0), totalSpent=state.budgets.reduce((s,b)=>s+spentInCategory(b.category),0); shell(`<div class="card"><div class="head"><div><div class="sub">Ausgegeben</div><h3>${eur(totalSpent)}</h3></div><div><div class="sub">Budget gesamt</div><h3>${eur(totalLimit)}</h3></div></div><div class="progress"><div class="bar ${totalSpent>totalLimit?'red':''}" style="width:${totalLimit?Math.min(totalSpent/totalLimit*100,100):0}%"></div></div></div><div class="listTitle">Kategorien</div><div class="card">${state.budgets.map(budgetRow).join('') || '<div class="empty">Keine Budgets</div>'}</div>`, 'Budgets'); }
function budgetRow(b){ const spent=spentInCategory(b.category), p=b.limit?Math.min(spent/b.limit,1):0, over=spent>b.limit; return `<div class="row" onclick="openModal('budget','${b.id}')"><div class="ico ${b.color||''}">${b.icon||catIcon(b.category)}</div><div class="main"><b>${esc(b.category)}</b><div class="sub">${over?'Überschritten um '+eur(spent-b.limit):'Noch '+eur(b.limit-spent)+' übrig'}</div><div class="progress"><div class="bar ${over?'red':''}" style="width:${p*100}%"></div></div></div><div class="amount">${eur(spent)}<small>/ ${eur(b.limit)}</small></div></div>`; }

function openManage(kind){
  const list = kind === 'tx' ? state.transactions.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')) : state.accounts;
  const title = kind === 'tx' ? 'Alle Buchungen' : 'Konten verwalten';
  const body = list.map(x => kind === 'tx' ? txRow(x) : row(x.icon, x.name, x.includeInTotal!==false?'Im Gesamtvermögen':'Nicht im Gesamtvermögen', eur(accountBalance(x.id)), x.color||'', `openModal('acc','${x.id}')`)).join('') || '<div class="empty">Keine Einträge</div>';
  document.querySelectorAll('#modal').forEach(x=>x.remove());
  const m=document.createElement('div');m.id='modal';m.className='modal show';m.innerHTML=`<div class="sheet"><div class="sheetHead"><button class="link" onclick="closeModal()">Schließen</button><h2>${title}</h2><span></span></div>${body}</div>`;document.body.appendChild(m);
}

function emptyFor(type, preset='expense'){
  const a0=state.accounts[0]?.id||'', a1=state.accounts[1]?.id||a0;
  if(type==='tx') return {id:uid(), type:preset, isIncome:preset==='income', isTransfer:preset==='transfer', name:'', amount:'', category:preset==='income'?'Gehalt':preset==='transfer'?'Umbuchung':'Essen', accountId:a0, targetAccountId:a1, date:today(), note:'', includeInMonthly:true, includeInAnalysis:true};
  if(type==='rec') return {id:uid(), type:'expense', name:'', amount:'', category:'Streaming', accountId:a0, targetAccountId:a1, billingCycle:'monthly', nextDueDate:today(), icon:'📄', note:'', isActive:true, includeInMonthly:true, includeInAnalysis:true};
  if(type==='acc') return {id:uid(), name:'', startBalance:0, icon:'💳', color:'blue', includeInTotal:true};
  if(type==='goal') return {id:uid(), name:'', targetAmount:'', savedAmount:'', accountId:a0, icon:'⭐', color:'blue', targetDate:'', note:''};
  return {id:uid(), category:'Essen', limit:'', icon:'☷', color:'blue'};
}
function getArr(type){ return type==='tx'?state.transactions:type==='rec'?state.recurring:type==='acc'?state.accounts:type==='goal'?state.goals:state.budgets; }
function openModal(type, id=null, preset='expense'){
  closeMenuOnly(); document.querySelectorAll('#modal').forEach(x=>x.remove());
  const arr=getArr(type), is=!!id, obj=is ? JSON.parse(JSON.stringify(arr.find(x=>x.id===id))) : emptyFor(type,preset);
  let title = ({tx:'Buchung', rec:'Vertrag', acc:'Konto', goal:'Sparziel', budget:'Budget'}[type] || 'Eintrag');
  const m=document.createElement('div');m.id='modal';m.className='modal show';m.innerHTML=`<div class="sheet"><div class="sheetHead"><button type="button" class="link" onclick="closeModal()">Abbrechen</button><h2>${is?title+' bearbeiten':'Neuer '+title}</h2><span></span></div><div class="form">${formHtml(type,obj)}</div><div class="actions">${is?`<button type="button" class="btn delete" onclick="delItem('${type}','${id}')">Löschen</button>`:''}<button type="button" class="btn secondary" onclick="closeModal()">Abbrechen</button><button type="button" class="btn" onclick="saveItem('${type}','${id||''}')">Speichern</button></div></div>`;document.body.appendChild(m); updateVisibility();
}
function formHtml(type,o){
  if(type==='tx') return `<div class="grid2"><div class="field"><label>Art</label><select id="f_type" onchange="updateVisibility()"><option value="expense" ${o.type==='expense'?'selected':''}>Ausgabe</option><option value="income" ${o.type==='income'?'selected':''}>Einnahme</option><option value="transfer" ${o.type==='transfer'?'selected':''}>Umbuchung</option></select></div><div class="field"><label>Datum</label><input id="f_date" type="date" value="${o.date||today()}"></div></div><div class="field"><label>Name</label><input id="f_name" value="${esc(o.name||'')}"></div><div class="grid2"><div class="field"><label>Betrag</label><input id="f_amount" type="number" step="0.01" value="${o.amount||''}"></div><div class="field catField"><label>Kategorie</label><select id="f_cat" data-val="${esc(o.category)}"></select></div></div><div class="grid2"><div class="field"><label id="accountLabel">Konto</label><select id="f_acc">${optionAccounts(o.accountId)}</select></div><div class="field targetField"><label>Zielkonto</label><select id="f_tacc">${optionAccounts(o.targetAccountId)}</select></div></div><div class="field"><label>Notiz</label><textarea id="f_note">${esc(o.note||'')}</textarea></div>`;
  if(type==='rec') return `<div class="grid2"><div class="field"><label>Art</label><select id="f_type" onchange="updateVisibility()"><option value="expense" ${o.type==='expense'?'selected':''}>Ausgabe</option><option value="income" ${o.type==='income'?'selected':''}>Einnahme</option><option value="transfer" ${o.type==='transfer'?'selected':''}>Umbuchung</option></select></div><div class="field"><label>Rhythmus</label><select id="f_cycle"><option value="monthly" ${o.billingCycle==='monthly'?'selected':''}>Monatlich</option><option value="quarterly" ${o.billingCycle==='quarterly'?'selected':''}>Vierteljährlich</option><option value="yearly" ${o.billingCycle==='yearly'?'selected':''}>Jährlich</option></select></div></div><div class="field"><label>Name</label><input id="f_name" value="${esc(o.name||'')}"></div><div class="grid2"><div class="field"><label>Betrag</label><input id="f_amount" type="number" step="0.01" value="${o.amount||''}"></div><div class="field catField"><label>Kategorie</label><select id="f_cat" data-val="${esc(o.category)}"></select></div></div><div class="grid2"><div class="field"><label id="accountLabel">Konto</label><select id="f_acc">${optionAccounts(o.accountId)}</select></div><div class="field targetField"><label>Zielkonto</label><select id="f_tacc">${optionAccounts(o.targetAccountId)}</select></div></div><div class="grid2"><div class="field"><label>Nächste Fälligkeit</label><input id="f_date" type="date" value="${o.nextDueDate||today()}"></div><div class="field"><label>Status</label><select id="f_active"><option value="true" ${o.isActive!==false?'selected':''}>Aktiv</option><option value="false" ${o.isActive===false?'selected':''}>Pausiert</option></select></div></div><label class="switchLine"><input id="f_includeMonthly" type="checkbox" ${o.includeInMonthly!==false?'checked':''}> In Monatsübersicht berücksichtigen</label><label class="switchLine"><input id="f_includeAnalysis" type="checkbox" ${o.includeInAnalysis!==false?'checked':''}> In Analyse berücksichtigen</label><div class="field"><label>Symbol</label><input id="f_icon" value="${esc(o.icon||'📄')}"></div><div class="field"><label>Notiz</label><textarea id="f_note">${esc(o.note||'')}</textarea></div>`;
  if(type==='acc') return `<div class="field"><label>Name</label><input id="f_name" value="${esc(o.name||'')}"></div><div class="grid2"><div class="field"><label>Kontostand</label><input id="f_amount" type="number" step="0.01" value="${o.id&&acc(o.id)?accountBalance(o.id):(o.startBalance||'')}"></div><div class="field"><label>Symbol</label><input id="f_icon" value="${esc(o.icon||'💳')}"></div></div><div class="field"><label>Farbe</label><select id="f_color">${colors.map(c=>`<option value="${c}" ${o.color===c?'selected':''}>${c}</option>`).join('')}</select></div><label class="switchLine"><input id="f_include" type="checkbox" ${o.includeInTotal!==false?'checked':''}> Im Gesamtvermögen anzeigen</label>`;
  if(type==='goal') return `<div class="field"><label>Name</label><input id="f_name" value="${esc(o.name||'')}"></div><div class="grid2"><div class="field"><label>Zielbetrag</label><input id="f_target" type="number" step="0.01" value="${o.targetAmount||''}"></div><div class="field"><label>Gespart</label><input id="f_saved" type="number" step="0.01" value="${o.savedAmount||''}"></div></div><div class="grid2"><div class="field"><label>Konto</label><select id="f_acc">${optionAccounts(o.accountId)}</select></div><div class="field"><label>Zieldatum</label><input id="f_date" type="date" value="${o.targetDate||''}"></div></div><div class="grid2"><div class="field"><label>Symbol</label><input id="f_icon" value="${esc(o.icon||'⭐')}"></div><div class="field"><label>Farbe</label><select id="f_color">${colors.map(c=>`<option value="${c}" ${o.color===c?'selected':''}>${c}</option>`).join('')}</select></div></div><div class="field"><label>Notiz</label><textarea id="f_note">${esc(o.note||'')}</textarea></div>`;
  return `<div class="grid2"><div class="field"><label>Kategorie</label><select id="f_cat">${options(expenseCategories, o.category||'Essen')}</select></div><div class="field"><label>Limit</label><input id="f_amount" type="number" step="0.01" value="${o.limit||''}"></div></div><div class="grid2"><div class="field"><label>Symbol</label><input id="f_icon" value="${esc(o.icon||catIcon(o.category)||'☷')}"></div><div class="field"><label>Farbe</label><select id="f_color">${colors.map(c=>`<option value="${c}" ${o.color===c?'selected':''}>${c}</option>`).join('')}</select></div></div>`;
}
function updateVisibility(){
  const type = $('#f_type')?.value;
  if(!type) return;
  const cat = $('#f_cat');
  if(cat){ const cur = cat.dataset.val || cat.value; let arr = type === 'income' ? incomeCategories : type === 'transfer' ? [transferCategory] : expenseCategories; cat.innerHTML = options(arr, arr.some(x=>x[0]===cur)?cur:arr[0][0]); cat.dataset.val = ''; }
  document.querySelectorAll('.targetField').forEach(el => el.classList.toggle('selectHidden', type !== 'transfer'));
  document.querySelectorAll('.catField').forEach(el => el.classList.toggle('selectHidden', type === 'transfer'));
  const lab = $('#accountLabel'); if(lab) lab.textContent = type === 'transfer' ? 'Von Konto' : 'Konto';
}
function closeModal(){ document.querySelectorAll('#modal,#addMenu').forEach(x=>x.remove()); render(); }
function val(id){ return $('#'+id)?.value; }
function saveItem(type,id){
  const arr=getArr(type), is=!!id, o=is ? arr.find(x=>x.id===id) : {id:uid()}; if(!o)return;
  if(type==='tx'){
    const ty=val('f_type'); Object.assign(o,{type:ty,name:val('f_name')|| (ty==='income'?'Einnahme':ty==='transfer'?'Umbuchung':'Ausgabe'),amount:+val('f_amount')||0,category:ty==='transfer'?'Umbuchung':val('f_cat'),accountId:val('f_acc'),targetAccountId:ty==='transfer'?val('f_tacc'):'',date:val('f_date'),note:val('f_note')||'',isIncome:ty==='income',isTransfer:ty==='transfer',includeInMonthly:true,includeInAnalysis:true});
  }
  if(type==='rec'){
    const ty=val('f_type'); const oldDate=o.lastBookedDate;
    Object.assign(o,{type:ty,name:val('f_name')||'Vertrag',amount:+val('f_amount')||0,category:ty==='transfer'?'Umbuchung':val('f_cat'),accountId:val('f_acc'),targetAccountId:ty==='transfer'?val('f_tacc'):'',billingCycle:val('f_cycle'),nextDueDate:val('f_date'),icon:val('f_icon')||iconForType(ty,val('f_cat')),note:val('f_note')||'',isActive:val('f_active')==='true',includeInMonthly:true,includeInAnalysis:true});
    if (!o.lastBookedDate || oldDate === o.lastBookedDate) o.lastBookedDate = val('f_date');
    syncRecurringTransactions(o);
  }
  if(type==='acc'){
    const desired=+val('f_amount')||0; Object.assign(o,{name:val('f_name')||'Konto',startBalance:desired-transactionDelta(o.id),icon:val('f_icon')||'💳',color:val('f_color'),includeInTotal:$('#f_include')?.checked!==false});
  }
  if(type==='goal') Object.assign(o,{name:val('f_name')||'Sparziel',targetAmount:+val('f_target')||0,savedAmount:+val('f_saved')||0,accountId:val('f_acc'),icon:val('f_icon')||'⭐',color:val('f_color'),targetDate:val('f_date')||'',note:val('f_note')||''});
  if(type==='budget') Object.assign(o,{category:val('f_cat'),limit:+val('f_amount')||0,icon:val('f_icon')||catIcon(val('f_cat')),color:val('f_color')});
  if(!is) arr.push(o); save(); closeModal();
}
function delItem(type,id){ if(!confirm('Wirklich löschen?'))return; const map={tx:'transactions',rec:'recurring',acc:'accounts',goal:'goals',budget:'budgets'}; state[map[type]]=state[map[type]].filter(x=>x.id!==id); if(type==='rec'){ state.transactions=state.transactions.filter(t=>t.recurringId!==id); Object.keys(state.lastRecurringRun).forEach(k=>{if(k.startsWith(id+'_')) delete state.lastRecurringRun[k];}); } save(); closeModal(); }

function setupCanvas(canvas){ const dpr=devicePixelRatio||1,w=canvas.clientWidth,h=260;canvas.width=w*dpr;canvas.height=h*dpr;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);return{ctx,w,h}; }
function drawCharts(){ if($('#donut'))drawDonut($('#donut'),categoryTotals()); if($('#bars'))drawBars($('#bars'),last6()); if($('#line'))drawLine($('#line'),last6()); }
function drawDonut(canvas,cats){
  const {ctx,w,h}=setupCanvas(canvas), sum=cats.reduce((a,b)=>a+b.total,0);
  const cols=['#625cf0','#168df2','#66d1cc','#ff9500','#ff453a','#af7cff','#34d567','#d8ad8b'];
  ctx.clearRect(0,0,w,h);
  const cx=w/2, cy=h/2+4, r=Math.min(w,h)*0.34, inner=r*0.58;
  if(!sum){ctx.fillStyle='#aaa';ctx.textAlign='center';ctx.font='18px -apple-system';ctx.fillText('Keine Daten',cx,cy);return;}
  let ang=-Math.PI/2;
  cats.forEach((c,i)=>{
    const a=c.total/sum*Math.PI*2, gap=0.018;
    ctx.beginPath(); ctx.arc(cx,cy,r,ang+gap,ang+a-gap); ctx.arc(cx,cy,inner,ang+a-gap,ang+gap,true); ctx.closePath();
    ctx.fillStyle=cols[i%cols.length]; ctx.fill();
    const mid=ang+a/2, ix=cx+Math.cos(mid)*(r+18), iy=cy+Math.sin(mid)*(r+18);
    ctx.beginPath(); ctx.arc(ix,iy,22,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill();
    ctx.fillStyle='#222'; ctx.font='22px -apple-system'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(c.icon,ix,iy+1);
    ang+=a;
  });
  ctx.fillStyle='#fff'; ctx.font='bold 34px -apple-system'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(eur(sum).replace(',00',''),cx,cy-8);
  ctx.fillStyle='#aaa'; ctx.font='bold 18px -apple-system'; ctx.fillText(new Date().toLocaleString('de-DE',{month:'long',year:'numeric'}),cx,cy+28);
}
function drawBars(canvas,data){ const {ctx,w,h}=setupCanvas(canvas),max=Math.max(...data.map(d=>Math.max(d.income,d.expenses,d.transfers)),1),bw=w/data.length/4; ctx.clearRect(0,0,w,h);data.forEach((d,i)=>{let x=i*w/data.length+w/data.length/2;ctx.fillStyle='#34d567';ctx.fillRect(x-bw*1.5,h-30-d.income/max*(h-55),bw,d.income/max*(h-55));ctx.fillStyle='#ff4b55';ctx.fillRect(x-bw/2,h-30-d.expenses/max*(h-55),bw,d.expenses/max*(h-55));ctx.fillStyle='#af7cff';ctx.fillRect(x+bw/2,h-30-d.transfers/max*(h-55),bw,d.transfers/max*(h-55));ctx.fillStyle='#aaa';ctx.fillText(d.month,x-18,h-8);}); }
function drawLine(canvas,data){ const {ctx,w,h}=setupCanvas(canvas),vals=data.map(d=>d.balance),min=Math.min(...vals,0),max=Math.max(...vals,1),pad=24;ctx.clearRect(0,0,w,h);ctx.strokeStyle='#3aa0ff';ctx.lineWidth=3;ctx.beginPath();vals.forEach((v,i)=>{let x=pad+i*(w-pad*2)/(vals.length-1),y=h-30-(v-min)/(max-min||1)*(h-60);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();ctx.fillStyle='#aaa';data.forEach((d,i)=>ctx.fillText(d.month,pad+i*(w-pad*2)/(data.length-1)-12,h-8)); }

render();
