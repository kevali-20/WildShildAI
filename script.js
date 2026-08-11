const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const mobileToggle = document.getElementById('mobileToggle');
const backdrop = document.getElementById('sidebarBackdrop');
const profileTrigger = document.getElementById('profileTrigger');
const profileMenu = document.querySelector('.profile-menu');
const dateTime = document.getElementById('currentDateTime');
let currentAlerts = [];

function updateDateTime() {
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

function setupSirenTestButton() {
  const testButton = document.querySelector('button.btn.btn-primary.wide-btn');
  if (!testButton) return;

  testButton.addEventListener('click', () => {
    testButton.textContent = 'Test activated';
    testButton.disabled = true;
    setTimeout(() => {
      testButton.textContent = 'Manual siren test';
      testButton.disabled = false;
    }, 1800);
  });
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

async function hydrateDashboard() {
  const api = window.WildShieldApi;
  if (!api) return;

  try {
    const [detections, alerts, villages, sirens, mapData] = await Promise.all([
      api.getDetections(),
      api.getActiveAlerts(),
      api.getVillages(),
      api.getSirens(),
      api.getMapData()
    ]);

    if (document.querySelector('[data-role="detections-table"]')) {
      renderDetectionsTable(detections);
    }

    if (document.querySelector('[data-role="alert-list"]')) {
      currentAlerts = alerts;
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
    }
  } catch (error) {
    console.error('Failed to hydrate WildShield UI', error);
  }
}

function renderDetectionsTable(detections) {
  const container = document.querySelector('[data-role="detections-table"]');
  if (!container) return;

  const rows = detections.slice(0, 4).map((item) => `
    <tr>
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
}

function renderAlertCards(alerts) {
  return alerts.map((alert) => `
    <article class="glass-card alert-card ${alert.riskLevel} ${alert.status}">
      <div class="alert-card-top">
        <div>
          <p class="eyebrow">Alert ID: ${alert.id}</p>
          <h3>${alert.title}</h3>
        </div>
        <span class="risk-badge ${alert.riskLevel}">${capitalize(alert.riskLevel)}</span>
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
      </div>
    </article>
  `).join('');
}

function renderAlerts(alerts) {
  const container = document.querySelector('[data-role="alert-list"]');
  if (!container) return;

  container.innerHTML = renderAlertCards(alerts);
}

function renderNotifications(alerts) {
  const container = document.querySelector('[data-role="notifications-list"]');
  if (!container) return;

  container.innerHTML = alerts.length
    ? renderAlertCards(alerts)
    : `<article class="glass-card panel-card"><p>No notifications available.</p></article>`;
}

function renderVillages(villages) {
  const container = document.querySelector('[data-role="village-grid"]');
  if (!container) return;

  container.innerHTML = villages.map((village) => `
    <article class="glass-card stat-card ${village.status === 'at-risk' ? 'danger-card' : ''}">
      <p>${village.name}</p>
      <h3>${village.zone}</h3>
      <span class="trend ${village.status === 'at-risk' ? 'danger' : 'up'}">${capitalize(village.status)} • ${village.sirenStatus.toUpperCase()}</span>
    </article>
  `).join('');
}

function renderSirens(sirens) {
  const container = document.querySelector('[data-role="siren-grid"]');
  if (!container) return;

  container.innerHTML = sirens.map((siren) => `
    <section class="glass-card panel-card siren-panel ${siren.currentStatus === 'on' ? 'emergency' : 'safe'}">
      <div class="siren-card-head">
        <div>
          <p class="eyebrow">${siren.village}</p>
          <h3>${siren.name}</h3>
        </div>
        <span class="siren-badge ${siren.currentStatus === 'on' ? 'danger' : 'safe'}">${siren.currentStatus === 'on' ? 'AT RISK' : 'SAFE'}</span>
      </div>
      <div class="siren-state">
        <div class="siren-icon">${siren.currentStatus === 'on' ? '🔔' : '🔕'}</div>
        <div>
          <p class="state-label">Current status</p>
          <h4>SIREN ${siren.currentStatus.toUpperCase()}</h4>
          <p>Zone status: ${siren.zoneStatus}</p>
        </div>
      </div>
    </section>
  `).join('');
}

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

function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function capitalize(value) {
  return String(value).replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

hydrateDashboard();
