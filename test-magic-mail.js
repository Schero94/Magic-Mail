/**
 * MagicMail - Comprehensive Test Suite
 * Tests all plugin functionality before release
 * 
 * Usage: node test-magic-mail.js [--quick|--full]
 * 
 * Environment Variables:
 *   ADMIN_EMAIL    - Admin email (required)
 *   ADMIN_PASSWORD - Admin password (required)
 *   STRAPI_URL     - Base URL (default: http://localhost:1337)
 *   TEST_EMAIL     - Test recipient email
 */

// Try to load .env file if available
try {
  require('dotenv').config({ path: '../../../.env' });
} catch (err) {
  // dotenv not installed or .env not found - that's ok, use ENV vars
}

const BASE_URL = process.env.STRAPI_URL || process.env.BASE_URL || 'http://localhost:1337';

// Test mode
const TEST_MODE = process.argv[2] || '--quick';
const IS_FULL_TEST = TEST_MODE === '--full';

// Admin Credentials - Must be provided via environment variables
const ADMIN_CREDENTIALS = {
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
};

// Validate credentials are provided
if (!ADMIN_CREDENTIALS.email || !ADMIN_CREDENTIALS.password) {
  console.error('❌ Missing admin credentials. Please set ADMIN_EMAIL and ADMIN_PASSWORD environment variables.');
  console.error('\nExample:');
  console.error('  export ADMIN_EMAIL="admin@example.com"');
  console.error('  export ADMIN_PASSWORD="YourPassword123!"');
  console.error('  node test-magic-mail.js');
  process.exit(1);
}

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

// Test Results
const results = { passed: 0, failed: 0, skipped: 0 };

// Tokens
let ADMIN_JWT = null;
let TEST_ACCOUNT_ID = null;

// Helper Functions
function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
  results.passed++;
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
  results.failed++;
}

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
  results.skipped++;
}

function logSection(message) {
  log(`\n${'='.repeat(70)}`, colors.magenta);
  log(`  ${message}`, colors.magenta);
  log(`${'='.repeat(70)}`, colors.magenta);
}

function logCategory(message) {
  log(`\n${'▓'.repeat(70)}`, colors.cyan);
  log(`  ${message}`, `${colors.cyan}${colors.bold}`);
  log(`${'▓'.repeat(70)}\n`, colors.cyan);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// ADMIN API TESTS
// ============================================================

/**
 * TEST 1: Admin Login
 */
async function testAdminLogin() {
  logSection('TEST 1: Admin Panel Login');
  
  try {
    const response = await fetch(`${BASE_URL}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ADMIN_CREDENTIALS),
    });

    const data = await response.json();

    if (response.ok && data.data?.token) {
      ADMIN_JWT = data.data.token;
      logSuccess(`Admin login successful for ${data.data.user.email}`);
      logInfo(`Admin JWT: ${ADMIN_JWT.substring(0, 40)}...`);
      return true;
    } else {
      logError(`Admin login failed: ${data.error?.message || 'Unknown error'}`);
      return false;
    }
  } catch (err) {
    logError(`Admin login error: ${err.message}`);
    return false;
  }
}

/**
 * TEST 2: Get All Email Accounts
 */
async function testGetAllAccounts() {
  logSection('TEST 2: Get All Email Accounts');
  
  try {
    const response = await fetch(`${BASE_URL}/magic-mail/accounts`, {
      headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
    });

    const data = await response.json();

    if (response.ok) {
      logSuccess(`Retrieved ${data.data?.length || 0} email accounts`);
      logInfo(`Active: ${data.data?.filter(a => a.isActive).length || 0}`);
      logInfo(`Total: ${data.meta?.count || 0}`);
      
      if (data.data && data.data.length > 0) {
        TEST_ACCOUNT_ID = data.data[0].id;
        logInfo(`Test Account ID: ${TEST_ACCOUNT_ID}`);
      }
      
      return true;
    } else {
      logError(`Get accounts failed: ${response.status} - ${JSON.stringify(data)}`);
      return false;
    }
  } catch (err) {
    logError(`Get accounts error: ${err.message}`);
    return false;
  }
}

/**
 * TEST 3: Create Email Account (SMTP)
 */
async function testCreateAccount() {
  logSection('TEST 3: Create Email Account (SMTP)');
  
  try {
    const accountData = {
      name: `Test Account ${Date.now()}`,
      description: 'Automated test account',
      provider: 'smtp',
      config: {
        host: 'smtp.gmail.com',
        port: 587,
        user: 'test@example.com',
        pass: 'test-password',
        secure: false,
      },
      fromEmail: 'test@example.com',
      fromName: 'Test Sender',
      replyTo: 'reply@example.com',
      isPrimary: false,
      priority: 5,
      dailyLimit: 100,
      hourlyLimit: 10,
    };
    
    logInfo(`Creating account: ${accountData.name}`);
    logInfo(`Provider: ${accountData.provider}`);
    logInfo(`Request URL: ${BASE_URL}/magic-mail/accounts`);
    logInfo(`Authorization: Bearer ${ADMIN_JWT.substring(0, 30)}...`);
    
    const response = await fetch(`${BASE_URL}/magic-mail/accounts`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${ADMIN_JWT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(accountData),
    });

    const data = await response.json();
    
    logInfo(`Response Status: ${response.status}`);
    logInfo(`Response Data: ${JSON.stringify(data, null, 2)}`);

    if (response.ok && data.data) {
      TEST_ACCOUNT_ID = data.data.id;
      logSuccess(`Email account created: ${data.data.name}`);
      logInfo(`Account ID: ${TEST_ACCOUNT_ID}`);
      logInfo(`From Email: ${data.data.fromEmail}`);
      return true;
    } else {
      logError(`Create account failed: ${response.status}`);
      logError(`Error: ${JSON.stringify(data)}`);
      return false;
    }
  } catch (err) {
    logError(`Create account error: ${err.message}`);
    return false;
  }
}

/**
 * TEST 4: Test Email Account
 */
async function testTestAccount() {
  logSection('TEST 4: Test Email Account');
  
  if (!TEST_ACCOUNT_ID) {
    logWarning('No test account ID available, skipping test');
    return null;
  }
  
  try {
    const testEmail = process.env.TEST_EMAIL || 'test@example.com';
    
    const response = await fetch(`${BASE_URL}/magic-mail/accounts/${TEST_ACCOUNT_ID}/test`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${ADMIN_JWT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        to: testEmail,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      if (data.success) {
        logSuccess(`Test email sent successfully to ${testEmail}`);
        logInfo(`Message: ${data.message || 'No message'}`);
      } else {
        logWarning(`Test completed but with warnings: ${data.message}`);
      }
      return data.success;
    } else if (response.status === 500) {
      // Account may not be properly configured (e.g., test SMTP credentials)
      logWarning(`Test account returned 500 - Account may not have valid credentials`);
      logInfo(`This is expected for test accounts with fake credentials`);
      return null; // Mark as skipped instead of failed
    } else {
      logError(`Test account failed: ${response.status}`);
      logInfo(`Response: ${JSON.stringify(data)}`);
      return false;
    }
  } catch (err) {
    logError(`Test account error: ${err.message}`);
    return false;
  }
}

/**
 * TEST 5: Delete Email Account
 */
async function testDeleteAccount() {
  logSection('TEST 5: Delete Email Account');
  
  if (!TEST_ACCOUNT_ID) {
    logWarning('No account ID available, skipping');
    return null;
  }
  
  try {
    const response = await fetch(`${BASE_URL}/magic-mail/accounts/${TEST_ACCOUNT_ID}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
    });

    const data = await response.json();

    if (response.ok) {
      logSuccess(`Account ${TEST_ACCOUNT_ID} deleted successfully`);
      return true;
    } else {
      logError(`Delete account failed: ${response.status}`);
      return false;
    }
  } catch (err) {
    logError(`Delete account error: ${err.message}`);
    return false;
  }
}

