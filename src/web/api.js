// The only module that talks to the server. Everything else calls these functions and
// never sees a URL, a status code or a fetch.
//
// Its one real job is turning a failed response into an Error carrying a sentence a
// person can read. A screen that shows `{"error":"..."}` to a user is a screen that
// stopped at the first layer that knew what went wrong.

async function call(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // No response at all: offline, or the free service is still waking up.
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? friendly(res.status));
  return data;
}

/** A last resort, for the day the server fails before it can say why. */
const friendly = (status) => ({
  401: 'You need to sign in again.',
  403: 'You are not allowed to do that.',
  404: 'That is no longer there.',
  409: 'That clashes with something else.',
  500: 'Something went wrong on our side. Try again in a moment.',
}[status] ?? `Something went wrong (${status}).`);

export const me = () => call('/api/auth/me');
export const signIn = (email, password) => call('/api/auth/login', { method: 'POST', body: { email, password } });
export const signOut = () => call('/api/auth/logout', { method: 'POST' });

export const labs = () => call('/api/labs');
export const slots = () => call('/api/slots');

export const myBookings = () => call('/api/bookings');
export const bookingsOn = (date) => call(`/api/bookings/day?date=${encodeURIComponent(date)}`);
export const book = (booking) => call('/api/bookings', { method: 'POST', body: booking });
export const cancel = (id) => call(`/api/bookings/${id}`, { method: 'DELETE' });

export const suggest = (wish) => call('/api/suggest', { method: 'POST', body: wish });
