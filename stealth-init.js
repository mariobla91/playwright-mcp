// Advanced stealth patches for bot detection bypass
// This script runs in the browser context before any page loads

(() => {
  // 1. Remove webdriver flag
  Object.defineProperty(navigator, 'webdriver', {
    get: () => false,
    configurable: true
  });

  // 2. Mock plugins (empty in headless)
  Object.defineProperty(navigator, 'plugins', {
    get: () => [
      {
        0: { type: "application/pdf", suffixes: "pdf", description: "Portable Document Format" },
        description: "Portable Document Format",
        filename: "internal-pdf-viewer",
        length: 1,
        name: "Chrome PDF Plugin"
      },
      {
        0: { type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format" },
        description: "Portable Document Format",
        filename: "internal-pdf-viewer",
        length: 1,
        name: "Chrome PDF Viewer"
      },
      {
        0: { type: "application/x-nacl", suffixes: "", description: "Native Client Executable" },
        1: { type: "application/x-pnacl", suffixes: "", description: "Portable Native Client Executable" },
        description: "Native Client",
        filename: "internal-nacl-plugin",
        length: 2,
        name: "Native Client"
      }
    ],
    configurable: true
  });

  // 3. Mock languages (single language is suspicious)
  Object.defineProperty(navigator, 'languages', {
    get: () => ['en-US', 'en'],
    configurable: true
  });

  // 4. Fix chrome object (missing in Chromium)
  if (!window.chrome) {
    window.chrome = {};
  }
  window.chrome.runtime = {
    connect: () => {},
    sendMessage: () => {},
    onMessage: {
      addListener: () => {},
      removeListener: () => {}
    }
  };

  // 5. Mock permissions API properly
  const originalQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (parameters) => (
    parameters.name === 'notifications' ?
      Promise.resolve({ state: 'prompt', onchange: null }) :
      originalQuery(parameters)
  );

  // 6. Add realistic battery API
  if (!navigator.getBattery) {
    navigator.getBattery = () => Promise.resolve({
      charging: true,
      chargingTime: 0,
      dischargingTime: Infinity,
      level: 0.95,
      addEventListener: () => {},
      removeEventListener: () => {},
      onchargingchange: null,
      onchargingtimechange: null,
      ondischargingtimechange: null,
      onlevelchange: null
    });
  }

  // 7. Mock hardware concurrency (4 cores is common)
  Object.defineProperty(navigator, 'hardwareConcurrency', {
    get: () => 4,
    configurable: true
  });

  // 8. Mock device memory
  Object.defineProperty(navigator, 'deviceMemory', {
    get: () => 8,
    configurable: true
  });

  // 9. Mock connection (realistic values)
  Object.defineProperty(navigator, 'connection', {
    get: () => ({
      effectiveType: '4g',
      downlink: 10,
      rtt: 50,
      saveData: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      onchange: null
    }),
    configurable: true
  });

  // 10. Fix missing chrome.loadTimes (removed in Chrome 64+)
  if (!window.chrome.loadTimes) {
    window.chrome.loadTimes = () => ({
      requestTime: performance.timeOrigin / 1000,
      startLoadTime: performance.timeOrigin / 1000,
      commitLoadTime: (performance.timeOrigin + performance.now()) / 1000,
      finishDocumentLoadTime: (performance.timeOrigin + performance.now()) / 1000,
      finishLoadTime: (performance.timeOrigin + performance.now()) / 1000,
      firstPaintTime: (performance.timeOrigin + performance.now()) / 1000,
      firstPaintAfterLoadTime: 0,
      navigationType: 'Other',
      wasFetchedViaSpdy: false,
      wasNpnNegotiated: true,
      npnNegotiatedProtocol: 'h2',
      wasAlternateProtocolAvailable: false,
      connectionInfo: 'h2'
    });
  }

  // 11. Fix missing chrome.csi (removed in Chrome 67+)
  if (!window.chrome.csi) {
    window.chrome.csi = () => ({
      onloadT: Date.now(),
      pageT: performance.now(),
      startE: Date.now(),
      tran: 15
    });
  }

  // 12. Mock WebGL vendor/renderer (prevent fingerprinting)
  const getParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(parameter) {
    if (parameter === 37445) { // UNMASKED_VENDOR_WEBGL
      return 'Intel Inc.';
    }
    if (parameter === 37446) { // UNMASKED_RENDERER_WEBGL
      return 'Intel Iris OpenGL Engine';
    }
    return getParameter.apply(this, arguments);
  };

  // 13. Mock iframe detection (Playwright injects iframes)
  Object.defineProperty(window, 'outerWidth', {
    get: () => window.innerWidth,
    configurable: true
  });
  Object.defineProperty(window, 'outerHeight', {
    get: () => window.innerHeight,
    configurable: true
  });

  // 14. Add realistic screen properties
  Object.defineProperty(window.screen, 'availWidth', {
    get: () => 1920,
    configurable: true
  });
  Object.defineProperty(window.screen, 'availHeight', {
    get: () => 1040, // Slightly less than full height (taskbar)
    configurable: true
  });
  Object.defineProperty(window.screen, 'colorDepth', {
    get: () => 24,
    configurable: true
  });
  Object.defineProperty(window.screen, 'pixelDepth', {
    get: () => 24,
    configurable: true
  });

  // 15. Mock media devices
  if (!navigator.mediaDevices) {
    navigator.mediaDevices = {};
  }
  navigator.mediaDevices.enumerateDevices = () => Promise.resolve([
    {
      deviceId: "default",
      kind: "audioinput",
      label: "Default - Microphone Array (Realtek High Definition Audio)",
      groupId: "default"
    },
    {
      deviceId: "communications",
      kind: "audioinput",
      label: "Communications - Microphone Array (Realtek High Definition Audio)",
      groupId: "communications"
    },
    {
      deviceId: "default",
      kind: "audiooutput",
      label: "Default - Speakers (Realtek High Definition Audio)",
      groupId: "default"
    }
  ]);

  // 16. Remove Playwright-specific properties
  delete window.__playwright;
  delete window.__pw_manual;
  delete window.__PW_inspect;

  // 17. Mock notification permission (check if Notification exists first)
  if (typeof Notification !== 'undefined') {
    Object.defineProperty(Notification, 'permission', {
      get: () => 'default',
      configurable: true
    });
  }

  console.log('[Stealth] All bot detection patches applied successfully');
})();