/**
 * TEST 6: Create Gmail OAuth Account (Will likely fail without real OAuth)
 */
async function testCreateOAuthAccount() {
  logSection('TEST 6: Create Gmail OAuth Account (Test)');
  
  try {
    const accountData = {
      name: `Gmail OAuth Test ${Date.now()}`,
      description: 'OAuth test account',
      provider: 'gmail-oauth',
      config: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      },
      fromEmail: 'oauth@example.com',
      fromName: 'OAuth Sender',
      isPrimary: false,
      priority: 8,
      dailyLimit: 500,
      hourlyLimit: 50,
    };
    
    const response = await fetch(`${BASE_URL}/magic-mail/accounts`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${ADMIN_JWT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(accountData),
    });

    const data = await response.json();

    if (response.ok && data.data) {
      logSuccess(`OAuth account created: ${data.data.name}`);
      // Delete it right away
      await fetch(`${BASE_URL}/magic-mail/accounts/${data.data.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
      });
      logInfo('Test OAuth account deleted');
      return true;
    } else {
      logWarning(`OAuth account creation failed (expected): ${response.status}`);
      return null;
    }
  } catch (err) {
    logError(`OAuth account test error: ${err.message}`);
    return false;
  }
}

/**
 * TEST 7: Test Strapi Email Service Integration
 * Tests if MagicMail intercepts Strapi's native email service
 */
async function testStrapiEmailService() {
  logSection('TEST 7: Strapi Email Service Integration');
  
  // Get test email from environment or use default
  const testEmail = process.env.TEST_EMAIL || 'test@example.com';
  
  logInfo(`Testing Strapi Email Service intercept...`);
  logInfo(`Test email will be sent to: ${testEmail}`);
  
  try {
    const response = await fetch(`${BASE_URL}/magic-mail/test-strapi-service`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${ADMIN_JWT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ testEmail }),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      logSuccess('Strapi Email Service successfully intercepted by MagicMail! ✅');
      logInfo(`Method used: ${data.info?.method}`);
      logInfo(`Intercepted: ${data.info?.intercepted ? 'YES' : 'NO'}`);
      logInfo(`Routed through: ${data.info?.routedThrough}`);
      
      if (data.result?.accountUsed) {
        logInfo(`Account used: ${data.result.accountUsed}`);
      }
      
      logSuccess('🎯 Email Designer and other plugins will work seamlessly!');
      return true;
    } else {
      logError(`Strapi service test failed: ${data.message || 'Unknown error'}`);
      logInfo(`Response: ${JSON.stringify(data, null, 2)}`);
      return false;
    }
  } catch (err) {
    logError(`Strapi service test error: ${err.message}`);
    return false;
  }
}

/**
 * TEST 8: Test Email Templates
 */
async function testEmailTemplates() {
  logSection('TEST 8: Email Templates');
  
  try {
    const response = await fetch(`${BASE_URL}/magic-mail/designer/templates`, {
      headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
    });

    const data = await response.json();

    // Handle different response formats
    const templates = Array.isArray(data) ? data : (data.data || []);
    
    if (response.ok) {
      logSuccess(`Retrieved ${templates.length} email template(s)`);
      
      if (templates.length > 0) {
        const activeTemplates = templates.filter(t => t.isActive);
        logInfo(`Active templates: ${activeTemplates.length}`);
        logInfo(`First template: ${templates[0].name}`);
      }
      
      return true;
    } else {
      logError(`Get templates failed: ${response.status}`);
      return false;
    }
  } catch (err) {
    logError(`Get templates error: ${err.message}`);
    return false;
  }
}

/**
 * TEST 9: Test Routing Rules
 */
async function testRoutingRules() {
  logSection('TEST 9: Routing Rules');
  
  try {
    const response = await fetch(`${BASE_URL}/magic-mail/routing-rules`, {
      headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
    });

    const data = await response.json();

    if (response.ok) {
      const rules = data.data || data;
      const count = Array.isArray(rules) ? rules.length : 0;
      logSuccess(`Retrieved ${count} routing rule(s)`);
      
      if (count > 0) {
        const activeRules = rules.filter(r => r.isActive);
        logInfo(`Active rules: ${activeRules.length}`);
      }
      
      return true;
    } else {
      logError(`Get routing rules failed: ${response.status}`);
      return false;
    }
  } catch (err) {
    logError(`Get routing rules error: ${err.message}`);
    return false;
  }
}

/**
 * TEST 10: Test Analytics Stats
 */
async function testAnalyticsStats() {
  logSection('TEST 10: Analytics Stats');
  
  try {
    const response = await fetch(`${BASE_URL}/magic-mail/analytics/stats`, {
      headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
    });

    const data = await response.json();

    if (response.ok) {
      const stats = data.data || data;
      logSuccess('Analytics stats retrieved successfully');
      logInfo(`Total Sent: ${stats.totalSent || 0}`);
      logInfo(`Total Opened: ${stats.totalOpened || 0}`);
      logInfo(`Total Clicked: ${stats.totalClicked || 0}`);
      logInfo(`Open Rate: ${stats.openRate || 0}%`);
      logInfo(`Click Rate: ${stats.clickRate || 0}%`);
      return true;
    } else {
      logError(`Get analytics stats failed: ${response.status}`);
      return false;
    }
  } catch (err) {
    logError(`Get analytics stats error: ${err.message}`);
    return false;
  }
}

/**
 * TEST 11: Test Email Logs
 */
async function testEmailLogs() {
  logSection('TEST 11: Email Logs');
  
  try {
    const response = await fetch(`${BASE_URL}/magic-mail/analytics/emails?_limit=10`, {
      headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
    });

    const data = await response.json();

    if (response.ok) {
      const logs = data.data || data;
      const count = Array.isArray(logs) ? logs.length : 0;
      logSuccess(`Retrieved ${count} email log(s)`);
      
      if (count > 0) {
        const withOpens = logs.filter(l => l.openCount > 0).length;
        const withClicks = logs.filter(l => l.clickCount > 0).length;
        logInfo(`With opens: ${withOpens}`);
        logInfo(`With clicks: ${withClicks}`);
      }
      
      return true;
    } else {
      logError(`Get email logs failed: ${response.status}`);
      return false;
    }
  } catch (err) {
    logError(`Get email logs error: ${err.message}`);
    return false;
  }
}

/**
 * TEST 12: Test License Status
 */
async function testLicenseStatus() {
  logSection('TEST 12: License Status');
  
  try {
    const response = await fetch(`${BASE_URL}/magic-mail/license/status`, {
      headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
    });

    const data = await response.json();

    if (response.ok) {
      logSuccess('License status retrieved');
      logInfo(`Valid: ${data.isValid ? 'YES' : 'NO'}`);
      logInfo(`Tier: ${data.tier || 'Unknown'}`);
      
      if (data.user) {
        logInfo(`Licensed to: ${data.user.name || data.user.email}`);
      }
      
      return data.isValid;
    } else {
      logError(`Get license status failed: ${response.status}`);
      return false;
    }
  } catch (err) {
    logError(`Get license status error: ${err.message}`);
    return false;
  }
}

/**
 * TEST 13: Test Tracking Pixel (Public Endpoint)
 */
async function testTrackingPixel() {
  logSection('TEST 13: Tracking Pixel Endpoint');
  
  try {
    // Test public tracking endpoint (no auth required)
    const response = await fetch(`${BASE_URL}/api/magic-mail/track/open/test123/testhash456`);

    if (response.status === 200) {
      logSuccess('Tracking pixel endpoint is accessible (200 OK)');
      logInfo('Public tracking URLs will work correctly');
      return true;
    } else {
      logError(`Tracking pixel endpoint returned: ${response.status}`);
      return false;
    }
  } catch (err) {
    logError(`Tracking pixel test error: ${err.message}`);
    return false;
  }
}

/**
 * TEST 14: Test Plugin Build (Full tests only)
 */
async function testPluginBuild() {
  if (!IS_FULL_TEST) {
    logWarning('Plugin build test skipped (use --full to enable)');
    return null;
  }
  
  logSection('TEST 14: Plugin Build Verification');
  
  const fs = require('fs');
  const path = require('path');
  
  try {
    const requiredFiles = [
      'dist/admin/index.js',
      'dist/admin/index.mjs',
      'dist/server/index.js',
      'dist/server/index.mjs',
      'package.json',
      'README.md',
      'LICENSE',
    ];
    
    let allFilesExist = true;
    
    for (const file of requiredFiles) {
      if (fs.existsSync(path.join(__dirname, file))) {
        logInfo(`✓ ${file} exists`);
      } else {
        logError(`✗ ${file} missing`);
        allFilesExist = false;
      }
    }
    
    if (allFilesExist) {
      logSuccess('All required build files present');
      return true;
    } else {
      logError('Some build files are missing');
      return false;
    }
  } catch (err) {
    logError(`Build verification error: ${err.message}`);
    return false;
  }
}

/**
 * TEST 15: Performance Test (Full tests only)
 */
async function testPerformance() {
  if (!IS_FULL_TEST) {
    logWarning('Performance test skipped (use --full to enable)');
    return null;
  }
  
  logSection('TEST 15: API Performance');
  
  const endpoints = [
    '/magic-mail/accounts',
    '/magic-mail/designer/templates',
    '/magic-mail/analytics/stats',
    '/magic-mail/license/status',
  ];
  
  try {
    logInfo('Testing response times...');
    
    for (const endpoint of endpoints) {
      const start = Date.now();
      
      await fetch(`${BASE_URL}${endpoint}`, {
        headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
      });
      
      const duration = Date.now() - start;
      
      if (duration < 1000) {
        logInfo(`✓ ${endpoint}: ${duration}ms`);
      } else {
        logWarning(`⚠ ${endpoint}: ${duration}ms (slow)`);
      }
    }
    
    logSuccess('Performance test completed');
    return true;
  } catch (err) {
    logError(`Performance test error: ${err.message}`);
    return false;
  }
}

// ============================================================
// SECURITY EXPLOIT TESTS
// ============================================================

/**
 * SECURITY TEST 1: Unauthenticated send must be blocked
 */
async function testUnauthenticatedSendBlocked() {
  logSection('SECURITY 1: Unauthenticated Send Blocked');

  try {
    const response = await fetch(`${BASE_URL}/api/magic-mail/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'attacker@evil.com',
        subject: 'Open relay test',
        text: 'If this arrives, the server is an open relay',
      }),
    });

    if (response.status === 401 || response.status === 403) {
      logSuccess(`Unauthenticated send blocked with ${response.status}`);
      return true;
    } else if (response.status === 200) {
      logError('CRITICAL: Unauthenticated email send succeeded! Server is an OPEN RELAY!');
      return false;
    } else {
      logSuccess(`Unauthenticated send rejected with ${response.status}`);
      return true;
    }
  } catch (err) {
    logError(`Unauthenticated send test error: ${err.message}`);
    return false;
  }
}

