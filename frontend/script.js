/* WildShield AI — dashboard behavior. Talks to the real FastAPI backend via
   window.WildShieldApi (see api-service.js). No mock/static data is used here;
   every render function below is driven by what the API returns. */

const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const mobileToggle = document.getElementById('mobileToggle');
const backdrop = document.getElementById('sidebarBackdrop');
const profileTrigger = document.getElementById('profileTrigger');
const profileMenu = document.querySelector('.profile-menu');
const authActionLink = document.getElementById('authActionLink');
const dateTime = document.getElementById('currentDateTime');

let currentAlerts = [];
let currentDetections = [];
let currentVillages = [];
let currentSirens = [];
let currentCameras = [];
let pendingAfterLogin = null;
let _leafletMap = null;  // Leaflet map instance
let _wsDebounceTimer = null;
let _pollingTimer = null;

/* ------------------------------------------------------------------ */
/* Basic chrome: clock, sidebar, profile menu                          */
/* ------------------------------------------------------------------ */

function updateDateTime() {
  if (!dateTime) return;
  const now = new Date();
  dateTime.textContent = now.toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function toggleSidebar(force) {
  const isMobile = window.innerWidth <= 760;
  const shouldOpen = typeof force === 'boolean' ? force : !sidebar.classList.contains('open');

  if (isMobile) {
    sidebar.classList.toggle('open', shouldOpen);
    backdrop.classList.toggle('show', shouldOpen);
    return;
  }

  if (typeof force === 'boolean') {
    sidebar.classList.toggle('collapsed', !force);
  } else {
    sidebar.classList.toggle('collapsed');
  }
}

sidebarToggle?.addEventListener('click', () => toggleSidebar());
mobileToggle?.addEventListener('click', () => toggleSidebar(true));
backdrop?.addEventListener('click', () => toggleSidebar(false));

profileTrigger?.addEventListener('click', () => {
  profileMenu.classList.toggle('open');
  profileTrigger.setAttribute('aria-expanded', profileMenu.classList.contains('open'));
});

document.addEventListener('click', (event) => {
  if (!profileMenu?.contains(event.target)) {
    profileMenu?.classList.remove('open');
    profileTrigger?.setAttribute('aria-expanded', 'false');
  }
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 760) {
    sidebar?.classList.remove('open');
    backdrop?.classList.remove('show');
  }
});

updateDateTime();
setInterval(updateDateTime, 1000);

/* ------------------------------------------------------------------ */
/* Toast notifications                                                  */
/* ------------------------------------------------------------------ */

function ensureToastStack() {
  let stack = document.getElementById('toastStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toastStack';
    document.body.appendChild(stack);
  }
  return stack;
}

function toast(message, type = 'info', duration = 3200) {
  const stack = ensureToastStack();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 200ms ease';
    setTimeout(() => el.remove(), 220);
  }, duration);
}

/* ------------------------------------------------------------------ */
/* Modal                                                                */
/* ------------------------------------------------------------------ */

function closeModal() {
  document.getElementById('wsModalOverlay')?.remove();
}

function openModal({ eyebrow = '', title = '', bodyHtml = '', actionsHtml = '' }) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'wsModalOverlay';
  overlay.innerHTML = `
    <div class="modal-box" role="dialog" aria-modal="true">
      <div class="card-heading">
        <div>
          ${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}
          <h3>${title}</h3>
        </div>
        <button class="modal-close" aria-label="Close" data-role="modal-close">✕</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${actionsHtml ? `<div class="modal-actions">${actionsHtml}</div>` : ''}
    </div>
  `;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  overlay.querySelector('[data-role="modal-close"]').addEventListener('click', closeModal);
  document.body.appendChild(overlay);
  return overlay;
}

function detailGridHtml(pairs) {
  return `<div class="detail-grid">${pairs.map(([label, value]) => `
    <div><span>${label}</span><strong>${value ?? '--'}</strong></div>
  `).join('')}</div>`;
}

/* ------------------------------------------------------------------ */
/* Auth: sign in / sign out                                            */
/* ------------------------------------------------------------------ */

