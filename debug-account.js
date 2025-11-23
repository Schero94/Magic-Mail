/**
 * Debug Script - Check Gmail OAuth Account Structure
 * Shows what's actually stored in the database
 */

const BASE_URL = 'http://localhost:1337';

const ADMIN_CREDENTIALS = {
  email: process.env.ADMIN_EMAIL || 'schero1894@gmail.com',
  password: process.env.ADMIN_PASSWORD || 'your-password',
};

async function debugAccount() {
  console.log('\n🔍 DEBUGGING GMAIL OAUTH ACCOUNT\n');
  
  // 1. Admin Login
  console.log('1️⃣ Logging in as admin...');
  const loginRes = await fetch(`${BASE_URL}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ADMIN_CREDENTIALS),
  });
  
  const loginData = await loginRes.json();
  
  if (!loginRes.ok) {
    console.error('❌ Login failed:', loginData);
    process.exit(1);
  }
  
  const adminJWT = loginData.data.token;
  console.log('✅ Logged in\n');
  
  // 2. Get all accounts
  console.log('2️⃣ Fetching all accounts...');
  const accountsRes = await fetch(`${BASE_URL}/magic-mail/accounts`, {
    headers: { 'Authorization': `Bearer ${adminJWT}` },
  });
  
  const accountsData = await accountsRes.json();
  
  if (!accountsRes.ok) {
    console.error('❌ Failed to get accounts:', accountsData);
    process.exit(1);
  }
  
  console.log(`✅ Found ${accountsData.data.length} account(s)\n`);
  
  // 3. Find Gmail OAuth accounts
  const gmailAccounts = accountsData.data.filter(a => a.provider === 'gmail-oauth');
  
  if (gmailAccounts.length === 0) {
    console.log('⚠️  No Gmail OAuth accounts found');
    console.log('   Please create one using the "Connect with Google" flow\n');
    process.exit(0);
  }
  
  console.log(`📧 Found ${gmailAccounts.length} Gmail OAuth account(s):\n`);
  
  // 4. Inspect each Gmail account
  gmailAccounts.forEach((account, index) => {
    console.log(`${'='.repeat(70)}`);
    console.log(`Account ${index + 1}: ${account.name}`);
    console.log(`${'='.repeat(70)}`);
    console.log('  ID:', account.id);
    console.log('  Provider:', account.provider);
    console.log('  From Email:', account.fromEmail);
    console.log('  From Name:', account.fromName);
    console.log('  Is Active:', account.isActive);
    console.log('  Is Primary:', account.isPrimary);
    console.log('  Priority:', account.priority);
    console.log('\n  📦 Fields Present:');
    console.log('    ✓ config:', !!account.config ? '✅ YES' : '❌ NO');
    console.log('    ✓ oauth:', !!account.oauth ? '✅ YES' : '❌ NO');
    
    if (account.config) {
      console.log('\n  🔧 Config Field (encrypted):');
      console.log('    Length:', JSON.stringify(account.config).length, 'chars');
      console.log('    Type:', typeof account.config);
    }
    
    if (account.oauth) {
      console.log('\n  🔐 OAuth Field (encrypted):');
      console.log('    Length:', JSON.stringify(account.oauth).length, 'chars');
      console.log('    Type:', typeof account.oauth);
    } else {
      console.log('\n  ⚠️  WARNING: No OAuth field!');
      console.log('    This account was not created via OAuth flow');
      console.log('    It cannot send emails - please recreate with "Connect with Google"');
    }
    
    console.log('\n  📊 Stats:');
    console.log('    Emails Today:', account.emailsSentToday || 0);
    console.log('    Total Sent:', account.totalEmailsSent || 0);
    console.log('    Daily Limit:', account.dailyLimit || 'unlimited');
    console.log('');
  });
  
  console.log('\n' + '='.repeat(70));
  console.log('💡 RECOMMENDATIONS:');
  console.log('='.repeat(70));
  
  const invalidAccounts = gmailAccounts.filter(a => !a.oauth);
  
  if (invalidAccounts.length > 0) {
    console.log('\n⚠️  You have', invalidAccounts.length, 'Gmail OAuth account(s) WITHOUT OAuth tokens!');
    console.log('   These accounts were created manually and cannot send emails.');
    console.log('   Please DELETE them and create new ones using the OAuth flow:\n');
    invalidAccounts.forEach(a => {
      console.log(`   - Delete: "${a.name}" (ID: ${a.id})`);
    });
    console.log('\n   Then create a NEW account with "Connect with Google" button\n');
  } else {
    console.log('\n✅ All Gmail OAuth accounts have proper OAuth tokens!');
    console.log('   They should be able to send emails.\n');
  }
}

// Run debug
debugAccount().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

