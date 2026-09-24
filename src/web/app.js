// The flows: what happens when somebody signs in, books, asks for a suggestion or
// cancels. It calls api.js for data and ui.js for drawing, and holds no HTML of its
// own beyond the rows it builds.
//
// Every list here has four states — loading, empty, error, success — because those
// are the four things that actually happen, and a screen that only handles the last
// one lies to the user on the day it matters.

import * as api from './api.js';
import { $, empty, esc, failed, render, setUpTheme, skeleton, toast, today, whileBusy } from './ui.js';

const state = { user: null, slots: [] };

/* ---------- signed in or not ---------- */

function show(user) {
  state.user = user;
  $('#signin').classList.toggle('hidden', Boolean(user));
  $('#app').classList.toggle('hidden', !user);
  $('#session').classList.toggle('hidden', !user);
  if (user) $('#who').textContent = user.fullName;
}

/* ---------- my bookings ---------- */

async function loadBookings() {
  const list = $('#list');
  list.innerHTML = skeleton(2);          // loading
  try {
    const { bookings } = await api.myBookings();
    render(list, bookings.length ? bookings.map(row).join('') : empty(
      'No bookings yet',                  // empty
      'Pick a workstation and a block above, and it will appear here.',
    ));
  } catch (error) {
    list.innerHTML = failed(error.message);  // error
  }
}

const row = (b) => `
  <li>
    <span>
      <strong>${esc(b.lab.code)} / ${esc(b.workstation.label)}</strong>
      <small>${esc(b.date)} · ${esc(b.slotTime)}${b.purpose ? ` · ${esc(b.purpose)}` : ''}${
        b.attendees.length ? ` · with ${b.attendees.map((a) => esc(a.fullName)).join(', ')}` : ''
      }</small>
    </span>
    <button class="quiet icon" data-cancel="${b.id}">Cancel</button>
  </li>`;

/* ---------- the pickers ---------- */

async function fillPickers() {
  const [{ labs }, { slots }] = await Promise.all([api.labs(), api.slots()]);
  state.slots = slots;

  $('#workstations').innerHTML = labs
    .flatMap((lab) => lab.workstations.filter((w) => w.active)
      .map((w) => `<option value="${w.id}">${esc(lab.code)} / ${esc(w.label)} — ${w.seats} seat(s)</option>`))
    .join('');
  $('#slots').innerHTML = slots
    .map((s) => `<option value="${s.slot}">${s.slot} · ${s.start}–${s.end}</option>`)
    .join('');

  for (const input of document.querySelectorAll('input[type="date"]')) {
    input.min = today();
    if (!input.value) input.value = today();
  }
}

/* ---------- the model feature ---------- */

$('#suggest-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.target));
  const out = $('#suggestion');

  // The pending state. Not decoration: this call goes to a third party over the
  // network and can take several seconds.
  out.innerHTML = `<div class="thinking"><span class="dots"><i></i><i></i><i></i></span> Looking for something that fits…</div>`;

  try {
    const { suggestion, source, reason } = await whileBusy(
      event.submitter, 'Thinking…',
      () => api.suggest({ date: form.date, need: form.need, seats: Number(form.seats) || 1 }),
    );

    if (!suggestion) {
      out.innerHTML = empty('Nothing fits that day', reason);
      return;
    }

    // The tag matters. A suggestion is a suggestion, not something the app knows:
    // the user is told which of the two they are looking at before they act on it.
    render(out, `
      <div class="suggestion">
        <div>
          <strong>${esc(suggestion.label)}</strong> in ${esc(suggestion.lab)} · ${esc(suggestion.slotTime)}
          <span class="tag ${source}">${source === 'model' ? 'suggested' : 'app rule'}</span>
        </div>
        <p class="why">${esc(reason)}</p>
        <div><button class="primary" data-take='${esc(JSON.stringify({ workstationId: suggestion.workstationId, slot: suggestion.slot, date: form.date }))}'>Book this</button></div>
      </div>`);
  } catch (error) {
    // The failure state. The rest of the page still works: booking by hand never
    // depended on this feature, and it must keep not depending on it.
    out.innerHTML = failed(`${error.message} You can still pick a workstation yourself above.`, 'Ask again');
  }
});

$('#suggestion').addEventListener('click', async (event) => {
  const take = event.target.dataset.take;
  if (take) {
    try {
      await whileBusy(event.target, 'Booking…', () => api.book(JSON.parse(take)));
      $('#suggestion').innerHTML = '';
      toast('Booked.');
      await loadBookings();
    } catch (error) {
      toast(error.message, 'bad');
    }
    return;
  }
  if (event.target.dataset.retry !== undefined) $('#suggest-form').requestSubmit();
});

/* ---------- sign in ---------- */

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.target));
  try {
    const { user } = await whileBusy(event.submitter, 'Signing in…', () => api.signIn(form.email, form.password));
    show(user);
    await fillPickers();
    await loadBookings();
  } catch (error) {
    toast(error.message, 'bad');
  }
});

$('#logout').addEventListener('click', async () => {
  await api.signOut();
  show(null);
  toast('Signed out.');
});

/* ---------- booking by hand ---------- */

$('#book-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.target));
  try {
    await whileBusy(event.submitter, 'Booking…', () => api.book({
      workstationId: Number(form.workstationId),
      slot: Number(form.slot),
      date: form.date,
      purpose: form.purpose,
      attendeeEmails: form.attendeeEmails.split(',').map((s) => s.trim()).filter(Boolean),
    }));
    event.target.reset();
    for (const input of document.querySelectorAll('input[type="date"]')) input.value = today();
    toast('Booked.');
    await loadBookings();
  } catch (error) {
    toast(error.message, 'bad');
  }
});

$('#list').addEventListener('click', async (event) => {
  if (event.target.dataset.retry !== undefined) return loadBookings();
  const id = event.target.dataset.cancel;
  if (!id) return;
  try {
    const { freed } = await whileBusy(event.target, 'Cancelling…', () => api.cancel(id));
    toast(`${freed} is free again.`);
    await loadBookings();
  } catch (error) {
    toast(error.message, 'bad');
  }
});

/* ---------- start ---------- */

setUpTheme();

// The Google callback sends the browser back here with a message when something
// went wrong, because a person in a browser window cannot read a JSON error.
const problem = new URLSearchParams(location.search).get('error');
if (problem) {
  toast(problem, 'bad');
  history.replaceState(null, '', location.pathname);
}

api.me()
  .then(async ({ user }) => {
    show(user);
    if (user) {
      await fillPickers();
      await loadBookings();
    }
  })
  .catch((error) => toast(error.message, 'bad'));