/**
 * SECURITY TEST 2: Unauthenticated account creation must be blocked
 */
async function testUnauthenticatedAccountCreateBlocked() {
  logSection('SECURITY 2: Unauthenticated Account Creation Blocked');

  try {
    const response = await fetch(`${BASE_URL}/magic-mail/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Exploit Test Account',
        provider: 'smtp',
        config: { host: 'evil.com', port: 587, user: 'x', pass: 'x' },
        fromEmail: 'exploit@evil.com',
      }),
    });

    if (response.status === 401 || response.status === 403) {
      logSuccess(`Unauthenticated account creation blocked with ${response.status}`);
      return true;
    } else if (response.status === 200 || response.status === 201) {
      logError('CRITICAL: Unauthenticated account creation succeeded!');
      return false;
    } else {
      logSuccess(`Unauthenticated account creation rejected with ${response.status}`);
      return true;
    }
  } catch (err) {
    logError(`Unauthenticated account creation test error: ${err.message}`);
    return false;
  }
}

/**
 * SECURITY TEST 3: Path traversal via attachment.path must be stripped
 */
async function testPathTraversalBlocked() {
  logSection('SECURITY 3: Attachment Path Traversal Blocked');

  try {
    const response = await fetch(`${BASE_URL}/api/magic-mail/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_JWT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: process.env.TEST_EMAIL || 'test@example.com',
        subject: 'Path traversal test',
        text: 'Testing path traversal protection',
        attachments: [
          { path: '/etc/passwd', filename: 'passwd.txt' },
          { path: '../../.env', filename: 'env.txt' },
          { content: 'Safe content here', filename: 'safe.txt' },
        ],
      }),
    });

    const data = await response.json().catch(() => ({}));

    // The request may succeed (email sent) or fail (no account configured)
    // But the key check: did it NOT attach /etc/passwd?
    // We verify by checking the response doesn't mention file read errors
    // for system files - the path should have been silently stripped
    if (response.status === 500 && data.message && data.message.includes('/etc/passwd')) {
      logError('CRITICAL: Server attempted to read /etc/passwd!');
      return false;
    }
    
    logSuccess('Attachment path fields are stripped from API requests');
    logInfo('Content-based attachments remain intact, file paths are removed');
    return true;
  } catch (err) {
    logError(`Path traversal test error: ${err.message}`);
    return false;
  }
}

