// The whole front end. No framework: fetch the JSON API and redraw two lists.

const $ = (id) => document.getElementById(id);
const msg = (text, bad = false) => {
  $('msg').textContent = text;
  $('msg').classList.toggle('bad', bad);
};

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

function show(user) {
  $('signin').classList.toggle('hidden', Boolean(user));
  $('app').classList.toggle('hidden', !user);
  if (user) $('who').textContent = user.fullName;
}

async function fillPickers() {
  const [{ labs }, { slots }] = await Promise.all([api('/api/labs'), api('/api/slots')]);
  $('workstations').innerHTML = labs
    .flatMap((lab) => lab.workstations.filter((w) => w.active)
      .map((w) => `<option value="${w.id}">${lab.code} / ${w.label} (${w.seats} seats)</option>`))
    .join('');
  $('slots').innerHTML = slots
    .map((s) => `<option value="${s.slot}">${s.slot}: ${s.start}-${s.end}</option>`)
    .join('');
}

async function refresh() {
  const { bookings } = await api('/api/bookings');
  $('list').innerHTML = bookings.length
    ? bookings.map((b) => `
        <li>
          <span>
            <strong>${b.lab.code} / ${b.workstation.label}</strong> &middot; ${b.date} &middot; ${b.slotTime}
            <small>${b.purpose || 'no purpose given'}${b.attendees.length ? ` &middot; with ${b.attendees.map((a) => a.fullName).join(', ')}` : ''}</small>
          </span>
          <button data-cancel="${b.id}">Cancel</button>
        </li>`).join('')
    : '<li>Nothing booked yet.</li>';
}

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.target));
  try {
    const { user } = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(form) });
    show(user);
    await fillPickers();
    await refresh();
    msg('');
  } catch (err) {
    msg(err.message, true);
  }
});

$('logout').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  show(null);
});

$('book-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.target));
  try {
    await api('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        workstationId: Number(form.workstationId),
        slot: Number(form.slot),
        date: form.date,
        purpose: form.purpose,
        attendeeEmails: form.attendeeEmails.split(',').map((s) => s.trim()).filter(Boolean),
      }),
    });
    event.target.reset();
    await refresh();
    msg('Booked.');
  } catch (err) {
    msg(err.message, true);
  }
});

$('list').addEventListener('click', async (event) => {
  const id = event.target.dataset.cancel;
  if (!id) return;
  try {
    const out = await api(`/api/bookings/${id}`, { method: 'DELETE' });
    await refresh();
    msg(`Freed ${out.freed}.`);
  } catch (err) {
    msg(err.message, true);
  }
});

api('/api/auth/me').then(async ({ user }) => {
  show(user);
  if (user) {
    await fillPickers();
    await refresh();
  }
});
