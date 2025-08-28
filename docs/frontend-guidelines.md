# frontend-guidelines (No build step)

## 1) Philosophy
Server-rendered HTML with a dash of HTMX/vanilla JS for async actions. No SPA, no bundler.

## 2) Dashboard form (HTMX example)
```html
<form hx-post="/api/v1/digests" hx-trigger="submit" hx-swap="none" onhtmx:afterRequest="startPolling(event.detail.xhr)">
  <select name="repository" id="repo">…</select>
  <select name="timespan" id="timespan">today, yesterday, last_week, custom</select>
  <input type="number" name="days" value="3" min="1" max="30" />
  <button type="submit">Create digest</button>
</form>
<script>
async function startPolling(xhr) {
  try {
    const { job_id } = JSON.parse(xhr.responseText);
    const poll = setInterval(async () => {
      const r = await fetch(`/api/v1/jobs/${job_id}`);
      const j = await r.json();
      if (j.status === 'COMPLETED') {
        clearInterval(poll);
        window.location.href = `/digests/${j.digest_id}`;
      } else if (j.status === 'FAILED') {
        clearInterval(poll);
        alert('Digest failed: ' + (j.message || 'unknown error'));
      }
    }, 2500);
  } catch (e) { alert('Could not start job'); }
}
</script>
```

## 3) Archive
- Server renders a table of recent digests with repo filter and pagination.
- Links go to `/digests/{id}` (server renders stored HTML).

## 4) Settings UI
- A simple table (key/value). Use `PATCH /api/v1/settings` with a JSON body of changed keys.
- Repos: list with add (form) and inline activate/deactivate (PATCH).

## 5) Styling & a11y
- System fonts, responsive tables/forms, visible focus states.
- Use aria-live for job status messages if shown inline.