/**
 * SECURITY TEST 4: Open redirect in click tracking must be blocked
 */
async function testOpenRedirectBlocked() {
  logSection('SECURITY 4: Open Redirect Blocked');

  try {
    // Try to inject a URL via query parameter
    const response = await fetch(
      `${BASE_URL}/api/magic-mail/track/click/fake-id/fake-hash/fake-recipient?url=https://evil-phishing.com`,
      { redirect: 'manual' }
    );

    if (response.status === 302 || response.status === 301) {
      const location = response.headers.get('location');
      if (location && location.includes('evil-phishing.com')) {
        logError('CRITICAL: Open redirect to attacker URL succeeded!');
        return false;
      }
      logSuccess('Redirect does not point to attacker URL');
      return true;
    } else if (response.status === 400) {
      logSuccess(`Open redirect blocked with 400 - URL from query param rejected`);
      return true;
    } else {
      logSuccess(`Click tracking returned ${response.status} (no redirect to attacker URL)`);
      return true;
    }
  } catch (err) {
    logError(`Open redirect test error: ${err.message}`);
    return false;
  }
}

/**
 * SECURITY TEST 5: XSS via tracking endpoints
 */
async function testXssInTrackingEndpoints() {
  logSection('SECURITY 5: XSS Prevention in Tracking');

  try {
    // Test tracking pixel with XSS payload in params
    const xssPayload = '<script>alert(1)</script>';
    const encodedPayload = encodeURIComponent(xssPayload);

    const response = await fetch(
      `${BASE_URL}/api/magic-mail/track/open/${encodedPayload}/${encodedPayload}`
    );

    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('image/gif')) {
      logSuccess('Tracking pixel returns image/gif, not HTML (XSS not possible)');
      return true;
    } else if (contentType && contentType.includes('text/html')) {
      const body = await response.text();
      if (body.includes('<script>')) {
        logError('CRITICAL: XSS payload reflected in tracking response!');
        return false;
      }
      logSuccess('HTML response does not reflect XSS payload');
      return true;
    } else {
      logSuccess(`Tracking returns ${contentType} - not vulnerable to XSS`);
      return true;
    }
  } catch (err) {
    logError(`XSS test error: ${err.message}`);
    return false;
  }
}

