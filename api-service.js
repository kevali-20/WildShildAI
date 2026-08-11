(function (global) {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const mockState = {
    detections: [
      {
        id: 'det-001',
        type: 'animal',
        species: 'Lion',
        classification: 'Lion',
        confidence: 0.96,
        location: 'Forest Boundary - Zone A',
        movementDirection: 'South-East',
        boundaryCrossing: true,
        riskLevel: 'critical',
        affectedVillage: 'Village 1',
        sirenStatus: 'on',
        timestamp: '2026-08-01T06:42:00',
        imageLabel: 'Detection image'
      },
      {
        id: 'det-002',
        type: 'animal',
        species: 'Elephant',
        classification: 'Elephant',
        confidence: 0.91,
        location: 'Riverline Trail',
        movementDirection: 'North',
        boundaryCrossing: false,
        riskLevel: 'high',
        affectedVillage: 'Village 2',
        sirenStatus: 'on',
        timestamp: '2026-08-01T05:18:00',
        imageLabel: 'Detection image'
      },
      {
        id: 'det-003',
        type: 'human',
        species: 'Human',
        classification: 'Human',
        confidence: 0.95,
        location: 'North Ridge Access Point',
        movementDirection: 'Northwest',
        boundaryCrossing: true,
        riskLevel: 'critical',
        affectedVillage: 'Village 1',
        sirenStatus: 'on',
        timestamp: '2026-08-01T06:42:00',
        imageLabel: 'Detection image'
      },
      {
        id: 'det-004',
        type: 'animal',
        species: 'Wild Boar',
        classification: 'Wild Boar',
        confidence: 0.72,
        location: 'South Loop',
        movementDirection: 'South',
        boundaryCrossing: false,
        riskLevel: 'low',
        affectedVillage: 'Village 4',
        sirenStatus: 'off',
        timestamp: '2026-07-31T19:14:00',
        imageLabel: 'Detection image'
      }
    ],
    activeAlerts: [
      {
        id: 'A-204',
        title: 'Lion movement near boundary',
        riskLevel: 'critical',
        status: 'active',
        detectedObject: 'Lion',
        speciesOrHuman: 'Animal • Lion',
        location: 'Forest Boundary - Zone A',
        zone: 'Zone A',
        village: 'Village 1',
        movementDirection: 'South-East',
        actionTaken: 'Village siren ON • Forest officer alerted',
        timestamp: '2026-08-01T06:42:00',
        recipients: ['Forest Officers', 'Police', 'Rescue/Security Team']
      },
      {
        id: 'A-203',
        title: 'Elephant intrusion detected',
        riskLevel: 'high',
        status: 'active',
        detectedObject: 'Elephant',
        speciesOrHuman: 'Animal • Elephant',
        location: 'Riverline Trail',
        zone: 'Zone B',
        village: 'Village 2',
        movementDirection: 'North',
        actionTaken: 'Siren active • Rescue team notified',
        timestamp: '2026-08-01T05:18:00',
        recipients: ['Forest Officers', 'Rescue/Security Team']
      },
      {
        id: 'A-202',
        title: 'Human activity near sensor line',
        riskLevel: 'medium',
        status: 'resolved',
        detectedObject: 'Human',
        speciesOrHuman: 'Human • Group of 2',
        location: 'East Ridge',
        zone: 'Zone C',
        village: 'Village 3',
        movementDirection: 'West',
        actionTaken: 'Forest team notified • Monitoring continued',
        timestamp: '2026-07-31T22:05:00',
        recipients: ['Forest Officers', 'Police']
      }
    ],
    villages: [
      { id: 'v1', name: 'Village 1', zone: 'Zone A', status: 'at-risk', sirenId: 's1', sirenStatus: 'on' },
      { id: 'v2', name: 'Village 2', zone: 'Zone B', status: 'safe', sirenId: 's2', sirenStatus: 'off' },
      { id: 'v3', name: 'Village 3', zone: 'Zone C', status: 'safe', sirenId: 's3', sirenStatus: 'off' }
    ],
    sirens: [
      { id: 's1', name: 'Siren 1', currentStatus: 'on', zoneStatus: 'At Risk', village: 'Village 1', connected: true, lastActivatedAt: '2026-08-01T06:42:00', activationReason: 'Lion moving toward Village 1' },
      { id: 's2', name: 'Siren 2', currentStatus: 'off', zoneStatus: 'Safe', village: 'Village 2', connected: true, lastActivatedAt: '2026-07-31T17:10:00', activationReason: 'No active threat' },
      { id: 's3', name: 'Siren 3', currentStatus: 'off', zoneStatus: 'Safe', village: 'Village 3', connected: true, lastActivatedAt: '2026-07-30T21:05:00', activationReason: 'No active threat' }
    ],
    mapData: {
      threat: {
        animal: 'Lion',
        confidence: '96.3%',
        currentLocation: 'Forest Boundary - Zone A',
        movingToward: 'Village 1',
        distance: '850 meters',
        riskLevel: 'CRITICAL',
        siren: 'Village 1 ON'
      },
      zones: [
        { name: 'Zone C', incidents: 24 },
        { name: 'Zone B', incidents: 19 },
        { name: 'Zone A', incidents: 16 },
        { name: 'Boundary Ridge', incidents: 11 }
      ]
    },
    analytics: {
      speciesCounts: [
        { label: 'Lion', value: 14 },
        { label: 'Leopard', value: 11 },
        { label: 'Elephant', value: 16 },
        { label: 'Wild Boar', value: 13 },
        { label: 'Deer', value: 15 }
      ],
      wildlifeIntrusions: [9, 11, 14, 13, 16, 18],
      humanIntrusions: [2, 3, 4, 3, 4, 5],
      riskLevels: [
        { label: 'Low', value: 8 },
        { label: 'Medium', value: 12 },
        { label: 'High', value: 14 },
        { label: 'Critical', value: 7 }
      ],
      movementDirections: [
        { label: 'South-East', value: 28 },
        { label: 'Northwest', value: 22 },
        { label: 'North', value: 18 },
        { label: 'South', value: 16 },
        { label: 'West', value: 16 }
      ],
      sirenActivations: [9, 11, 14, 13, 16, 18],
      falseAlarmStats: { falseAlarms: 6, confirmedIntrusions: 35 }
    }
  };

  const service = {
    baseUrl: '/api',
    useMock: true,
    async request(path, options = {}) {
      if (this.useMock) {
        await wait(80);
        return this.handleMock(path, options);
      }

      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: { Accept: 'application/json' },
        ...options
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      return response.json();
    },
    handleMock(path, options = {}) {
      const method = (options.method || 'GET').toUpperCase();

      if (path === '/detections') {
        return Promise.resolve(mockState.detections);
      }

      if (path === '/active-alerts') {
        return Promise.resolve(mockState.activeAlerts);
      }

      if (path === '/villages') {
        return Promise.resolve(mockState.villages);
      }

      if (path === '/sirens') {
        return Promise.resolve(mockState.sirens);
      }

      if (path === '/map-data') {
        return Promise.resolve(mockState.mapData);
      }

      if (path === '/analytics') {
        return Promise.resolve(mockState.analytics);
      }

      if (path.startsWith('/sirens/') && method === 'POST') {
        const sirenId = path.split('/')[2];
        const siren = mockState.sirens.find((entry) => entry.id === sirenId);
        if (!siren) {
          return Promise.reject(new Error('Siren not found'));
        }

        const action = path.includes('/activate') ? 'on' : 'off';
        siren.currentStatus = action;
        siren.zoneStatus = action === 'on' ? 'At Risk' : 'Safe';
        return Promise.resolve(siren);
      }

      return Promise.reject(new Error(`No mock handler for ${path}`));
    },
    async getDetections() {
      return this.request('/detections');
    },
    async getActiveAlerts() {
      return this.request('/active-alerts');
    },
    async getVillages() {
      return this.request('/villages');
    },
    async getSirens() {
      return this.request('/sirens');
    },
    async getMapData() {
      return this.request('/map-data');
    },
    async getAnalytics() {
      return this.request('/analytics');
    },
    async activateSiren(sirenId) {
      return this.request(`/sirens/${sirenId}/activate`, { method: 'POST' });
    },
    async deactivateSiren(sirenId) {
      return this.request(`/sirens/${sirenId}/deactivate`, { method: 'POST' });
    }
  };

  global.WildShieldApi = service;
})(window);