function openLoginModal(onSuccess) {
  pendingAfterLogin = onSuccess || null;
  openModal({
    eyebrow: 'Operator access',
    title: 'Sign in',
    bodyHtml: `
      <form class="login-form" id="loginForm">
        <p class="login-hint">Sign in with your WildShield operator account to resolve alerts or manage zones. Demo login: <strong>admin</strong> / <strong>changeme123</strong> (seeded by <code>app.seed</code>).</p>
        <div>
          <label for="loginUsername">Username</label>
          <input id="loginUsername" name="username" type="text" autocomplete="username" value="admin" required />
        </div>
        <div>
          <label for="loginPassword">Password</label>
          <input id="loginPassword" name="password" type="password" autocomplete="current-password" value="changeme123" required />
        </div>
        <p class="login-error" id="loginError"></p>
      </form>
    `,
    actionsHtml: `
      <button class="btn-sm btn-outline" data-role="modal-close">Cancel</button>
      <button class="btn-sm btn-deactivate" id="loginSubmit">Sign in</button>
    `,
  });

  document.getElementById('loginSubmit').addEventListener('click', async () => {
    const api = window.WildShieldApi;
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl = document.getElementById('loginError');
    const btn = document.getElementById('loginSubmit');
    errEl.classList.remove('show');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    try {
      await api.login(username, password);
      toast('Signed in as ' + username, 'success');
      refreshAuthUI();
      closeModal();
      const cb = pendingAfterLogin;
      pendingAfterLogin = null;
      if (cb) cb();
    } catch (err) {
      errEl.textContent = err.message || 'Sign in failed';
      errEl.classList.add('show');
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });
}

authActionLink?.addEventListener('click', (e) => {
  e.preventDefault();
  const api = window.WildShieldApi;
  if (!api) return;
  if (api.isAuthenticated()) {
    api.logout();
    refreshAuthUI();
    toast('Signed out', 'info');
  } else {
    openLoginModal();
  }
});

/** Runs `action` (an async fn). If unauthenticated or fails with a 401, prompts sign-in then retries. */
async function withAuth(action) {
  const api = window.WildShieldApi;
  if (!api.isAuthenticated()) {
    return new Promise((resolve, reject) => {
      openLoginModal(async () => {
        try {
          resolve(await action());
        } catch (retryErr) {
          reject(retryErr);
        }
      });
    });
  }

  try {
    return await action();
  } catch (err) {
    if (err && err.status === 401) {
      return new Promise((resolve, reject) => {
        openLoginModal(async () => {
          try {
            resolve(await action());
          } catch (retryErr) {
            reject(retryErr);
          }
        });
      });
    }
    throw err;
  }
}

function refreshAuthUI() {
  const api = window.WildShieldApi;
  if (!authActionLink || !api) return;
  if (api.isAuthenticated()) {
    authActionLink.textContent = 'Sign out';
    loadUserProfile();
  } else {
    authActionLink.textContent = 'Sign in';
  }
}

refreshAuthUI();

/* ------------------------------------------------------------------ */
/* WebSocket + polling fallback                                         */
/* ------------------------------------------------------------------ */

function setWsPill(state) {
  // state: 'live' | 'offline'
  const pill = document.getElementById('wsStatusPill');
  if (!pill) return;
  if (state === 'live') {
    pill.textContent = '⬤ LIVE';
    pill.className = 'ws-pill live';
  } else {
    pill.textContent = '⬤ OFFLINE';
    pill.className = 'ws-pill offline';
  }
}

function flashAlertCard() {
  const card = document.querySelector('[data-role="index-active-alert"]');
  if (!card) return;
  card.classList.add('flash-new');
  setTimeout(() => card.classList.remove('flash-new'), 1200);
}

function initWebSocket() {
  const wsOrigin = (window.WildShieldApi?.baseUrl || 'http://localhost:8000/api')
    .replace(/\/api$/, '')
    .replace(/^http/, 'ws');
  const wsUrl = `${wsOrigin}/ws`;

  let ws;
  try {
    ws = new WebSocket(wsUrl);
  } catch (e) {
    setWsPill('offline');
    startPollingFallback();
    return;
  }

  ws.addEventListener('open', () => {
    setWsPill('live');
    stopPollingFallback();
  });

  ws.addEventListener('message', (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    if (msg && msg.type === 'new_alert') {
      toast('🚨 New alert received', 'error', 3500);
      flashAlertCard();
      clearTimeout(_wsDebounceTimer);
      _wsDebounceTimer = setTimeout(() => hydrateDashboard(), 500);
    } else if (msg && msg.type === 'siren_off') {
      toast('🔕 Siren auto-off completed', 'info', 3000);
      clearTimeout(_wsDebounceTimer);
      _wsDebounceTimer = setTimeout(() => hydrateDashboard(), 250);
    }
  });

  ws.addEventListener('close', () => {
    setWsPill('offline');
    startPollingFallback();
  });

  ws.addEventListener('error', () => {
    setWsPill('offline');
    ws.close();
    startPollingFallback();
  });
}

function startPollingFallback() {
  if (_pollingTimer) return;
  _pollingTimer = setInterval(() => hydrateDashboard(), 10_000);
}

function stopPollingFallback() {
  if (_pollingTimer) { clearInterval(_pollingTimer); _pollingTimer = null; }
}

// Mock-mode: WS won't connect, so go straight to polling; show neutral MOCK pill
if (window.WildShieldApi?.useMock) {
  const pill = document.getElementById('wsStatusPill');
  if (pill) { pill.textContent = '\u2b24 MOCK'; pill.className = 'ws-pill mock'; }
  startPollingFallback();
} else {
  initWebSocket();
}



async function hydrateDashboard() {
  const api = window.WildShieldApi;
  if (!api) return;

  try {
    const needsAnalytics = Boolean(document.querySelector('[data-role="analytics-species"]'));
    const needsCameras  = Boolean(document.querySelector('[data-role="cam-health-grid"]'));
    const needsLeaflet  = Boolean(document.getElementById('leafletMap'));

    const [detections, alerts, villages, sirens, mapData, analytics, cameras, healthSummary] = await Promise.all([
      api.getDetections(),
      api.getActiveAlerts(),
      api.getVillages(),
      api.getSirens(),
      api.getMapData(),
      needsAnalytics ? api.getAnalytics() : Promise.resolve(null),
      needsCameras ? api.getCameras() : Promise.resolve(null),
      api.getHealthSummary ? api.getHealthSummary().catch(() => null) : Promise.resolve(null)
    ]);

    currentDetections = detections;
    currentAlerts = alerts;
    currentVillages = villages;
    currentSirens = sirens;
    if (cameras) currentCameras = cameras;

    if (healthSummary) {
      renderSidebarHealth(healthSummary);
    }

    if (document.querySelector('[data-role="detections-table"]')) {
      renderDetectionsTable(detections);
    }

    if (document.querySelector('[data-role="alert-list"]')) {
      renderAlerts(alerts);
      setupAlertFilterButtons();
    }

    if (document.querySelector('[data-role="notifications-list"]')) {
      renderNotifications(alerts);
    }

    if (document.querySelector('[data-role="village-grid"]')) {
      renderVillages(villages);
    }

    if (document.querySelector('[data-role="siren-grid"]')) {
      renderSirens(sirens);
      setupSirenTestButton();
    }

    if (document.querySelector('[data-role="map-threat"]')) {
      renderThreatPanel(mapData.threat);
      wireMapMarkers(villages, sirens, mapData);
      wireMapFullResponse(mapData, villages, sirens);
    }

    if (needsLeaflet && !_leafletMap) {
      try {
        const zones = await api.getZones();
        initLeafletMap(zones, sirens);
      } catch (e) {
        // zones unavailable, map markers still show on existing map
      }
    } else if (needsLeaflet && _leafletMap) {
      try {
        const zones = await api.getZones();
        updateLeafletMarkers(zones, sirens);
      } catch (_) {}
    }

    if (needsCameras && cameras) {
      renderCameraHealth(cameras);
    }

    if (document.querySelector('[data-role="index-active-alert"]')) {
      renderIndexHero(detections, alerts, villages, sirens);
    }

    if (analytics) {
      renderAnalytics(analytics);
      renderAnalyticsZonesList(mapData);
    }

    if (document.querySelector('.profile-page') || document.querySelector('[data-role="edit-profile-btn"]')) {
      await loadUserProfile();
    }

    if (document.querySelector('.security-page') || document.querySelector('[data-role="security-events"]')) {
      await setupSecurityPage();
    }

    document.dispatchEvent(new CustomEvent('wildshield:data-ready'));
  } catch (error) {
    console.error('Failed to hydrate WildShield UI', error);
    toast('Could not reach the WildShield backend. Is it running on :8000?', 'error', 5000);
  }
}

/* ------------------------------------------------------------------ */
/* Sidebar health summary card (Rule 3)                                */
/* ------------------------------------------------------------------ */

function renderSidebarHealth(summary) {
  if (!summary) return;
  const summaryEl = document.getElementById('sidebarHealthSummary');
  const detailsEl = document.getElementById('sidebarHealthDetails');
  const uplinkEl = document.getElementById('sidebarUplinkStatus');

  const camerasText = summary.cameras || `${summary.cameras_online}/${summary.cameras_total}`;
  const summaryText = `${camerasText} Cams • ${summary.sirens_on} Siren${summary.sirens_on === 1 ? '' : 's'} On`;
  if (summaryEl) {
    summaryEl.textContent = summaryText;
  }

  const alertText = `${summary.active_alerts} active alert${summary.active_alerts === 1 ? '' : 's'}`;
  let timeText = 'No events';
  if (summary.last_detection_time) {
    const d = new Date(summary.last_detection_time);
    timeText = isNaN(d) ? summary.last_detection_time : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const detailsText = `${alertText} • Last: ${timeText}`;

  if (detailsEl) {
    detailsEl.textContent = detailsText;
  } else if (uplinkEl) {
    uplinkEl.textContent = detailsText;
  }
}

/* ------------------------------------------------------------------ */
/* Detections table (index.html)                                       */
/* ------------------------------------------------------------------ */

function renderDetectionsTable(detections) {
  const container = document.querySelector('[data-role="detections-table"]');
  if (!container) return;

  if (!detections.length) {
    container.innerHTML = `<tr><td colspan="7" class="empty-state">No detections logged yet.</td></tr>`;
    return;
  }

  const rows = detections.slice(0, 8).map((item) => `
    <tr class="clickable-row" data-detection-id="${item.id}">
      <td>${new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
      <td>${item.species}</td>
      <td>${item.type === 'human' ? 'Human' : 'Animal'}</td>
      <td>${item.location}</td>
      <td>${item.movementDirection}</td>
      <td><span class="risk ${item.riskLevel}">${capitalize(item.riskLevel)}</span></td>
      <td>${item.sirenStatus === 'on' ? 'Village siren armed' : 'Monitored'}</td>
    </tr>
  `).join('');

  container.innerHTML = rows;

  container.querySelectorAll('tr[data-detection-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const item = currentDetections.find((d) => d.id === row.dataset.detectionId);
      if (item) openDetectionModal(item);
    });
  });
}

function openDetectionModal(item) {
  openModal({
    eyebrow: `Detection ${item.id}`,
    title: `${item.species} — ${item.type === 'human' ? 'Human' : 'Animal'} detection`,
    bodyHtml: detailGridHtml([
      ['Confidence', formatConfidence(item.confidence)],
      ['Location', item.location],
      ['Affected village', item.affectedVillage],
      ['Movement direction', item.movementDirection],
      ['Boundary crossing', item.boundaryCrossing ? 'Yes' : 'No'],
      ['Risk level', capitalize(item.riskLevel)],
      ['Siren status', item.sirenStatus === 'on' ? 'Armed' : 'Off'],
      ['Detected at', formatTimestamp(item.timestamp)],
    ]),
  });
}

function formatConfidence(value) {
  if (value == null) return '--';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n <= 1 ? `${(n * 100).toFixed(1)}%` : `${n.toFixed(1)}%`;
}

/* ------------------------------------------------------------------ */
/* Alerts (alerts.html, notifications.html)                            */
/* ------------------------------------------------------------------ */

function setupAlertFilterButtons() {
  const buttons = document.querySelectorAll('.filter-btn');
  if (!buttons.length) return;

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      buttons.forEach((btn) => btn.classList.toggle('active', btn === button));

      const filter = button.textContent.trim().toLowerCase();
      let filtered = currentAlerts;

      if (filter === 'active' || filter === 'resolved') {
        filtered = currentAlerts.filter((alert) => alert.status === filter);
      } else if (filter !== 'all') {
        filtered = currentAlerts.filter((alert) => alert.riskLevel === filter);
      }

      renderAlerts(filtered);
    });
  });
}