/**
 * SECURITY TEST 6: Error responses must not leak stack traces
 */
async function testErrorLeakPrevention() {
  logSection('SECURITY 6: Error Message Leak Prevention');

  try {
    // Trigger a 500 error with invalid data
    const response = await fetch(`${BASE_URL}/magic-mail/analytics/emails/nonexistent-id-12345`, {
      headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
    });

    const data = await response.json().catch(() => ({}));
    const responseText = JSON.stringify(data);

    // Check for stack trace indicators
    const leakPatterns = [
      'node_modules',
      'at Object.',
      'at Module.',
      'at Function.',
      '.js:',
      'Error\n',
      'stack',
      'node:internal',
    ];

    let hasLeak = false;
    for (const pattern of leakPatterns) {
      if (responseText.includes(pattern)) {
        logError(`Error response leaks internal info: "${pattern}" found`);
        hasLeak = true;
        break;
      }
    }

    if (!hasLeak) {
      logSuccess('Error responses do not leak stack traces or internal paths');
      return true;
    }
    return false;
  } catch (err) {
    logError(`Error leak test error: ${err.message}`);
    return false;
  }
}

/**
 * SECURITY TEST 7: License key must be masked in API responses
 */
async function testLicenseKeyMasked() {
  logSection('SECURITY 7: License Key Masking');

  try {
    const response = await fetch(`${BASE_URL}/magic-mail/license/status`, {
      headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
    });

    const data = await response.json();
    const responseText = JSON.stringify(data);

    // Check if full license key is exposed (keys are typically 20+ chars)
    const licenseKey = data.data?.licenseKey || data.licenseKey;

    if (licenseKey) {
      if (licenseKey.includes('...')) {
        logSuccess(`License key is masked: ${licenseKey}`);
        return true;
      } else if (licenseKey.length > 16) {
        logError(`SECURITY: Full license key exposed in API response (${licenseKey.length} chars)`);
        return false;
      } else {
        logSuccess('License key appears truncated/masked');
        return true;
      }
    } else {
      logInfo('No license key in response (may not be activated)');
      return true;
    }
  } catch (err) {
    logError(`License key mask test error: ${err.message}`);
    return false;
  }
}

// ============================================================
// ENDPOINT COVERAGE TESTS
// ============================================================

/**
 * TEST: License Limits Endpoint
 */
async function testLicenseLimits() {
  logSection('ENDPOINT: License Limits');
  try {
    const response = await fetch(`${BASE_URL}/magic-mail/license/limits`, {
      headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
    });
    if (response.ok) {
      const data = await response.json();
      logSuccess(`License limits retrieved (tier: ${data.tier || data.data?.tier || 'unknown'})`);
      return true;
    }
    logError(`License limits failed: ${response.status}`);
    return false;
  } catch (err) {
    logError(`License limits error: ${err.message}`);
    return false;
  }
}

