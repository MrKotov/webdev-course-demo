// Drawing. Nothing in here knows about the server, and nothing in api.js knows about
// the screen. Keeping the two apart is the same idea as routes and services on the
// back end, at a smaller scale.

export const $ = (selector, root = document) => root.querySelector(selector);

/** Escape anything that came from a person before it goes into HTML. */
export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * A message the user can read, in a region marked aria-live, so a screen reader
 * announces it without anyone having to go looking for it.
 */
export function toast(text, kind = 'good') {
  const host = $('#toast');
  const line = document.createElement('p');
  line.className = kind;
  line.textContent = text;
  host.append(line);
  setTimeout(() => line.remove(), kind === 'bad' ? 7000 : 4000);
}

/** The loading state: boxes the size and shape of the rows that are coming. */
export const skeleton = (count = 3) =>
  `<div class="skeleton">${'<div></div>'.repeat(count)}</div>`;

/** The empty state: what this list is for, and what to do about it being empty. */
export const empty = (title, hint) =>
  `<div class="empty"><strong>${esc(title)}</strong>${esc(hint)}</div>`;

/** The error state, in place of the content rather than next to it. */
export const failed = (message, retryLabel = 'Try again') =>
  `<div class="empty"><strong>That did not load</strong>${esc(message)}
     <p><button class="quiet" data-retry>${esc(retryLabel)}</button></p></div>`;

/**
 * Run an async job while a button shows that it is working. A model call can take
 * several seconds, and a free service that has been asleep takes several more; a
 * button that looks untouched for that long reads as broken.
 */
export async function whileBusy(button, label, job) {
  // A form submitted from code rather than from a click has no submitter, so there is
  // nothing to put the label on. The job still has to run.
  if (!button) return job();

  const was = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try {
    return await job();
  } finally {
    button.disabled = false;
    button.textContent = was;
  }
}

/**
 * Swap a region's content, smoothly where the browser supports it.
 *
 * Two of these overlapping is normal — a booking redraws both the suggestion and the
 * list — and the browser skips the first transition when the second starts. A skipped
 * transition rejects `ready`, and that is an unhandled promise rejection in the console
 * unless somebody catches it. The content still swapped; only the animation was dropped,
 * which is exactly what should happen and is not worth telling anyone about.
 */
export function render(node, html) {
  if (!document.startViewTransition) {
    node.innerHTML = html;
    return;
  }
  const transition = document.startViewTransition(() => { node.innerHTML = html; });
  transition.ready.catch(() => {});
  transition.finished.catch(() => {});
}

/** Remember the theme this visitor chose. Their machine's setting is the default. */
export function setUpTheme() {
  const button = $('#theme');
  const stored = localStorage.getItem('theme');
  if (stored) document.documentElement.dataset.theme = stored;

  button?.addEventListener('click', () => {
    const now = document.documentElement.dataset.theme
      ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = now === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
    button.setAttribute('aria-label', next === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme');
  });
}

/** The date pickers should not offer a day that is already over. */
export const today = () => new Date().toLocaleDateString('sv');