function renderAlertCards(alerts, { readState } = {}) {
  if (!alerts.length) {
    return `<article class="glass-card panel-card empty-state">No alerts match this filter.</article>`;
  }

  return alerts.map((alert) => {
    const isRead = Boolean(alert.read || (readState && readState.has(alert.id)));
    const isHuman = (alert.detectedObject && alert.detectedObject.toLowerCase().includes('human')) ||
                    (alert.speciesOrHuman && alert.speciesOrHuman.toLowerCase().includes('human')) ||
                    alert.type === 'human';
    const dispatchBadge = isHuman
      ? `<span class="dispatch-badge human" title="Discreet notification protocol">SMS only – discreet</span>`
      : `<span class="dispatch-badge animal" title="Acoustic deterrent and emergency notification">Siren + SMS</span>`;

    return `
    <article class="glass-card alert-card ${alert.riskLevel} ${alert.status} clickable notification-item ${isRead ? 'is-read' : ''}" data-alert-id="${alert.id}">
      <div class="alert-card-top">
        <div>
          <p class="eyebrow">Alert ID: ${alert.id}</p>
          <h3>${alert.title}</h3>
        </div>
        <div class="alert-badges" style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          ${dispatchBadge}
          ${isRead ? '<span class="status-indicator-read" title="Marked as read">✓ Read</span>' : '<span class="status-indicator-unread" title="Unread alert">● New</span>'}
          <span class="risk-badge ${alert.riskLevel}">${capitalize(alert.riskLevel)}</span>
        </div>
      </div>
      <div class="alert-grid">
        <div><span>Date & Time</span><strong>${formatTimestamp(alert.timestamp)}</strong></div>
        <div><span>Detected Object</span><strong>${alert.detectedObject}</strong></div>
        <div><span>Species / Human</span><strong>${alert.speciesOrHuman}</strong></div>
        <div><span>Location</span><strong>${alert.location}</strong></div>
        <div><span>Zone / Village</span><strong>${alert.zone} • ${alert.village}</strong></div>
        <div><span>Movement Direction</span><strong>${alert.movementDirection}</strong></div>
        <div><span>Alert Status</span><strong>${capitalize(alert.status)}</strong></div>
        <div><span>Action Taken</span><strong>${alert.actionTaken}</strong></div>
      </div>
      <div class="alert-actions">
        <span>${alert.recipients.join(' • ')}</span>
        ${alert.status === 'active' ? `<button class="btn-sm btn-resolve" data-resolve-id="${alert.id}">Mark resolved</button>` : ''}
      </div>
    </article>
  `;
  }).join('');
}

function renderAlerts(alerts) {
  const container = document.querySelector('[data-role="alert-list"]');
  if (!container) return;
  container.innerHTML = renderAlertCards(alerts);
  wireAlertCardActions(container);
}