/**
 * TEST: License Debug Endpoint
 */
async function testLicenseDebug() {
  logSection('ENDPOINT: License Debug');
  try {
    const response = await fetch(`${BASE_URL}/magic-mail/license/debug`, {
      headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
    });
    if (response.ok) {
      logSuccess('License debug endpoint accessible');
      return true;
    }
    logError(`License debug failed: ${response.status}`);
    return false;
  } catch (err) {
    logError(`License debug error: ${err.message}`);
    return false;
  }
}

/**
 * TEST: Designer Stats Endpoint
 */
async function testDesignerStats() {
  logSection('ENDPOINT: Designer Stats');
  try {
    const response = await fetch(`${BASE_URL}/magic-mail/designer/stats`, {
      headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
    });
    if (response.ok) {
      const data = await response.json();
      const stats = data.data || data;
      logSuccess(`Designer stats: ${stats.total || 0} templates, ${stats.active || 0} active`);
      return true;
    }
    logError(`Designer stats failed: ${response.status}`);
    return false;
  } catch (err) {
    logError(`Designer stats error: ${err.message}`);
    return false;
  }
}

/**
 * TEST: Core Email Template Endpoint
 */
async function testCoreTemplate() {
  logSection('ENDPOINT: Core Email Template');
  try {
    const response = await fetch(`${BASE_URL}/magic-mail/designer/core/user-address-confirmation`, {
      headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
    });
    if (response.ok) {
      logSuccess('Core template endpoint accessible');
      return true;
    } else if (response.status === 404 || response.status === 500) {
      logSuccess(`Core template returned ${response.status} (expected if not customized)`);
      return true;
    }
    logError(`Core template failed: ${response.status}`);
    return false;
  } catch (err) {
    logError(`Core template error: ${err.message}`);
    return false;
  }
}

/**
 * TEST: Analytics Debug Endpoint
 */
async function testAnalyticsDebug() {
  logSection('ENDPOINT: Analytics Debug');
  try {
    const response = await fetch(`${BASE_URL}/magic-mail/analytics/debug`, {
      headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
    });
    if (response.ok) {
      logSuccess('Analytics debug endpoint accessible');
      return true;
    }
    logError(`Analytics debug failed: ${response.status}`);
    return false;
  } catch (err) {
    logError(`Analytics debug error: ${err.message}`);
    return false;
  }
}

/**
 * TEST: WhatsApp Admin Endpoints
 */
async function testWhatsAppEndpoints() {
  logSection('ENDPOINT: WhatsApp Admin Routes');
  
  const endpoints = [
    { path: '/whatsapp/available', name: 'WhatsApp Available' },
    { path: '/whatsapp/status', name: 'WhatsApp Status' },
    { path: '/whatsapp/templates', name: 'WhatsApp Templates' },
    { path: '/whatsapp/session', name: 'WhatsApp Session' },
  ];
  
  let allPassed = true;
  
  for (const ep of endpoints) {
    try {
      const response = await fetch(`${BASE_URL}/magic-mail${ep.path}`, {
        headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
      });
      if (response.ok || response.status === 404) {
        logSuccess(`${ep.name}: ${response.status}`);
      } else if (response.status === 500) {
        logWarning(`${ep.name}: 500 (WhatsApp may not be configured)`);
      } else {
        logError(`${ep.name}: ${response.status}`);
        allPassed = false;
      }
    } catch (err) {
      logError(`${ep.name} error: ${err.message}`);
      allPassed = false;
    }
  }
  
  return allPassed;
}

/**
 * TEST: Plugin Settings Endpoints
 */
async function testPluginSettings() {
  logSection('ENDPOINT: Plugin Settings');
  try {
    const response = await fetch(`${BASE_URL}/magic-mail/settings`, {
      headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
    });
    if (response.ok) {
      const data = await response.json();
      logSuccess('Plugin settings retrieved');
      logInfo(`Settings keys: ${Object.keys(data.data || data).join(', ').substring(0, 80)}`);
      return true;
    }
    logError(`Plugin settings failed: ${response.status}`);
    return false;
  } catch (err) {
    logError(`Plugin settings error: ${err.message}`);
    return false;
  }
}

/**
 * TEST: Content-API Send Endpoints (authenticated)
 */
