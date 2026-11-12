import { fetchIncidents, ack, acks } from './api.js';

const empty = document.querySelector('[data-testid="empty"]');
const list = document.querySelector('[data-testid="incident-list"]');

const ackedIds = new Set(acks.map((a) => a.id));
const incidentMap = new Map();

function formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString();
}

function renderIncidents(incidents) {
  if (incidents.length === 0) {
    list.style.display = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }

  if (empty) empty.style.display = 'none';
  list.style.display = 'block';

  list.innerHTML = incidents
    .map((inc) => {
      const isAcked = ackedIds.has(inc.id);
      const ackHtml = isAcked
        ? `<span data-testid="acked" class="acked">Acked</span>`
        : `<button data-testid="ack" class="ack" data-id="${inc.id}">Ack</button>`;

      return `<li data-testid="incident-row" data-id="${inc.id}" class="row ${inc.severity}">
        <span class="id">${inc.id}</span>
        <span class="sev">${inc.severity}</span>
        <span class="what">${inc.service} · ${inc.region} · ${inc.summary}</span>
        <time datetime="${inc.openedAt}">${formatTime(inc.openedAt)}</time>
        ${ackHtml}
      </li>`;
    })
    .join('');
}

list.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-testid="ack"]');
  if (!btn) return;
  const id = btn.dataset.id;
  if (!id) return;

  btn.disabled = true;
  try {
    await ack(id);
    ackedIds.add(id);
    const ackedSpan = document.createElement('span');
    ackedSpan.dataset.testid = 'acked';
    ackedSpan.className = 'acked';
    ackedSpan.textContent = 'Acked';
    btn.replaceWith(ackedSpan);
  } catch (err) {
    console.error(`Failed to ack ${id}:`, err);
    btn.disabled = false;
  }
});

let isFetching = false;

async function updateBoard() {
  if (isFetching) return;
  isFetching = true;
  try {
    const page = await fetchIncidents();
    if (page && Array.isArray(page.incidents)) {
      for (const inc of page.incidents) {
        incidentMap.set(inc.id, inc);
      }
      const sorted = Array.from(incidentMap.values()).sort(
        (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
      );
      renderIncidents(sorted);
    }
  } catch (err) {
    console.error('Failed to fetch incidents:', err);
  } finally {
    const currentLoader = document.querySelector('[data-testid="loader"]');
    if (currentLoader) {
      currentLoader.remove();
    }
    isFetching = false;
  }
}

updateBoard().catch(console.error);
setInterval(updateBoard, 2000);
