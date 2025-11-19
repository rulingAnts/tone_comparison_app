// Browser Compatibility Checker and Mobile Blocker
// Ensures app only runs on supported desktop browsers

(function() {
  'use strict';

  // Detect if mobile device
  function isMobileDevice() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    
    // Check common mobile patterns
    const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i;
    if (mobileRegex.test(userAgent)) {
      return true;
    }
    
    // Check touch screen width (mobile typically < 768px)
    if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
      return true;
    }
    
    // Check touch capability
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      // Desktop can have touch too, so check screen size
      if (window.screen.width < 768) {
        return true;
      }
    }
    
    return false;
  }

  // Get browser info
  function getBrowserInfo() {
    const userAgent = navigator.userAgent;
    let browserName = 'Unknown';
    let browserVersion = 'Unknown';
    let isSupported = false;

    // Chrome
    if (userAgent.indexOf('Chrome') > -1 && userAgent.indexOf('Edg') === -1) {
      browserName = 'Chrome';
      const match = userAgent.match(/Chrome\/(\d+)/);
      browserVersion = match ? match[1] : 'Unknown';
      isSupported = parseInt(browserVersion) >= 90;
    }
    // Edge (Chromium-based)
    else if (userAgent.indexOf('Edg') > -1) {
      browserName = 'Edge';
      const match = userAgent.match(/Edg\/(\d+)/);
      browserVersion = match ? match[1] : 'Unknown';
      isSupported = parseInt(browserVersion) >= 90;
    }
    // Firefox
    else if (userAgent.indexOf('Firefox') > -1) {
      browserName = 'Firefox';
      const match = userAgent.match(/Firefox\/(\d+)/);
      browserVersion = match ? match[1] : 'Unknown';
      isSupported = parseInt(browserVersion) >= 88;
    }
    // Safari
    else if (userAgent.indexOf('Safari') > -1 && userAgent.indexOf('Chrome') === -1) {
      browserName = 'Safari';
      const match = userAgent.match(/Version\/(\d+)/);
      browserVersion = match ? match[1] : 'Unknown';
      isSupported = parseInt(browserVersion) >= 14;
    }

    return { browserName, browserVersion, isSupported };
  }

  // Check required APIs
  function checkRequiredAPIs() {
    const required = {
      'IndexedDB': typeof indexedDB !== 'undefined',
      'Service Worker': 'serviceWorker' in navigator,
      'File API': typeof File !== 'undefined' && typeof FileReader !== 'undefined',
      'Blob': typeof Blob !== 'undefined',
      'URL.createObjectURL': typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function',
      'Promises': typeof Promise !== 'undefined',
      'Fetch API': typeof fetch !== 'undefined',
      'LocalStorage': typeof localStorage !== 'undefined'
    };

    const missing = [];
    for (const [api, supported] of Object.entries(required)) {
      if (!supported) {
        missing.push(api);
      }
    }

    return { allSupported: missing.length === 0, missing };
  }

  // Show error page
  function showErrorPage(errorType, details) {
    document.body.innerHTML = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Desktop Tone Matching - Unsupported</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .error-container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 600px;
            width: 100%;
            padding: 40px;
            text-align: center;
          }
          .icon {
            font-size: 64px;
            margin-bottom: 20px;
          }
          h1 {
            color: #333;
            font-size: 28px;
            margin-bottom: 16px;
          }
          p {
            color: #666;
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 12px;
          }
          .details {
            background: #f5f5f5;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            text-align: left;
          }
          .details h3 {
            color: #333;
            font-size: 16px;
            margin-bottom: 12px;
          }
          .details ul {
            list-style: none;
            padding: 0;
          }
          .details li {
            color: #666;
            padding: 8px 0;
            border-bottom: 1px solid #e0e0e0;
          }
          .details li:last-child {
            border-bottom: none;
          }
          .supported-list {
            color: #555;
            margin-top: 20px;
          }
          .supported-list strong {
            color: #333;
          }
          a {
            color: #667eea;
            text-decoration: none;
          }
          a:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="error-container">
          <div class="icon">${errorType === 'mobile' ? '📱' : '🚫'}</div>
          <h1>${errorType === 'mobile' ? 'Desktop Only Application' : 'Browser Not Supported'}</h1>
          ${errorType === 'mobile' ? `
            <p>This application is designed for desktop use only and requires a larger screen and full browser capabilities.</p>
            <p>Please access this application from a desktop or laptop computer using one of the following browsers:</p>
          ` : `
            <p>Your browser does not support all the features required to run this application.</p>
          `}
          <div class="details">
            <h3>Supported Desktop Browsers:</h3>
            <ul>
              <li>✅ Google Chrome 90+ (Windows/Mac)</li>
              <li>✅ Microsoft Edge 90+ (Windows/Mac)</li>
              <li>✅ Mozilla Firefox 88+ (Windows/Mac)</li>
              <li>✅ Safari 14+ (Mac)</li>
            </ul>
          </div>
          ${details.browserInfo ? `
            <p class="supported-list">
              <strong>Your Browser:</strong> ${details.browserInfo.browserName} ${details.browserInfo.browserVersion}
              ${details.browserInfo.isSupported ? ' ✅' : ' ❌'}
            </p>
          ` : ''}
          ${details.missing && details.missing.length > 0 ? `
            <div class="details">
              <h3>Missing Features:</h3>
              <ul>
                ${details.missing.map(api => `<li>❌ ${api}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
          <p style="margin-top: 24px; font-size: 14px; color: #999;">
            Need help? <a href="https://github.com/rulingAnts/tone_comparison_app/issues">Contact Support</a>
          </p>
        </div>
      </body>
      </html>
    `;
  }

  // Run checks on page load
  function runCompatibilityChecks() {
    // Check if mobile
    if (isMobileDevice()) {
      const browserInfo = getBrowserInfo();
      showErrorPage('mobile', { browserInfo });
      return false;
    }

    // Check browser
    const browserInfo = getBrowserInfo();
    if (!browserInfo.isSupported) {
      showErrorPage('browser', { browserInfo });
      return false;
    }

    // Check APIs
    const apiCheck = checkRequiredAPIs();
    if (!apiCheck.allSupported) {
      showErrorPage('browser', {
        browserInfo,
        missing: apiCheck.missing
      });
      return false;
    }

    console.log('[Compatibility] ✅ All checks passed');
    console.log('[Compatibility] Browser:', browserInfo.browserName, browserInfo.browserVersion);
    return true;
  }

  // Store compatibility info globally
  window.compatibilityInfo = {
    isMobile: isMobileDevice(),
    browser: getBrowserInfo(),
    apis: checkRequiredAPIs()
  };

  // Run checks immediately
  if (!runCompatibilityChecks()) {
    // Stop script execution if not compatible
    throw new Error('Compatibility check failed');
  }

})();