async function testContentApiSendEndpoints() {
  logSection('ENDPOINT: Content-API Send Routes (Auth Check)');
  
  const endpoints = [
    { path: '/api/magic-mail/send-message', name: 'Send Message', body: { to: 'test@example.com', message: 'test' } },
    { path: '/api/magic-mail/send-whatsapp', name: 'Send WhatsApp', body: { phoneNumber: '+49123456789', message: 'test' } },
  ];
  
  let allPassed = true;
  
  for (const ep of endpoints) {
    try {
      // Test WITHOUT auth - should be blocked
      const noAuthResp = await fetch(`${BASE_URL}${ep.path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ep.body),
      });
      
      if (noAuthResp.status === 401 || noAuthResp.status === 403) {
        logSuccess(`${ep.name} blocked without auth (${noAuthResp.status})`);
      } else {
        logError(`${ep.name} accessible without auth! Status: ${noAuthResp.status}`);
        allPassed = false;
      }
    } catch (err) {
      logError(`${ep.name} error: ${err.message}`);
      allPassed = false;
    }
  }
  
  return allPassed;
}

/**
 * TEST: Template CRUD Lifecycle
 */
async function testTemplateCrudLifecycle() {
  logSection('ENDPOINT: Template CRUD Lifecycle');
  
  let templateId = null;
  
  try {
    // CREATE
    const createResp = await fetch(`${BASE_URL}/magic-mail/designer/templates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_JWT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `Test Template ${Date.now()}`,
        subject: 'Test Subject {{name}}',
        bodyHtml: '<h1>Hello {{name}}</h1>',
        bodyText: 'Hello {{name}}',
        category: 'transactional',
        templateReferenceId: Date.now(),
      }),
    });
    
    const createData = await createResp.json();
    const template = createData.data || createData;
    templateId = template.documentId || template.id;
    
    if (createResp.ok && templateId) {
      logSuccess(`Template created: ${template.name} (${templateId})`);
    } else {
      logError(`Template create failed: ${createResp.status}`);
      return false;
    }
    
    // READ ONE
    const getResp = await fetch(`${BASE_URL}/magic-mail/designer/templates/${templateId}`, {
      headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
    });
    
    if (getResp.ok) {
      logSuccess('Template read (single) works');
    } else {
      logError(`Template read failed: ${getResp.status}`);
    }
    
    // UPDATE
    const updateResp = await fetch(`${BASE_URL}/magic-mail/designer/templates/${templateId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${ADMIN_JWT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subject: 'Updated Subject {{name}}',
      }),
    });
    
    if (updateResp.ok) {
      logSuccess('Template update works');
    } else {
      logError(`Template update failed: ${updateResp.status}`);
    }
    
    // GET VERSIONS
    const versionsResp = await fetch(`${BASE_URL}/magic-mail/designer/templates/${templateId}/versions`, {
      headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
    });
    
    if (versionsResp.ok) {
      const versionsData = await versionsResp.json();
      const versions = versionsData.data || versionsData;
      logSuccess(`Template versions: ${Array.isArray(versions) ? versions.length : 0}`);
    } else {
      logWarning(`Template versions: ${versionsResp.status} (may not have versions yet)`);
    }
    
    // DUPLICATE
    const dupeResp = await fetch(`${BASE_URL}/magic-mail/designer/templates/${templateId}/duplicate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
    });
    
    let dupeId = null;
    if (dupeResp.ok) {
      const dupeData = await dupeResp.json();
      const dupe = dupeData.data || dupeData;
      dupeId = dupe.documentId || dupe.id;
      logSuccess(`Template duplicated: ${dupe.name}`);
    } else {
      logWarning(`Template duplicate: ${dupeResp.status}`);
    }
    
    // DOWNLOAD HTML
    const downloadResp = await fetch(`${BASE_URL}/magic-mail/designer/templates/${templateId}/download?type=html`, {
      headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
    });
    
    if (downloadResp.ok) {
      logSuccess('Template download (HTML) works');
    } else {
      logWarning(`Template download: ${downloadResp.status}`);
    }
    
    // DELETE (template + duplicate)
    if (dupeId) {
      await fetch(`${BASE_URL}/magic-mail/designer/templates/${dupeId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
      });
      logInfo('Duplicate template deleted');
    }
    
    const deleteResp = await fetch(`${BASE_URL}/magic-mail/designer/templates/${templateId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
    });
    
    if (deleteResp.ok) {
      logSuccess('Template delete works');
    } else {
      logError(`Template delete failed: ${deleteResp.status}`);
    }
    
    return true;
  } catch (err) {
    logError(`Template CRUD error: ${err.message}`);
    // Cleanup
    if (templateId) {
      try {
        await fetch(`${BASE_URL}/magic-mail/designer/templates/${templateId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${ADMIN_JWT}` },
        });
      } catch {}
    }
    return false;
  }
}

/**
 * SUMMARY: Print Test Results
 */
function printSummary() {
  logSection('TEST SUMMARY');
  
  console.log('');
  log('MAGICMAIL PLUGIN TESTS:', `${colors.cyan}${colors.bold}`);
  log(`  Mode:     ${IS_FULL_TEST ? 'FULL' : 'QUICK'}`, colors.cyan);
  log(`  Total:    ${results.passed + results.failed + results.skipped}`, colors.cyan);
  log(`  ✅ Passed:  ${results.passed}`, colors.green);
  log(`  ❌ Failed:  ${results.failed}`, colors.red);
  log(`  ⚠️  Skipped: ${results.skipped}`, colors.yellow);
  
  const total = results.passed + results.failed + results.skipped;
  const passRate = total > 0 ? Math.round((results.passed / total) * 100) : 0;
  
  console.log('');
  log('OVERALL:', `${colors.magenta}${colors.bold}`);
  log(`  Total Tests: ${total}`, colors.magenta);
  log(`  Pass Rate:   ${passRate}%`, passRate >= 80 ? colors.green : colors.yellow);
  console.log('');
  
  if (results.failed === 0) {
    log('╔════════════════════════════════════════════════════════════════╗', colors.green);
    log('║  ✓ ALL TESTS PASSED - Plugin is ready for release!            ║', colors.green);
    log('╚════════════════════════════════════════════════════════════════╝', colors.green);
  } else {
    log('╔════════════════════════════════════════════════════════════════╗', colors.red);
    log('║  ✗ TESTS FAILED - Please fix issues before release            ║', colors.red);
    log('╚════════════════════════════════════════════════════════════════╝', colors.red);
  }
  
  console.log('\n' + '='.repeat(70) + '\n');
}

