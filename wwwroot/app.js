'use strict';

const form = document.querySelector('#expense-form');
const fields = Object.fromEntries(['title', 'category', 'amount', 'date'].map(name => [name, document.getElementById(name)]));
const notice = document.querySelector('#notice');
const formError = document.querySelector('#form-error');
const dialog = document.querySelector('#delete-dialog');
const editDialog = document.querySelector('#edit-dialog');
const formHome = form.parentElement;
const categoryFilter = document.querySelector('#category-filter');
const dateSort = document.querySelector('#date-sort');
const summaryMonth = document.querySelector('#summary-month');
const currency = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
const dateFormat = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
let expenses = [];
let editingId = null;
let deletingId = null;
let busy = false;

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function message(text, isError = false) {
  notice.textContent = text;
  notice.classList.toggle('error', isError);
  notice.hidden = !text;
}
async function api(path = '', options = {}) {
  let response;
  try { response = await fetch(`/api/expenses${path}`, options); }
  catch { throw new Error('Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.'); }
  if (!response.ok) {
    let problem;
    try { problem = await response.json(); } catch { /* Sunucu JSON döndürmeyebilir. */ }
    const friendly = { Title: 'Başlık zorunludur ve en fazla 100 karakter olabilir.', Category: 'Kategori zorunludur ve en fazla 50 karakter olabilir.', Amount: 'Tutar pozitif olmalı ve en fazla iki ondalık basamak içermelidir.', Date: 'Lütfen geçerli bir tarih seçin.' };
    const errors = problem?.errors ? [...new Set(Object.keys(problem.errors).map(key => friendly[key] || 'Girdiğiniz bilgileri kontrol edin.'))].join(' ') : null;
    throw new Error(errors || (response.status === 404 ? 'Bu harcama artık mevcut değil. Listeyi yenileyin.' : 'İşlem tamamlanamadı. API ve veritabanı bağlantısını kontrol edip tekrar deneyin.'));
  }
  return response.status === 204 ? null : response.json();
}
function resetForm() {
  editingId = null;
  clearValidation();
  form.reset();
  fields.date.value = today();
  document.querySelector('#form-title').textContent = 'Yeni harcama';
  document.querySelector('#save-button').textContent = 'Harcama ekle';
  document.querySelector('#cancel-edit').hidden = true;
  formError.hidden = true;
}
function setBusy(value) {
  busy = value;
  document.querySelectorAll('button').forEach(button => { button.disabled = value; });
  document.querySelectorAll('input, select').forEach(field => { field.disabled = value; });
}
function cell(text, className = '') {
  const element = document.createElement('td');
  element.textContent = text;
  element.className = className;
  return element;
}
function render() {
  // Kullanıcı metinlerini HTML olarak yorumlamadan DOM'a ekle.
  const list = document.querySelector('#expense-list');
  list.replaceChildren();
  const selectedCategory = categoryFilter.value;
  const categories = [...new Set(expenses.map(expense => expense.category))].sort((a, b) => a.localeCompare(b, 'tr'));
  categoryFilter.replaceChildren(new Option('Tüm kategoriler', ''));
  if (selectedCategory && !categories.includes(selectedCategory)) categories.push(selectedCategory);
  categories.forEach(category => categoryFilter.add(new Option(category, category)));
  categoryFilter.value = selectedCategory;
  const visible = expenses.filter(expense => !selectedCategory || expense.category === selectedCategory)
    .sort((a, b) => (dateSort.value === 'asc' ? 1 : -1) * (a.date.localeCompare(b.date) || a.id - b.id));
  document.querySelector('#list-summary').textContent = `${visible.length} harcama · ${selectedCategory || 'Tüm kategoriler'}`;
  for (const expense of visible) {
    const row = document.createElement('tr');
    const description = cell('');
    const title = document.createElement('span');
    title.className = 'expense-title';
    title.textContent = expense.title;
    const category = document.createElement('span');
    category.className = 'category';
    category.textContent = expense.category;
    description.append(title, category);
    const actionCell = cell('');
    const actions = document.createElement('div');
    actions.className = 'actions';
    for (const [label, action] of [['Düzenle', 'edit'], ['Sil', 'delete']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.className = `row-button ${action}`;
      button.dataset.action = action;
      button.dataset.id = expense.id;
      button.setAttribute('aria-label', `${expense.title} — ${label}`);
      actions.append(button);
    }
    actionCell.append(actions);
    row.append(description, cell(dateFormat.format(new Date(`${expense.date}T00:00:00`)), 'date-cell'), cell(currency.format(expense.amount), 'money'), actionCell);
    list.append(row);
  }
  const totalCents = expenses.reduce((sum, expense) => sum + Math.round(expense.amount * 100), 0);
  document.querySelector('#total-amount').textContent = currency.format(totalCents / 100);
  document.querySelector('#total-count').textContent = expenses.length;
  document.querySelector('#empty-state').hidden = expenses.length > 0;
  document.querySelector('#table-wrap').hidden = visible.length === 0;
  document.querySelector('#filter-empty').hidden = expenses.length === 0 || visible.length > 0;
  renderSummary();
}
async function load() {
  document.querySelector('#loading').hidden = false;
  try {
    expenses = await api();
    render();
  } finally { document.querySelector('#loading').hidden = true; }
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const request = { title: fields.title.value.trim(), category: fields.category.value.trim(), amount: Number(fields.amount.value), date: fields.date.value };
  if (!validateForm()) return;
  const updating = editingId !== null;
  setBusy(true);
  formError.hidden = true;
  try {
    await api(updating ? `/${editingId}` : '', { method: updating ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
    resetForm();
    if (updating) editDialog.close();
    message(updating ? 'Harcama güncellendi.' : 'Harcama eklendi.');
    try { await load(); } catch { message('Kayıt kaydedildi ancak liste yenilenemedi. Yenile düğmesini kullanın.', true); }
  } catch (error) {
    formError.textContent = error.message;
    formError.hidden = false;
  } finally { setBusy(false); }
});
document.querySelector('#expense-list').addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button || busy) return;
  const expense = expenses.find(item => item.id === Number(button.dataset.id));
  if (!expense) return;
  if (button.dataset.action === 'edit') {
    editingId = expense.id;
    Object.keys(fields).forEach(name => { fields[name].value = expense[name]; });
    document.querySelector('#edit-form-host').append(form);
    clearValidation();
    editDialog.showModal();
    document.querySelector('#save-button').textContent = 'Değişiklikleri kaydet';
    document.querySelector('#cancel-edit').hidden = false;
    formError.hidden = true;
    fields.title.focus();
  } else {
    deletingId = expense.id;
    document.querySelector('#delete-description').textContent = `${expense.title} · ${currency.format(expense.amount)}`;
    document.querySelector('#delete-error').hidden = true;
    dialog.showModal();
  }
});
document.querySelector('#confirm-delete').addEventListener('click', async () => {
  if (busy || deletingId === null) return;
  setBusy(true);
  try {
    await api(`/${deletingId}`, { method: 'DELETE' });
    if (editingId === deletingId) resetForm();
    dialog.close();
    message('Harcama silindi.');
    try { await load(); } catch { message('Harcama silindi ancak liste yenilenemedi. Yenile düğmesini kullanın.', true); }
  } catch (error) {
    document.querySelector('#delete-error').textContent = error.message;
    document.querySelector('#delete-error').hidden = false;
  } finally { setBusy(false); }
});
document.querySelector('#cancel-delete').addEventListener('click', () => dialog.close());
dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
dialog.addEventListener('close', () => { deletingId = null; });
document.querySelector('#cancel-edit').addEventListener('click', () => editDialog.close());
editDialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
editDialog.addEventListener('close', () => { formHome.append(form); resetForm(); });
categoryFilter.addEventListener('change', render);
dateSort.addEventListener('change', render);
summaryMonth.addEventListener('change', renderSummary);
summaryMonth.value = today().slice(0, 7);
document.querySelector('#refresh').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  try { await load(); message('Liste güncellendi.'); } catch (error) { message(error.message, true); }
  finally { setBusy(false); }
});
function clearValidation() {
  Object.values(fields).forEach(field => {
    field.removeAttribute('aria-invalid');
    field.removeAttribute('aria-describedby');
  });
  form.querySelectorAll('.field-error').forEach(error => error.remove());
  formError.hidden = true;
}
function validateForm() {
  clearValidation();
  let firstInvalid;
  const messages = {
    title: 'Lütfen bir başlık girin (en fazla 100 karakter).',
    category: 'Lütfen bir kategori girin (en fazla 50 karakter).',
    amount: '0,01–999.999.999.999,99 arasında, en fazla iki ondalık basamaklı bir tutar girin.',
    date: 'Lütfen geçerli bir tarih seçin.'
  };
  for (const [name, field] of Object.entries(fields)) {
    if (!field.checkValidity() || !field.value.trim() || (field.maxLength > 0 && field.value.length > field.maxLength)) {
      const error = document.createElement('p');
      error.className = 'field-error';
      error.id = `${name}-error`;
      error.textContent = messages[name];
      field.after(error);
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', error.id);
      firstInvalid ||= field;
    }
  }
  if (firstInvalid) {
    formError.textContent = 'Kaydetmeden önce işaretlenen alanları kontrol edin.';
    formError.hidden = false;
    firstInvalid.focus();
  }
  return !firstInvalid;
}
form.addEventListener('input', event => {
  const field = event.target;
  if (field.getAttribute('aria-invalid') === 'true') {
    field.removeAttribute('aria-invalid');
    field.removeAttribute('aria-describedby');
    document.getElementById(`${field.id}-error`)?.remove();
  }
});
function renderSummary() {
  const monthly = expenses.filter(expense => expense.date.slice(0, 7) === summaryMonth.value);
  const totalCents = monthly.reduce((sum, expense) => sum + Math.round(expense.amount * 100), 0);
  document.querySelector('#monthly-total').textContent = currency.format(totalCents / 100);
  document.querySelector('#monthly-count').textContent = `${monthly.length} harcama · Seçilen ay`;
  const categories = new Map();
  monthly.forEach(expense => categories.set(expense.category, (categories.get(expense.category) || 0) + Math.round(expense.amount * 100)));
  const chart = document.querySelector('#category-chart');
  chart.replaceChildren();
  for (const [category, cents] of [...categories].sort((a, b) => b[1] - a[1])) {
    const percent = totalCents ? cents / totalCents * 100 : 0;
    const row = document.createElement('div');
    row.className = 'chart-row';
    const label = document.createElement('span');
    label.className = 'chart-label';
    label.textContent = category;
    const track = document.createElement('div');
    track.className = 'chart-track';
    track.setAttribute('aria-hidden', 'true');
    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    bar.style.width = `${percent}%`;
    track.append(bar);
    const value = document.createElement('span');
    value.className = 'chart-value';
    value.textContent = currency.format(cents / 100);
    const share = document.createElement('small');
    share.textContent = `%${percent.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
    value.append(share);
    row.append(label, track, value);
    chart.append(row);
  }
  document.querySelector('#chart-empty').hidden = monthly.length > 0;
}
resetForm();
setBusy(true);
load().catch(error => message(error.message, true)).finally(() => setBusy(false));
