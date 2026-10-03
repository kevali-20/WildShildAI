/**
 * WildShield AI — Shared Layout Injector
 * Injects unified sidebar navigation and topbar command chrome across all pages.
 * Handles active link state dynamically based on window.location.pathname.
 */
(function () {
  const currentPath = window.location.pathname.split('/').filter(Boolean).pop() || 'index.html';

  const pages = {
    'index.html': { title: 'WildShield AI command center', subtitle: 'Predict. Protect. Respond.' },
    'map-view.html': { title: 'Map View', subtitle: 'Live wildlife intrusion monitoring' },
    'alerts.html': { title: 'Alerts', subtitle: 'Real-time incident management' },
    'siren-control.html': { title: 'Siren Control', subtitle: 'Zone-specific intelligent alerting' },
    'analytics.html': { title: 'Analytics', subtitle: 'Operational insights and alert trends' },
    'notifications.html': { title: 'Notifications', subtitle: 'Recent WildShield alerts and events' },
    'profile.html': { title: 'Profile', subtitle: 'Manage your account settings' },
    'security.html': { title: 'Security', subtitle: 'Protect account access and devices' }
  };

  const navItems = [
    { href: 'index.html', icon: '◉', label: 'Dashboard' },
    { href: 'map-view.html', icon: '◌', label: 'Map View' },
    { href: 'alerts.html', icon: '⚑', label: 'Alerts' },
    { href: 'siren-control.html', icon: '⏺', label: 'Siren Control' },
    { href: 'analytics.html', icon: '◫', label: 'Analytics' },
    { href: 'notifications.html', icon: '🔔', label: 'Notifications' },
    { href: 'profile.html', icon: '👤', label: 'Profile' }
  ];

  function buildSidebar() {
    const navHtml = navItems
      .map((item) => {
        const isActive = item.href === currentPath || (currentPath === 'index.html' && item.href === 'index.html');
        return `
          <a href="${item.href}" class="nav-item ${isActive ? 'active' : ''}">
            <span class="nav-icon" aria-hidden="true">${item.icon}</span>
            <span class="nav-label">${item.label}</span>
          </a>
        `;
      })
      .join('');

    return `
      <aside class="sidebar glass-card" id="sidebar" aria-label="Main Navigation">
        <div class="sidebar-top">
          <button class="icon-btn sidebar-toggle" id="sidebarToggle" aria-label="Toggle navigation">
            <span></span>
          </button>
          <div class="brand compact-brand">
            <div class="brand-mark" aria-label="WildShield AI logo">
              <svg viewBox="0 0 64 64" role="img" aria-hidden="true">
                <path d="M18 14c-4 6-7 10-7 15 0 6 5 11 11 11 4 0 8-2 10-5-2 8-8 14-15 14-8 0-14-6-14-14 0-8 6-13 15-21z" fill="url(#g1)"/>
                <path d="M46 14c4 6 7 10 7 15 0 6-5 11-11 11-4 0-8-2-10-5 2 8 8 14 15 14 8 0 14-6 14-14 0-8 6-13 15-21z" fill="url(#g2)"/>
                <path d="M32 10c-5 0-9 4-9 9 0 4 2 7 6 9 2-2 4-4 6-6 2 2 4 4 6 6 4-2 6-5 6-9 0-5-4-9-9-9z" fill="#d8f5dc"/>
                <defs>
                  <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#46d07e" />
                    <stop offset="100%" stop-color="#1f7f4d" />
                  </linearGradient>
                  <linearGradient id="g2" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#3b8dff" />
                    <stop offset="100%" stop-color="#0f2f4d" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div class="brand-text">
              <h1>WildShield AI</h1>
              <p>Predict. Protect. Respond.</p>
            </div>
          </div>
        </div>

        <nav class="sidebar-nav" aria-label="Primary">
          ${navHtml}
        </nav>

        <div class="sidebar-footer">
          <div class="status-card" id="sidebarStatusCard">
            <p>System Health</p>
            <strong id="sidebarHealthSummary">Loading health…</strong>
            <span id="sidebarHealthDetails">Connecting…</span>
          </div>
        </div>
      </aside>
      <div class="sidebar-backdrop" id="sidebarBackdrop"></div>
    `;
  }

  function buildTopbar() {
    const meta = pages[currentPath] || {
      title: 'WildShield AI command center',
      subtitle: 'Predict. Protect. Respond.'
    };

    return `
      <header class="topbar glass-card">
        <div class="topbar-left">
          <button class="icon-btn mobile-toggle" id="mobileToggle" aria-label="Open navigation">
            <span></span>
          </button>
          <div class="topbar-title">
            <h2>${meta.title}</h2>
            <p>${meta.subtitle}</p>
          </div>
        </div>

      <div class="topbar-right">
          <span class="ws-pill offline" id="wsStatusPill" title="WebSocket connection status">⬤ OFFLINE</span>
          <div class="date-pill" id="currentDateTime">--</div>
          <div class="profile-menu">
            <button class="profile-trigger" id="profileTrigger" aria-expanded="false" aria-label="Operator user menu">
              <div class="avatar" aria-hidden="true">FO</div>
              <div class="profile-copy">
                <strong>Forest Officer</strong>
                <span>Lead operator</span>
              </div>
              <span class="chevron" aria-hidden="true">▾</span>
            </button>
            <div class="profile-dropdown" id="profileDropdown" role="menu">
              <a href="profile.html" role="menuitem">Profile</a>
              <a href="security.html" role="menuitem">Security</a>
              <a href="#" id="authActionLink" role="menuitem">Sign out</a>
            </div>
          </div>
        </div>
      </header>
    `;
  }

  function injectLayout() {
    if (document.getElementById('sidebar')) return;
    const shell = document.querySelector('.app-shell');
    if (!shell) return;
    const mainPanel = shell.querySelector('.main-panel');
    if (!mainPanel) return;

    // Inject sidebar and backdrop into app-shell before main-panel
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = buildSidebar();
    while (tempContainer.firstChild) {
      shell.insertBefore(tempContainer.firstChild, mainPanel);
    }

    // Inject topbar into main-panel before main
    const tempTopbar = document.createElement('div');
    tempTopbar.innerHTML = buildTopbar().trim();
    const topbarEl = tempTopbar.firstElementChild;
    mainPanel.insertBefore(topbarEl, mainPanel.firstElementChild);
  }

  if (document.querySelector('.app-shell')) {
    injectLayout();
  } else {
    document.addEventListener('DOMContentLoaded', injectLayout);
  }
})();
