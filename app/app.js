import { fetchIncidents, ack, acks } from './api.js';

const empty = document.querySelector('[data-testid="empty"]');
const list = document.querySelector('[data-testid="incident-list"]');
const confirmModal = document.querySelector('[data-testid="confirm"]');
const confirmMessage = document.getElementById('confirm-message');
const confirmAckBtn = document.querySelector('[data-testid="confirm-ack"]');
const confirmCancelBtn = document.querySelector('[data-testid="confirm-cancel"]');

const ackedIds = new Set(acks.map((a) => a.id));
const incidentMap = new Map();
const domRowMap = new Map();

function formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString();
}

function createRowElement(inc) {
  const row = document.createElement('li');
  row.className = `row ${inc.severity}`;
  row.dataset.testid = 'incident-row';
  row.dataset.id = inc.id;

  const isAcked = ackedIds.has(inc.id);
  const ackHtml = isAcked
    ? `<span data-testid="acked" class="acked">Acked</span>`
    : `<button data-testid="ack" class="ack" data-id="${inc.id}">Ack</button>`;

  row.innerHTML = `
    <span class="id">${inc.id}</span>
    <span class="sev">${inc.severity}</span>
    <span class="what">${inc.service} · ${inc.region} · ${inc.summary}</span>
    <time datetime="${inc.openedAt}">${formatTime(inc.openedAt)}</time>
    ${ackHtml}
  `;
  return row;
}

function renderIncidents(incidents) {
  if (incidents.length === 0) {
    if (domRowMap.size === 0) {
      list.style.display = 'none';
      if (empty) empty.style.display = 'block';
    }
    return;
  }

  if (empty) empty.style.display = 'none';
  list.style.display = 'block';

  // Incremental DOM update without removing existing rows
  for (let i = 0; i < incidents.length; i++) {
    const inc = incidents[i];
    if (domRowMap.has(inc.id)) {
      // Row already in DOM, update ack state if needed
      const row = domRowMap.get(inc.id);
      if (ackedIds.has(inc.id)) {
        const btn = row.querySelector('[data-testid="ack"]');
        if (btn) {
          const ackedSpan = document.createElement('span');
          ackedSpan.dataset.testid = 'acked';
          ackedSpan.className = 'acked';
          ackedSpan.textContent = 'Acked';
          btn.replaceWith(ackedSpan);
        }
      }
    } else {
      // Create new row
      const row = createRowElement(inc);
      domRowMap.set(inc.id, row);

      // Find insertion point (the next incident in list that is already in DOM)
      let nextElement = null;
      for (let j = i + 1; j < incidents.length; j++) {
        const nextId = incidents[j].id;
        if (domRowMap.has(nextId)) {
          nextElement = domRowMap.get(nextId);
          break;
        }
      }

      if (nextElement && nextElement.parentNode === list) {
        list.insertBefore(row, nextElement);
      } else {
        list.appendChild(row);
      }
    }
  }
}

let pendingAckId = null;
let pendingAckRow = null;

list.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-testid="ack"]');
  if (!btn) return;
  const id = btn.dataset.id;
  if (!id) return;

  const row = btn.closest('[data-testid="incident-row"]');
  pendingAckId = id;
  pendingAckRow = row;

  confirmMessage.textContent = `Acknowledge incident ${id}?`;
  confirmModal.style.display = 'flex';
});

confirmCancelBtn.addEventListener('click', () => {
  confirmModal.style.display = 'none';
  pendingAckId = null;
  pendingAckRow = null;
});

confirmAckBtn.addEventListener('click', async () => {
  if (!pendingAckId || !pendingAckRow) return;
  const id = pendingAckId;
  const row = pendingAckRow;
  confirmModal.style.display = 'none';
  pendingAckId = null;
  pendingAckRow = null;

  const btn = row.querySelector('[data-testid="ack"]');
  if (btn) btn.disabled = true;

  try {
    await ack(id);
    ackedIds.add(id);
    if (btn) {
      const ackedSpan = document.createElement('span');
      ackedSpan.dataset.testid = 'acked';
      ackedSpan.className = 'acked';
      ackedSpan.textContent = 'Acked';
      btn.replaceWith(ackedSpan);
    }
  } catch (err) {
    console.error(`Failed to ack ${id}:`, err);
    if (btn) btn.disabled = false;
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && confirmModal.style.display !== 'none') {
    confirmCancelBtn.click();
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