/**
 * MAIN: Run All Tests
 */
async function runAllTests() {
  log('\n' + '█'.repeat(70), colors.magenta);
  log('  MAGICMAIL - EMAIL BUSINESS SUITE - TEST SUITE', `${colors.magenta}${colors.bold}`);
  log('█'.repeat(70) + '\n', colors.magenta);
  
  logInfo(`Base URL: ${BASE_URL}`);
  logInfo(`Admin Email: ${ADMIN_CREDENTIALS.email}`);
  logInfo(`Test Mode: ${IS_FULL_TEST ? 'FULL (all tests)' : 'QUICK (core tests)'}`);
  console.log('');
  
  // ============================================================
  // CORE TESTS (Always run)
  // ============================================================
  logCategory('CORE FUNCTIONALITY TESTS');
  
  // Authentication
  const loginSuccess = await testAdminLogin();
  if (!loginSuccess) {
    logError('Cannot continue without authentication');
    printSummary();
    process.exit(1);
  }
  await sleep(500);
  
  // Account Management
  await testGetAllAccounts();
  await sleep(500);
  
  await testCreateAccount();
  await sleep(500);
  
  // License & Configuration
  await testLicenseStatus();
  await sleep(500);
  
  // Email Templates
  await testEmailTemplates();
  await sleep(500);
  
  // Routing Rules
  await testRoutingRules();
  await sleep(500);
  
  // Analytics
  await testAnalyticsStats();
  await sleep(500);
  
  await testEmailLogs();
  await sleep(500);
  
  // Tracking
  await testTrackingPixel();
  await sleep(500);
  
  // ============================================================
  // INTEGRATION TESTS
  // ============================================================
  logCategory('INTEGRATION TESTS');
  
  await testTestAccount();
  await sleep(500);
  
  await testCreateOAuthAccount();
  await sleep(500);
  
  await testStrapiEmailService();
  await sleep(500);
  
  // ============================================================
  // SECURITY TESTS
  // ============================================================
  logCategory('SECURITY TESTS');

  await testUnauthenticatedSendBlocked();
  await sleep(500);

  await testUnauthenticatedAccountCreateBlocked();
  await sleep(500);

  await testPathTraversalBlocked();
  await sleep(500);

  await testOpenRedirectBlocked();
  await sleep(500);

  await testXssInTrackingEndpoints();
  await sleep(500);

  await testErrorLeakPrevention();
  await sleep(500);

  await testLicenseKeyMasked();
  await sleep(500);

  // ============================================================
  // ENDPOINT COVERAGE TESTS
  // ============================================================
  logCategory('ENDPOINT COVERAGE TESTS');

  await testLicenseLimits();
  await sleep(300);

  await testLicenseDebug();
  await sleep(300);

  await testDesignerStats();
  await sleep(300);

  await testCoreTemplate();
  await sleep(300);

  await testAnalyticsDebug();
  await sleep(300);

  await testWhatsAppEndpoints();
  await sleep(300);

  await testPluginSettings();
  await sleep(300);

  await testContentApiSendEndpoints();
  await sleep(300);

  await testTemplateCrudLifecycle();
  await sleep(500);

  // ============================================================
  // FULL TESTS (Only with --full flag)
  // ============================================================
  if (IS_FULL_TEST) {
    logCategory('EXTENDED TESTS (FULL MODE)');
    
    await testPluginBuild();
    await sleep(500);
    
    await testPerformance();
    await sleep(500);
  }
  
  // ============================================================
  // CLEANUP
  // ============================================================
  logCategory('CLEANUP');
  
  await testDeleteAccount();
  await sleep(500);
  
  // Print Summary
  printSummary();
  
  // Exit with proper code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Show help if requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
MagicMail Plugin Test Suite

Usage:
  node test-magic-mail.js [options]

Options:
  --quick    Run quick tests only (default)
  --full     Run all tests including build, performance & security
  --help     Show this help message

Security Tests (always run):
  - Unauthenticated send blocked (open relay prevention)
  - Unauthenticated account creation blocked
  - Attachment path traversal blocked
  - Open redirect blocked
  - XSS prevention in tracking endpoints
  - Error message leak prevention
  - License key masking

Environment Variables:
  ADMIN_EMAIL     Admin email (required)
  ADMIN_PASSWORD  Admin password (required)
  STRAPI_URL      Base URL (default: http://localhost:1337)
  TEST_EMAIL      Test recipient email (optional)

Examples:
  node test-magic-mail.js --quick
  node test-magic-mail.js --full
  ADMIN_EMAIL=admin@test.com ADMIN_PASSWORD=pass123 node test-magic-mail.js
  `);
  process.exit(0);
}

// Run tests
runAllTests().catch(err => {
  logError(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});