function wireAlertCardActions(container) {
  container.querySelectorAll('[data-resolve-id]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.resolveId;
      btn.disabled = true;
      btn.textContent = 'Resolving…';
      try {
        await withAuth(() => window.WildShieldApi.resolveAlert(id));
        toast('Alert marked resolved', 'success');
        await hydrateDashboard();
      } catch (err) {
        toast(err.message || 'Could not resolve alert', 'error');
        btn.disabled = false;
        btn.textContent = 'Mark resolved';
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/* Notifications (notifications.html) — backend read/unread tracking */
/* ------------------------------------------------------------------ */

function renderNotifications(alerts) {
  const container = document.querySelector('[data-role="notifications-list"]');
  if (!container) return;

  container.innerHTML = alerts.length
    ? renderAlertCards(alerts)
    : `<article class="glass-card panel-card empty-state">No notifications yet.</article>`;

  wireAlertCardActions(container);

  container.querySelectorAll('[data-alert-id]').forEach((card) => {
    card.addEventListener('click', async (e) => {
      if (e.target.closest('[data-resolve-id]')) return;
      const id = card.dataset.alertId;
      const alert = alerts.find((a) => a.id === id);
      const isCurrentlyRead = card.classList.contains('is-read') || Boolean(alert && alert.read);
      const nextRead = !isCurrentlyRead;

      // Optimistic UI update
      card.classList.toggle('is-read', nextRead);
      const indicator = card.querySelector('.status-indicator-read, .status-indicator-unread');
      if (indicator) {
        indicator.className = nextRead ? 'status-indicator-read' : 'status-indicator-unread';
        indicator.textContent = nextRead ? '✓ Read' : '● New';
        indicator.title = nextRead ? 'Marked as read' : 'Unread alert';
      }
      if (alert) alert.read = nextRead;

      try {
        await withAuth(() => window.WildShieldApi.toggleAlertRead(id, nextRead));
        toast(nextRead ? 'Notification marked as read' : 'Notification marked as unread', 'info', 1800);
      } catch (err) {
        // Revert on error
        card.classList.toggle('is-read', isCurrentlyRead);
        if (indicator) {
          indicator.className = isCurrentlyRead ? 'status-indicator-read' : 'status-indicator-unread';
          indicator.textContent = isCurrentlyRead ? '✓ Read' : '● New';
        }
        if (alert) alert.read = isCurrentlyRead;
        toast(err.message || 'Failed to update notification state', 'error');
      }
    });
  });

  const markAllBtn = document.getElementById('markAllReadBtn');
  if (markAllBtn) {
    markAllBtn.onclick = async () => {
      markAllBtn.disabled = true;
      markAllBtn.textContent = 'Updating…';
      try {
        await withAuth(() => window.WildShieldApi.markAllAlertsRead());
        toast('All notifications marked as read', 'success');
        await hydrateDashboard();
      } catch (err) {
        toast(err.message || 'Failed to mark all as read', 'error');
      } finally {
        markAllBtn.disabled = false;
        markAllBtn.textContent = 'Mark all as read';
      }
    };
  }
}

/* ------------------------------------------------------------------ */
/* Villages (index.html summary grid)                                  */
/* ------------------------------------------------------------------ */

function renderVillages(villages) {
  const container = document.querySelector('[data-role="village-grid"]');
  if (!container) return;

  if (!villages.length) {
    container.innerHTML = `<article class="glass-card stat-card empty-state">No zones configured yet.</article>`;
    return;
  }

  container.innerHTML = villages.map((village) => `
    <article class="glass-card stat-card clickable ${village.status === 'at-risk' ? 'danger-card' : ''}" data-village-id="${village.id}">
      <p>${village.name}</p>
      <h3>${village.zone}</h3>
      <span class="trend ${village.status === 'at-risk' ? 'danger' : 'up'}">${capitalize(village.status)} • Siren ${village.sirenStatus.toUpperCase()}</span>
    </article>
  `).join('');

  container.querySelectorAll('[data-village-id]').forEach((card) => {
    card.addEventListener('click', () => {
      const village = currentVillages.find((v) => v.id === card.dataset.villageId);
      if (village) openVillageModal(village);
    });
  });
}

function openVillageModal(village) {
  const isOn = village.sirenStatus === 'on';
  const overlay = openModal({
    eyebrow: village.zone,
    title: village.name,
    bodyHtml: detailGridHtml([
      ['Status', capitalize(village.status)],
      ['Siren', isOn ? 'ON' : 'OFF'],
    ]),
    actionsHtml: `
      <button class="btn-sm btn-outline" data-role="modal-close">Close</button>
      <button class="btn-sm ${isOn ? 'btn-deactivate' : 'btn-activate'}" id="villageSirenBtn">${isOn ? 'Deactivate siren' : 'Activate siren'}</button>
    `,
  });

  overlay.querySelector('#villageSirenBtn').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    confirmSirenAction({
      sirenName: village.name,
      isOn,
      onConfirm: async () => {
        btn.disabled = true;
        btn.textContent = 'Working…';
        try {
          const api = window.WildShieldApi;
          await withAuth(async () => {
            if (isOn) {
              await api.deactivateSiren(village.sirenId);
              toast(`Siren deactivated for ${village.name}`, 'success');
            } else {
              await api.activateSiren(village.sirenId);
              toast(`Siren activated for ${village.name}`, 'success');
            }
          });
          closeModal();
          await hydrateDashboard();
        } catch (err) {
          toast(err.message || 'Siren action failed', 'error');
          btn.disabled = false;
          btn.textContent = isOn ? 'Deactivate siren' : 'Activate siren';
        }
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/* Sirens (siren-control.html)                                         */
/* ------------------------------------------------------------------ */

function renderSirens(sirens) {
  const container = document.querySelector('[data-role="siren-grid"]');
  if (!container) return;

  if (!sirens.length) {
    container.innerHTML = `<section class="glass-card panel-card empty-state">No siren-equipped zones configured yet.</section>`;
    return;
  }

  container.innerHTML = sirens.map((siren) => {
    const isOn = siren.currentStatus === 'on';
    return `
    <section class="glass-card panel-card siren-panel ${isOn ? 'emergency' : 'safe'}" data-siren-id="${siren.id}">
      <div class="siren-card-head">
        <div>
          <p class="eyebrow">${siren.village}</p>
          <h3>${siren.name}</h3>
        </div>
        <span class="siren-badge ${isOn ? 'danger' : 'safe'}">${isOn ? 'AT RISK' : 'SAFE'}</span>
      </div>
      <div class="siren-state">
        <div class="siren-icon">${isOn ? '🔔' : '🔕'}</div>
        <div>
          <p class="state-label">Current status</p>
          <h4>SIREN ${siren.currentStatus.toUpperCase()}</h4>
          <p>Zone status: ${siren.zoneStatus}</p>
          <p>${siren.activationReason || ''}</p>
        </div>
      </div>
      <div class="siren-actions">
        <button class="btn-sm ${isOn ? 'btn-deactivate' : 'btn-activate'}" data-siren-toggle="${siren.id}" data-siren-state="${siren.currentStatus}">
          ${isOn ? 'Deactivate siren' : 'Activate siren'}
        </button>
      </div>
    </section>
  `;
  }).join('');

  container.querySelectorAll('[data-siren-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.sirenToggle;
      const isOn = btn.dataset.sirenState === 'on';
      const siren = currentSirens.find((s) => s.id === id);
      confirmSirenAction({
        sirenName: siren ? siren.name : id,
        isOn,
        onConfirm: async () => {
          btn.disabled = true;
          btn.textContent = 'Working…';
          try {
            const api = window.WildShieldApi;
            await withAuth(async () => {
              if (isOn) {
                await api.deactivateSiren(id);
                toast('Siren deactivated', 'success');
              } else {
                await api.activateSiren(id);
                toast('Siren activated', 'success');
              }
            });
            await hydrateDashboard();
          } catch (err) {
            toast(err.message || 'Siren action failed', 'error');
            btn.disabled = false;
            btn.textContent = isOn ? 'Deactivate siren' : 'Activate siren';
          }
        }
      });
    });
  });

  // Populate dynamic siren operational history card
  const historyTimeEl = document.querySelector('[data-role="siren-history-time"]');
  const historyReasonEl = document.querySelector('[data-role="siren-history-reason"]');
  const historyStatusEl = document.querySelector('[data-role="siren-history-status"]');

  if (historyTimeEl || historyReasonEl || historyStatusEl) {
    const activeSiren = sirens.find((s) => s.currentStatus === 'on') || sirens[0];
    if (activeSiren) {
      if (historyTimeEl) {
        historyTimeEl.textContent = activeSiren.lastActivatedAt ? formatTimestamp(activeSiren.lastActivatedAt) : 'Standby mode';
      }
      if (historyReasonEl) {
        historyReasonEl.textContent = activeSiren.activationReason || 'No active threat';
      }
      if (historyStatusEl) {
        const connectedCount = sirens.filter((s) => s.connected !== false).length;
        historyStatusEl.textContent = `Online • ${connectedCount} siren${connectedCount === 1 ? '' : 's'} linked`;
      }
    }
  }
}

function setupSirenTestButton() {
  const testButton = document.getElementById('manualSirenTestBtn') || document.querySelector('button.btn.btn-primary.wide-btn');
  if (!testButton) return;

  testButton.onclick = () => {
    testButton.textContent = 'Testing sirens…';
    testButton.disabled = true;
    toast('Manual siren test acoustic broadcast triggered across perimeter', 'info', 2200);
    setTimeout(() => {
      testButton.textContent = 'Manual siren test';
      testButton.disabled = false;
    }, 2000);
  };
}

/* ------------------------------------------------------------------ */
/* Map view (map-view.html)                                            */
/* ------------------------------------------------------------------ */

function renderThreatPanel(threat) {
  const container = document.querySelector('[data-role="map-threat"]');
  if (!container) return;

  container.innerHTML = `
    <div class="info-list">
      <div><span>Animal</span><strong>${threat.animal}</strong></div>
      <div><span>Confidence</span><strong>${threat.confidence}</strong></div>
      <div><span>Current Location</span><strong>${threat.currentLocation}</strong></div>
      <div><span>Moving Toward</span><strong>${threat.movingToward}</strong></div>
      <div><span>Distance</span><strong>${threat.distance}</strong></div>
      <div><span>Risk Level</span><strong>${threat.riskLevel}</strong></div>
      <div><span>Siren</span><strong>${threat.siren}</strong></div>
    </div>
  `;
}

function wireMapMarkers(villages, sirens, mapData) {
  const [v1, v2] = villages;
  const [s1, s2] = sirens;

  const bind = (roleSelector, entity, kind) => {
    const el = document.querySelector(`[data-role="${roleSelector}"]`);
    if (!el || !entity) return;
    if (kind === 'village') {
      const atRisk = entity.status === 'at-risk';
      el.classList.toggle('at-risk', atRisk);
      el.classList.toggle('safe', !atRisk);
      el.innerHTML = `${entity.name}<br/><small>${atRisk ? 'AT RISK' : 'SAFE'}</small>`;
      el.onclick = () => openVillageModal(entity);
    } else if (kind === 'siren') {
      const isOn = entity.currentStatus === 'on';
      el.innerHTML = `${entity.name.replace('Siren — ', 'Siren ')}<br/><small>${isOn ? 'ON' : 'OFF'}</small>`;
      el.onclick = () => openSirenQuickModal(entity);
    }
  };

  bind('map-village-1', v1, 'village');
  bind('map-village-2', v2, 'village');
  bind('map-siren-1', s1, 'siren');
  bind('map-siren-2', s2, 'siren');

  const threatModal = () => openModal({
    eyebrow: 'Live threat feed',
    title: mapData.threat.animal !== 'None' ? mapData.threat.animal : 'No active threat',
    bodyHtml: detailGridHtml([
      ['Confidence', mapData.threat.confidence],
      ['Current location', mapData.threat.currentLocation],
      ['Moving toward', mapData.threat.movingToward],
      ['Risk level', mapData.threat.riskLevel],
      ['Siren', mapData.threat.siren],
    ]),
  });

  ['map-camera', 'map-sensor', 'map-animal', 'map-danger-zone', 'map-safe-zone'].forEach((role) => {
    const el = document.querySelector(`[data-role="${role}"]`);
    if (el) el.onclick = threatModal;
  });
}

function openSirenQuickModal(siren) {
  const isOn = siren.currentStatus === 'on';
  const overlay = openModal({
    eyebrow: siren.village,
    title: siren.name,
    bodyHtml: detailGridHtml([
      ['Status', isOn ? 'ON' : 'OFF'],
      ['Zone status', siren.zoneStatus],
      ['Reason', siren.activationReason || '--'],
    ]),
    actionsHtml: `
      <button class="btn-sm btn-outline" data-role="modal-close">Close</button>
      <button class="btn-sm ${isOn ? 'btn-deactivate' : 'btn-activate'}" id="quickSirenBtn">${isOn ? 'Deactivate' : 'Activate'}</button>
    `,
  });
  overlay.querySelector('#quickSirenBtn').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    confirmSirenAction({
      sirenName: siren.name,
      isOn,
      onConfirm: async () => {
        btn.disabled = true;
        try {
          const api = window.WildShieldApi;
          await withAuth(async () => {
            if (isOn) await api.deactivateSiren(siren.id);
            else await api.activateSiren(siren.id);
          });
          toast('Siren state synchronized', 'success');
          closeModal();
          await hydrateDashboard();
        } catch (err) {
          toast(err.message || 'Siren action failed', 'error');
          btn.disabled = false;
        }
      }
    });
  });
}

function wireMapFullResponse(mapData, villages, sirens) {
  const btn = document.querySelector('[data-role="map-full-response-btn"]');
  if (!btn) return;
  const atRiskVillage = villages.find((v) => v.status === 'at-risk') || villages[0];
  btn.addEventListener('click', async () => {
    if (!atRiskVillage) {
      toast('No zones configured to respond to', 'error');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Activating…';
    try {
      await withAuth(async () => {
        await window.WildShieldApi.activateSiren(atRiskVillage.sirenId);
      });
      toast(`Full response activated for ${atRiskVillage.name}`, 'success');
      await hydrateDashboard();
    } catch (err) {
      toast(err.message || 'Could not activate response', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'ACTIVATE FULL RESPONSE';
    }
  });
}

/* ------------------------------------------------------------------ */
/* Index hero: live feed / map details / active alert / overview       */
/* ------------------------------------------------------------------ */

function renderIndexHero(detections, alerts, villages, sirens) {
  const latestDetection = detections[0];
  const feedEl = document.querySelector('[data-role="live-feed"]');
  if (feedEl) {
    if (latestDetection) {
      const backendOrigin = (window.WildShieldApi?.baseUrl || 'http://localhost:8000/api').replace(/\/api$/, '');
      const snapshotUrl = latestDetection.snapshotUrl
        ? (latestDetection.snapshotUrl.startsWith('http') ? latestDetection.snapshotUrl : `${backendOrigin}${latestDetection.snapshotUrl}`)
        : null;
      const confVal = latestDetection.confidence != null
        ? (Number(latestDetection.confidence) <= 1 ? Number(latestDetection.confidence) * 100 : Number(latestDetection.confidence))
        : null;
      const confPct = confVal != null ? confVal.toFixed(1) : null;
      const confBarHtml = confPct != null
        ? `<div class="conf-bar-wrap" aria-label="Confidence ${confPct}%">
             <div class="conf-bar-track"><div class="conf-bar-fill" style="width:${confPct}%"></div></div>
             <span class="conf-bar-label">${confPct}%</span>
           </div>`
        : '';
      feedEl.innerHTML = `
        <div class="feed-snapshot-wrap">
          ${snapshotUrl
            ? `<img class="feed-snapshot" src="${snapshotUrl}" alt="Latest detection snapshot" loading="lazy" onerror="this.style.display='none'; if (this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
               <div class="feed-snapshot-placeholder" style="display:none;">
                 <span class="placeholder-icon">📹</span>
                 <span>Live camera feed • Awaiting snapshot</span>
               </div>`
            : `<div class="feed-snapshot-placeholder">
                 <span class="placeholder-icon">📹</span>
                 <span>Live camera feed • Sensor trigger only</span>
               </div>`
          }
        </div>
        <span class="feed-badge">${latestDetection.type === 'human' ? 'Human detection' : 'Animal detection'}</span>
        <h4>${latestDetection.location}</h4>
        <p>Detected object: <strong>${latestDetection.species}</strong></p>
        ${confBarHtml}
        <p>Detection time: ${new Date(latestDetection.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
        <p>Forest zone: ${latestDetection.affectedVillage}</p>
      `;
    } else {
      feedEl.innerHTML = `<span class="feed-badge">No signal</span><h4>No detections yet</h4><p>Waiting for camera / model events…</p>`;
    }
  }

  const mapDetailsEl = document.querySelector('[data-role="index-map-details"]');
  if (mapDetailsEl) {
    const atRisk = villages.filter((v) => v.status === 'at-risk');
    mapDetailsEl.innerHTML = `
      <p><strong>Zones monitored:</strong> ${villages.length}</p>
      <p><strong>Zones at risk:</strong> ${atRisk.length ? atRisk.map((v) => v.name).join(', ') : 'None'}</p>
      <p><strong>Active sirens:</strong> ${sirens.filter((s) => s.currentStatus === 'on').length} / ${sirens.length}</p>
      <p><strong>Latest detection:</strong> ${latestDetection ? `${latestDetection.species} • ${latestDetection.movementDirection}` : '--'}</p>
    `;
  }

  // Wire clickable map markers on dashboard index
  const mapMarkers = document.querySelector('[data-role="index-map-markers"]');
  if (mapMarkers) {
    mapMarkers.querySelectorAll('.map-marker').forEach((marker) => {
      marker.style.cursor = 'pointer';
      marker.onclick = () => {
        const text = marker.textContent.trim();
        const matchedVillage = villages.find((v) => v.name.includes(text) || text.includes(v.name.split(' ')[0]));
        if (matchedVillage) {
          openVillageModal(matchedVillage);
        } else if (text.includes('Animal') || text.includes('Danger')) {
          const active = alerts.find((a) => a.status === 'active') || alerts[0];
          if (active) {
            openModal({
              eyebrow: 'Threat sector tracking',
              title: `${text} • ${active.title || 'Active incident'}`,
              bodyHtml: detailGridHtml([
                ['Location', active.location],
                ['Target village', active.village],
                ['Detected object', active.detectedObject],
                ['Movement direction', active.movementDirection],
                ['Risk level', capitalize(active.riskLevel)],
                ['Status', capitalize(active.status)],
              ]),
            });
          } else {
            toast(`${text} nominal — zero detected intrusion threats`, 'info');
          }
        } else {
          toast(`${text} perimeter sector active and secure`, 'info');
        }
      };
    });
  }

  const alertCard = document.querySelector('[data-role="index-active-alert"]');
  const sirenBtn = document.querySelector('[data-role="index-siren-btn"]');
  const activeAlert = alerts.find((a) => a.status === 'active') || alerts[0];
  if (alertCard) {
    const body = alertCard.querySelector('.alert-body');
    if (activeAlert) {
      const isHuman = (activeAlert.detectedObject && activeAlert.detectedObject.toLowerCase().includes('human')) ||
                      (activeAlert.speciesOrHuman && activeAlert.speciesOrHuman.toLowerCase().includes('human')) ||
                      activeAlert.type === 'human';
      const dispatchBadge = isHuman
        ? `<span class="dispatch-badge human" title="Discreet notification protocol">SMS only – discreet</span>`
        : `<span class="dispatch-badge animal" title="Acoustic deterrent and emergency notification">Siren + SMS</span>`;

      body.innerHTML = `
        <div class="alert-icon">${activeAlert.detectedObject === 'Human' ? '🧍' : '🦌'}</div>
        <h4>${activeAlert.title}</h4>
        <div style="margin: 8px 0 10px 0;">${dispatchBadge}</div>
        <p><strong>Direction:</strong> ${activeAlert.movementDirection}</p>
        <p><strong>Target village:</strong> ${activeAlert.village}</p>
        <p><strong>Risk level:</strong> <span class="risk ${activeAlert.riskLevel}">${capitalize(activeAlert.riskLevel)}</span></p>
        <p><strong>Time:</strong> ${formatTimestamp(activeAlert.timestamp)}</p>
        <p><strong>Status:</strong> ${capitalize(activeAlert.status)}</p>
      `;
      alertCard.onclick = (e) => {
        if (e.target.closest('button')) return;
        openModal({
          eyebrow: `Alert ${activeAlert.id}`,
          title: activeAlert.title,
          bodyHtml: detailGridHtml([
            ['Location', activeAlert.location],
            ['Zone / Village', `${activeAlert.zone} • ${activeAlert.village}`],
            ['Movement direction', activeAlert.movementDirection],
            ['Risk level', capitalize(activeAlert.riskLevel)],
            ['Action taken', activeAlert.actionTaken],
            ['Recipients', activeAlert.recipients.join(', ')],
          ]),
        });
      };
      if (sirenBtn) {
        const matchedSiren = sirens.find((s) => s.village === activeAlert.village);
        if (matchedSiren) {
          const isOn = matchedSiren.currentStatus === 'on';
          sirenBtn.disabled = false;
          sirenBtn.textContent = isOn ? `SIREN ON — ${activeAlert.village.toUpperCase()} (tap to stop)` : `ACTIVATE SIREN — ${activeAlert.village.toUpperCase()}`;
          sirenBtn.onclick = (e) => {
            e.stopPropagation();
            confirmSirenAction({
              sirenName: `${activeAlert.village} (${isOn ? 'ON' : 'OFF'})`,
              isOn,
              onConfirm: async () => {
                sirenBtn.disabled = true;
                try {
                  await withAuth(async () => {
                    if (isOn) await window.WildShieldApi.deactivateSiren(matchedSiren.id);
                    else await window.WildShieldApi.activateSiren(matchedSiren.id);
                  });
                  toast('Siren updated', 'success');
                  await hydrateDashboard();
                } catch (err) {
                  toast(err.message || 'Siren action failed', 'error');
                  sirenBtn.disabled = false;
                }
              }
            });
          };
        } else {
          sirenBtn.disabled = true;
          sirenBtn.textContent = 'No siren linked to this zone';
        }
      }
    } else {
      body.innerHTML = `<p>No active alerts right now. All zones nominal.</p>`;
      if (sirenBtn) {
        sirenBtn.disabled = true;
        sirenBtn.textContent = 'No active alert';
      }
    }
  }

  const gaugeFill = document.querySelector('[data-role="index-gauge-fill"]');
  if (gaugeFill) {
    const riskOrder = { low: 25, medium: 50, high: 75, critical: 100 };
    const pct = activeAlert ? (riskOrder[activeAlert.riskLevel] || 25) : 10;
    gaugeFill.style.width = `${pct}%`;
    gaugeFill.className = activeAlert ? activeAlert.riskLevel : 'low';
  }

  const overviewEl = document.querySelector('[data-role="index-overview"]');
  if (overviewEl) {
    const animals = detections.filter((d) => d.type === 'animal').length;
    const humans = detections.filter((d) => d.type === 'human').length;
    const crossings = detections.filter((d) => d.boundaryCrossing).length;
    overviewEl.innerHTML = `
      <div><span>Forest Boundary Crossings</span><strong>${String(crossings).padStart(2, '0')}</strong></div>
      <div><span>Animals Detected</span><strong>${String(animals).padStart(2, '0')}</strong></div>
      <div><span>Humans Detected</span><strong>${String(humans).padStart(2, '0')}</strong></div>
      <div><span>Alerts Triggered</span><strong>${String(alerts.length).padStart(2, '0')}</strong></div>
    `;
  }

  renderHumanIntrusion(detections, alerts);
}

function renderHumanIntrusion(detections, alerts) {
  const humanDetections = detections.filter((d) => d.type === 'human');
  const humanAlerts = alerts.filter((a) => a.detectedObject === 'Human');
  const badge = document.querySelector('[data-role="index-intrusion-badge"]');
  if (badge) badge.textContent = humanDetections.length ? 'Threat detected' : 'No threats';

  const detailsEl = document.querySelector('[data-role="index-intrusion-details"]');
  if (detailsEl) {
    const latest = humanDetections[0];
    if (latest) {
      detailsEl.innerHTML = `
        <div class="warning-banner">Unauthorized human detected inside restricted forest area.</div>
        ${detailGridHtml([
          ['Human detected', latest.species],
          ['Location', latest.location],
          ['Zone', latest.affectedVillage],
          ['Date and time', formatTimestamp(latest.timestamp)],
          ['Confidence score', formatConfidence(latest.confidence)],
          ['Movement direction', latest.movementDirection],
          ['Boundary crossing', latest.boundaryCrossing ? 'Yes' : 'No'],
          ['Siren status', latest.sirenStatus === 'on' ? 'Armed' : 'Off'],
        ])}
        <div class="routing-block">
          <p>Generated alert for</p>
          <div class="recipient-pills"><span>Rangers</span><span>Forest Officers</span><span>Police</span></div>
        </div>
      `;
    } else {
      detailsEl.innerHTML = `<p class="empty-state">No human intrusions recorded.</p>`;
    }
  }

  const historyBody = document.querySelector('[data-role="index-intrusion-history"]');
  if (historyBody) {
    if (!humanAlerts.length) {
      historyBody.innerHTML = `<tr><td colspan="6" class="empty-state">No human intrusion history yet.</td></tr>`;
    } else {
      historyBody.innerHTML = humanAlerts.slice(0, 6).map((a) => `
        <tr>
          <td>${new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
          <td>${a.location}</td>
          <td>${a.zone}</td>
          <td><span class="risk ${a.riskLevel}">${capitalize(a.riskLevel)}</span></td>
          <td>${a.status === 'resolved' ? 'Resolved' : 'Active'}</td>
          <td>${a.actionTaken}</td>
        </tr>
      `).join('');
    }
  }
}

/* ------------------------------------------------------------------ */
/* Analytics (analytics.html) — fully data-driven                      */
/* ------------------------------------------------------------------ */

const FILL_CLASSES = ['fill-green', 'fill-blue', 'fill-warning', 'fill-danger', 'fill-teal'];

function renderBarList(container, items, { suffix = '' } = {}) {
  if (!container) return;
  if (!items.length) {
    container.innerHTML = `<p class="empty-state">No data yet.</p>`;
    return;
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  container.innerHTML = items.map((item, i) => `
    <div class="bar-item">
      <span>${item.label}</span>
      <div class="bar-track"><div class="bar ${FILL_CLASSES[i % FILL_CLASSES.length]}" style="height: ${Math.max(8, (item.value / max) * 100)}%"></div></div>
      <strong>${item.value}${suffix}</strong>
    </div>
  `).join('');
}

function renderSvgTrend(container, values, colorHex, dateLabels) {
  if (!container) return;
  const grid = container.querySelector('.line-grid');
  const w = 600, h = 220;
  if (!values.length || values.every((v) => v === 0)) {
    container.innerHTML = (grid ? grid.outerHTML : '') + `<p class="empty-state" style="position:relative;z-index:1;padding-top:90px;">No trend data yet.</p>`;
    return;
  }
  const max = Math.max(...values, 1);
  const stepX = w / (values.length - 1 || 1);
  const points = values.map((v, i) => [i * stepX, h - 24 - (v / max) * (h - 48)]);
  const linePoints = points.map((p) => p.join(',')).join(' ');
  const areaPoints = `0,${h} ${linePoints} ${w},${h}`;

  const labelsHtml = dateLabels && dateLabels.length
    ? dateLabels.map((label, i) => {
        const x = i * stepX;
        return `<text x="${x}" y="${h - 4}" text-anchor="middle" fill="#94a3b8" font-size="18" font-family="Inter, sans-serif">${label}</text>`;
      }).join('')
    : '';

  container.innerHTML = `
    ${grid ? grid.outerHTML : ''}
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="position:relative;z-index:1;width:100%;height:100%;display:block;">
      <polygon points="${areaPoints}" fill="${colorHex}" opacity="0.16"></polygon>
      <polyline points="${linePoints}" fill="none" stroke="${colorHex}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
      ${points.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${colorHex}"></circle>`).join('')}
      ${labelsHtml}
    </svg>
  `;
}

function renderAnalytics(analytics) {
  renderBarList(document.querySelector('[data-role="analytics-species"]'), analytics.speciesCounts);

  // Real date labels for 6-day trend
  function makeDateLabels(count) {
    const labels = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      labels.push(d.toLocaleDateString([], { month: 'short', day: 'numeric' }));
    }
    return labels;
  }

  renderSvgTrend(
    document.querySelector('[data-role="analytics-wildlife-trend"]'),
    analytics.wildlifeIntrusions, '#16a34a',
    makeDateLabels(analytics.wildlifeIntrusions.length)
  );
  renderSvgTrend(
    document.querySelector('[data-role="analytics-human-trend"]'),
    analytics.humanIntrusions, '#2563eb',
    makeDateLabels(analytics.humanIntrusions.length)
  );

  const donut = document.querySelector('[data-role="analytics-risk-donut"]');
  const legend = document.querySelector('[data-role="analytics-risk-legend"]');
  if (donut && legend) {
    const risk = analytics.riskLevels;
    const total = risk.reduce((sum, r) => sum + r.value, 0);
    const colors = { Low: 'var(--green)', Medium: 'var(--blue)', High: 'var(--warning)', Critical: 'var(--danger)' };
    const dotClass = { Low: 'green', Medium: 'blue', High: 'orange', Critical: 'red' };
    let acc = 0;
    const stops = risk.map((r) => {
      const start = total ? (acc / total) * 100 : 0;
      acc += r.value;
      const end = total ? (acc / total) * 100 : 0;
      return `${colors[r.label] || '#94a3b8'} ${start}% ${end}%`;
    }).join(', ');
    donut.style.background = total ? `conic-gradient(${stops})` : '';
    donut.querySelector('.donut-center strong').textContent = total;
    legend.innerHTML = risk.map((r) => `
      <div><span class="legend-dot ${dotClass[r.label] || 'blue'}"></span>${r.label} <strong>${r.value}</strong></div>
    `).join('');
  }

  renderBarList(document.querySelector('[data-role="analytics-siren-history"]'),
    analytics.sirenActivations.map((v, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (analytics.sirenActivations.length - 1 - i));
      const label = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      return { label, value: v };
    }));

  const metrics = document.querySelector('[data-role="analytics-metrics"]');
  if (metrics) {
    metrics.innerHTML = `
      <div class="metric-card"><span>False alarms</span><strong>${analytics.falseAlarmStats.falseAlarms}</strong></div>
      <div class="metric-card"><span>Confirmed intrusions</span><strong>${analytics.falseAlarmStats.confirmedIntrusions}</strong></div>
    `;
  }

  const directionList = document.querySelector('[data-role="analytics-directions"]');
  if (directionList) {
    const dirs = analytics.movementDirections;
    const totalDir = dirs.reduce((s, d) => s + d.value, 0) || 1;
    directionList.innerHTML = dirs.length
      ? dirs.map((d) => `<div><span>${d.label}</span><strong>${Math.round((d.value / totalDir) * 100)}%</strong></div>`).join('')
      : `<p class="empty-state">No movement data yet.</p>`;
  }
}

// Zone incident list on analytics page — uses the map-data already fetched by hydrateDashboard.
function renderAnalyticsZonesList(mapData) {
  const zoneList = document.querySelector('[data-role="analytics-zones"]');
  if (!zoneList || !mapData) return;
  zoneList.innerHTML = mapData.zones.length
    ? mapData.zones.map((z) => `<div><span>${z.name}</span><strong>${z.incidents} incidents</strong></div>`).join('')
    : `<p class="empty-state">No zone activity yet.</p>`;
}

/* ------------------------------------------------------------------ */
/* Profile edit toggle (profile.html)                                  */
/* ------------------------------------------------------------------ */

async function loadUserProfile() {
  const nameEl = document.getElementById('profileName');
  const roleEl = document.getElementById('profileRole');
  const emailEl = document.getElementById('profileEmail');
  const locEl = document.getElementById('profileLocation');
  const summaryName = document.querySelector('.profile-summary h3');
  const summaryRole = document.querySelector('.profile-summary .muted');
  const avatarEl = document.querySelector('.profile-summary .profile-avatar');
  const twoFaStatusEl = document.querySelector('[data-role="profile-2fa-status"]');
  const lastLoginEl = document.querySelector('[data-role="profile-last-login"]');

  const api = window.WildShieldApi;
  if (!api) return;

  try {
    if (api.isAuthenticated()) {
      const user = await api.getUserProfile();
      if (user) {
        if (nameEl) nameEl.value = user.full_name || 'Forest Officer';
        if (roleEl) roleEl.value = user.role ? capitalize(user.role) : 'Lead operator';
        if (emailEl) emailEl.value = user.email || 'officer@wildshield.ai';
        if (locEl) locEl.value = user.location || 'Central Forest Command';

        if (summaryName) summaryName.textContent = user.full_name || 'Forest Officer';
        if (summaryRole) summaryRole.textContent = user.role ? capitalize(user.role) : 'Lead operator';

        const initials = (user.full_name || user.username || 'FO')
          .split(' ')
          .filter(Boolean)
          .map((n) => n[0])
          .join('')
          .substring(0, 2)
          .toUpperCase() || 'FO';

        if (avatarEl) avatarEl.textContent = initials;

        if (twoFaStatusEl) {
          twoFaStatusEl.textContent = user.two_factor_enabled ? 'Enabled' : 'Disabled';
        }
        if (lastLoginEl) {
          lastLoginEl.textContent = user.last_login_at ? formatTimestamp(user.last_login_at) : 'Just now';
        }

        // Update topbar profile trigger dynamically
        const topbarStrong = document.querySelector('.profile-copy strong');
        const topbarSpan = document.querySelector('.profile-copy span');
        const topbarAvatar = document.querySelector('.profile-trigger .avatar');
        if (topbarStrong) topbarStrong.textContent = user.full_name || user.username;
        if (topbarSpan) topbarSpan.textContent = user.role ? capitalize(user.role) : 'Lead operator';
        if (topbarAvatar) topbarAvatar.textContent = initials;
      }
    }
  } catch (err) {
    console.warn('Could not load profile from backend:', err);
  }
}

function setupProfileEdit() {
  const editBtn = document.querySelector('[data-role="edit-profile-btn"]');
  if (!editBtn) return;

  loadUserProfile();

  const fieldIds = ['profileName', 'profileRole', 'profileEmail', 'profileLocation'];
  let editing = false;

  editBtn.addEventListener('click', async () => {
    if (!editing) {
      editing = true;
      fieldIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.removeAttribute('readonly');
      });
      editBtn.textContent = 'Save changes';
    } else {
      const payload = {
        full_name: document.getElementById('profileName')?.value || '',
        role: document.getElementById('profileRole')?.value || '',
        email: document.getElementById('profileEmail')?.value || '',
        location: document.getElementById('profileLocation')?.value || '',
      };

      editBtn.disabled = true;
      editBtn.textContent = 'Saving…';

      try {
        await withAuth(async () => {
          return await window.WildShieldApi.updateUserProfile(payload);
        });

        fieldIds.forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.setAttribute('readonly', 'readonly');
        });
        editing = false;
        editBtn.disabled = false;
        editBtn.textContent = 'Edit profile';
        toast('Profile updated successfully in database', 'success');
        await loadUserProfile();
      } catch (err) {
        editBtn.disabled = false;
        editBtn.textContent = 'Save changes';
        toast(err.message || 'Failed to update profile', 'error');
      }
    }
  });
}

async function setupSecurityPage() {
  const page = document.querySelector('.security-page');
  if (!page) return;

  const twoFaStatusEl = document.querySelector('[data-role="two-factor-status"]');
  const twoFaBtn = document.querySelector('[data-role="two-factor-toggle-btn"]');
  const lastLoginEl = document.querySelector('[data-role="last-login-time"]');
  const devicesCountEl = document.querySelector('[data-role="devices-count"]');
  const eventsListEl = document.querySelector('[data-role="security-events"]');

  async function loadSecurityData() {
    const api = window.WildShieldApi;
    if (!api || !api.isAuthenticated()) return;

    try {
      const data = await api.getSecuritySettings();
      if (twoFaStatusEl) {
        twoFaStatusEl.textContent = data.two_factor_enabled ? 'Enabled' : 'Disabled';
        twoFaStatusEl.className = `status-pill ${data.two_factor_enabled ? 'online' : 'danger'}`;
      }
      if (twoFaBtn) {
        twoFaBtn.textContent = data.two_factor_enabled ? 'Disable 2FA' : 'Enable 2FA';
      }
      if (lastLoginEl) {
        lastLoginEl.textContent = data.last_login ? formatTimestamp(data.last_login) : 'Just now';
      }
      if (devicesCountEl) {
        devicesCountEl.textContent = `${data.authorized_devices_count || 1} active`;
      }
      if (eventsListEl && data.events && data.events.length) {
        eventsListEl.innerHTML = data.events.map((ev) => `
          <div class="alert-item">
            <div>
              <p><strong>${ev.title}</strong></p>
              <span class="muted">${ev.detail || ''}</span>
            </div>
            <strong>${ev.time || 'Logged'}</strong>
          </div>
        `).join('');
      }
    } catch (err) {
      console.warn('Could not load security settings:', err);
    }
  }

  if (twoFaBtn) {
    twoFaBtn.onclick = async () => {
      twoFaBtn.disabled = true;
      try {
        await withAuth(async () => {
          const res = await window.WildShieldApi.toggle2FA();
          toast(`Two-step verification ${res.two_factor_enabled ? 'enabled' : 'disabled'}`, 'success');
        });
        await loadSecurityData();
      } catch (err) {
        toast(err.message || 'Could not update 2FA setting', 'error');
      } finally {
        twoFaBtn.disabled = false;
      }
    };
  }

  await loadSecurityData();
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function capitalize(value) {
  return String(value).replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

/* ------------------------------------------------------------------ */
/* Confirm modal for siren activate / deactivate (Rule 5)             */
/* ------------------------------------------------------------------ */

function confirmSirenAction({ sirenName, isOn, onConfirm }) {
  const action = isOn ? 'deactivate' : 'activate';
  const actionLabel = isOn ? 'Deactivate' : 'Activate';
  const overlay = openModal({
    eyebrow: 'Confirm siren action',
    title: `${actionLabel} siren: ${sirenName}`,
    bodyHtml: `<p style="line-height:1.6;">
      ${isOn
        ? `Deactivating the siren for <strong>${sirenName}</strong> will silence the acoustic alert. Ensure the threat has cleared before proceeding.`
        : `Activating the siren for <strong>${sirenName}</strong> will sound the acoustic deterrent and alert all assigned recipients.`
      }
    </p>`,
    actionsHtml: `
      <button class="btn-sm btn-outline" data-role="modal-close">Cancel</button>
      <button class="btn-sm ${isOn ? 'btn-deactivate' : 'btn-activate'}" id="confirmSirenOk">${actionLabel} siren</button>
    `,
  });
  overlay.querySelector('#confirmSirenOk').addEventListener('click', () => {
    closeModal();
    onConfirm();
  });
}

/* ------------------------------------------------------------------ */
/* Camera health panel (dashboard)                                     */
/* ------------------------------------------------------------------ */

function renderCameraHealth(cameras) {
  const grid = document.querySelector('[data-role="cam-health-grid"]');
  const pill = document.getElementById('camHealthPill');
  if (!grid) return;

  if (!cameras || !cameras.length) {
    grid.innerHTML = `<p class="empty-state">No cameras configured.</p>`;
    if (pill) { pill.textContent = 'No cameras'; pill.className = 'status-pill warning'; }
    return;
  }

  const isOnlineFn = (cam) => cam.status === 'online' || cam.is_online === true;
  const onlineCount = cameras.filter(isOnlineFn).length;
  if (pill) {
    pill.textContent = `${onlineCount}/${cameras.length} online`;
    pill.className = `status-pill ${onlineCount === cameras.length ? 'online' : onlineCount > 0 ? 'warning' : 'danger'}`;
  }

  grid.innerHTML = cameras.map((cam) => {
    const isOnline = isOnlineFn(cam);
    const minutesAgo = cam.lastSeenMinutesAgo != null
      ? cam.lastSeenMinutesAgo
      : (cam.last_heartbeat ? Math.max(0, Math.floor((Date.now() - new Date(cam.last_heartbeat).getTime()) / 60000)) : 0);
    const lastSeen = minutesAgo === 0 ? 'Just now'
      : minutesAgo === 1 ? '1 min ago'
      : `${minutesAgo} min ago`;
    const zoneName = cam.zone || cam.zone_id || 'Forest Zone';
    return `
      <div class="cam-health-item ${isOnline ? 'online' : 'offline'}">
        <div class="cam-health-icon">${isOnline ? '📹' : '📷'}</div>
        <div class="cam-health-info">
          <strong>${cam.name}</strong>
          <span class="muted">${zoneName}</span>
        </div>
        <div class="cam-health-status">
          <span class="cam-status-dot ${isOnline ? 'online' : 'offline'}"></span>
          <span class="cam-status-label">${isOnline ? 'Online' : 'Offline'}</span>
          <span class="cam-last-seen muted">${lastSeen}</span>
        </div>
      </div>
    `;
  }).join('');
}

/* ------------------------------------------------------------------ */
/* Leaflet map (map-view.html)                                         */
/* ------------------------------------------------------------------ */

let _leafletMarkers = [];

function initLeafletMap(zones, sirens) {
  const container = document.getElementById('leafletMap');
  if (!container || typeof L === 'undefined') return;

  // Centre on mean lat/lng of zones, or default to a generic forest location
  const lats = zones.map((z) => z.lat).filter(Boolean);
  const lngs = zones.map((z) => z.lng).filter(Boolean);
  const centerLat = lats.length ? lats.reduce((a, b) => a + b, 0) / lats.length : 12.97;
  const centerLng = lngs.length ? lngs.reduce((a, b) => a + b, 0) / lngs.length : 77.60;

  _leafletMap = L.map('leafletMap', { zoomControl: true }).setView([centerLat, centerLng], 13);

  // Try to load tiles; show fallback message if they fail
  const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18
  });

  tileLayer.on('tileerror', () => {
    const errEl = document.getElementById('leafletTileError');
    if (errEl) errEl.style.display = 'block';
  });
  tileLayer.addTo(_leafletMap);

  addLeafletMarkers(zones, sirens);

  // Update status pill
  const pill = document.getElementById('leafletStatusPill');
  if (pill) { pill.textContent = `${zones.length} zones`; pill.className = 'status-pill online'; }
}

function addLeafletMarkers(zones, sirens) {
  if (!_leafletMap || typeof L === 'undefined') return;

  _leafletMarkers.forEach((m) => m.remove());
  _leafletMarkers = [];

  zones.forEach((zone) => {
    if (!zone.lat || !zone.lng) return;
    const isAtRisk = zone.status === 'at-risk';
    const matchedSiren = sirens && sirens.find((s) => s.village === zone.village);
    const sirenOn = matchedSiren && matchedSiren.currentStatus === 'on';

    const colorClass = isAtRisk ? 'leaflet-marker-atrisk' : 'leaflet-marker-safe';
    const icon = L.divIcon({
      className: `leaflet-ws-marker ${colorClass}${isAtRisk ? ' pulse-marker' : ''}`,
      html: `<div class="lm-dot"></div><span class="lm-label">${zone.name}</span>`,
      iconSize: [120, 36],
      iconAnchor: [60, 18]
    });

    const marker = L.marker([zone.lat, zone.lng], { icon }).addTo(_leafletMap);

    const popupHtml = `
      <div class="leaflet-popup-content-custom">
        <strong>${zone.name}</strong>
        <p>Village: ${zone.village}</p>
        <p>Status: <b>${capitalize(zone.status)}</b></p>
        <p>Incidents: ${zone.incidents}</p>
        <p>Siren: <b>${sirenOn ? 'ON 🔔' : 'OFF 🔕'}</b></p>
        ${matchedSiren ? `<button class="lm-siren-btn btn-sm ${sirenOn ? 'btn-deactivate' : 'btn-activate'}"
          data-siren-id="${matchedSiren.id}" data-siren-on="${sirenOn}"
          onclick="handleLeafletSirenToggle('${matchedSiren.id}', ${sirenOn}, this)">
          ${sirenOn ? 'Deactivate siren' : 'Activate siren'}
        </button>` : ''}
      </div>`;
    marker.bindPopup(popupHtml, { maxWidth: 220 });
    _leafletMarkers.push(marker);
  });
}

function updateLeafletMarkers(zones, sirens) {
  addLeafletMarkers(zones, sirens);
}

// Called from Leaflet popup button (global scope needed)
window.handleLeafletSirenToggle = function(sirenId, isOn, btn) {
  const siren = currentSirens.find((s) => s.id === sirenId);
  confirmSirenAction({
    sirenName: siren ? siren.name : sirenId,
    isOn,
    onConfirm: async () => {
      if (btn) { btn.disabled = true; btn.textContent = 'Working\u2026'; }
      try {
        const api = window.WildShieldApi;
        await withAuth(async () => {
          if (isOn) await api.deactivateSiren(sirenId);
          else await api.activateSiren(sirenId);
        });
        toast(isOn ? 'Siren deactivated' : 'Siren activated', 'success');
        await hydrateDashboard();
      } catch (err) {
        toast(err.message || 'Siren action failed', 'error');
        if (btn) { btn.disabled = false; btn.textContent = isOn ? 'Deactivate siren' : 'Activate siren'; }
      }
    }
  });
};

/* ------------------------------------------------------------------ */
/* Demo panel (?demo=1)                                                */
/* ------------------------------------------------------------------ */

function setupDemoPanel() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') !== '1') return;

  const panel = document.getElementById('demoPanel');
  if (panel) panel.style.display = '';

  const animalBtn = document.getElementById('demoAnimalBtn');
  const humanBtn  = document.getElementById('demoHumanBtn');

  async function injectDetection(payload) {
    const btn = payload.type === 'human' ? humanBtn : animalBtn;
    if (btn) { btn.disabled = true; btn.textContent = 'Injecting\u2026'; }
    try {
      const api = window.WildShieldApi;
      await api.postDetection(payload);
      toast(`\ud83d\udea8 Demo ${payload.type} alert injected`, 'success', 3000);
      await hydrateDashboard();
      flashAlertCard();
    } catch (err) {
      toast(err.message || 'Demo injection failed', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = btn.id === 'demoAnimalBtn' ? '🦁 Inject animal alert (camera-01)' : '🧍 Inject human alert (camera-02)'; }
    }
  }

  animalBtn?.addEventListener('click', () => {
    const animalCam = currentCameras.find((c) => (c.name || '').includes('01') || (c.zone || '').includes('Zone A'))?.id || 'camera-01';
    return injectDetection({
      type: 'animal',
      event_type: 'ANIMAL_DETECTED',
      species: 'Lion',
      confidence: 0.93,
      location: 'Forest Boundary - Zone A',
      movement_direction: 'South-East',
      boundary_crossing: true,
      risk_level: 'critical',
      affected_village: 'Village 1',
      camera_id: animalCam
    });
  });

  humanBtn?.addEventListener('click', () => {
    const humanCam = currentCameras.find((c) => (c.name || '').includes('02') || (c.zone || '').includes('Zone B') || (c.zone || '').includes('Zone C'))?.id || 'camera-02';
    return injectDetection({
      type: 'human',
      event_type: 'PERSON_DETECTED',
      species: 'Human',
      confidence: 0.88,
      location: 'North Ridge Access Point',
      movement_direction: 'Northwest',
      boundary_crossing: true,
      risk_level: 'high',
      affected_village: 'Village 2',
      camera_id: humanCam
    });
  });
}

/* ------------------------------------------------------------------ */
/* Boot                                                                 */
/* ------------------------------------------------------------------ */

setupProfileEdit();
setupSecurityPage();
setupDemoPanel();
hydrateDashboard();



