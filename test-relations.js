/**
 * Test Script für email-template <-> email-template-version Relations
 * 
 * Tests:
 * 1. Version erstellen und mit bestehendem Template verbinden
 * 2. Template mit neuer Version verbinden
 * 
 * Nutzt Strapi's interne entityService direkt
 */

async function testRelations() {
  try {
    // Wir gehen davon aus, dass Strapi bereits läuft und verfügbar ist
    // Dieser Script sollte aus einem Strapi Context heraus aufgerufen werden
    const strapi = global.strapi;
    
    if (!strapi) {
      console.error('❌ Strapi ist nicht verfügbar. Dieser Script muss aus einem Strapi Context aufgerufen werden.');
      console.log('Tipp: Nutze "strapi console" und führe dann den Code aus.');
      process.exit(1);
    }

    console.log('✅ Strapi gefunden\n');
    console.log('=' .repeat(60));

    // ============================================================
    // TEST 1: Version mit Template verbinden (manyToOne Direction)
    // ============================================================
    console.log('\n📝 TEST 1: Version → Template Verbindung\n');
    console.log('-'.repeat(60));

    // Erstelle ein Test-Template
    const testTemplate = await strapi.entityService.create(
      'plugin::magic-mail.email-template',
      {
        data: {
          templateReferenceId: Math.floor(Math.random() * 1000000),
          name: 'Test Template Relations',
          subject: 'Test Subject',
          bodyHtml: '<p>Test HTML</p>',
          bodyText: 'Test Text',
          category: 'custom',
          isActive: true
        }
      }
    );

    console.log(`✅ Template erstellt: ID ${testTemplate.id}`);

    // Erstelle eine Version und verbinde sie mit dem Template
    const version1 = await strapi.entityService.create(
      'plugin::magic-mail.email-template-version',
      {
        data: {
          template: testTemplate.id, // Verbindung von Version → Template
          versionNumber: 1,
          name: 'Version 1 von Test',
          subject: 'Test Subject V1',
          bodyHtml: '<p>Version 1 HTML</p>',
          bodyText: 'Version 1 Text'
        }
      }
    );

    console.log(`✅ Version erstellt: ID ${version1.id}, versionNumber: ${version1.versionNumber}`);

    // Prüfe ob die Verbindung funktioniert hat
    const versionCheck = await strapi.entityService.findOne(
      'plugin::magic-mail.email-template-version',
      version1.id,
      {
        populate: ['template']
      }
    );

    console.log('\n🔍 Prüfung der Version → Template Verbindung:');
    if (versionCheck.template) {
      console.log(`   ✅ SUCCESS: Version ${versionCheck.id} ist mit Template ${versionCheck.template.id} verbunden`);
      console.log(`   📋 Template Name: ${versionCheck.template.name}`);
    } else {
      console.log(`   ❌ FEHLER: Version ${versionCheck.id} hat KEINE Template-Verbindung!`);
    }

    // Prüfe auch vom Template aus
    const templateCheck1 = await strapi.entityService.findOne(
      'plugin::magic-mail.email-template',
      testTemplate.id,
      {
        populate: ['versions']
      }
    );

    console.log('\n🔍 Prüfung der Template → Versions Verbindung:');
    if (templateCheck1.versions && templateCheck1.versions.length > 0) {
      console.log(`   ✅ SUCCESS: Template ${templateCheck1.id} hat ${templateCheck1.versions.length} Version(en)`);
      templateCheck1.versions.forEach(v => {
        console.log(`   📋 Version ${v.id}: versionNumber ${v.versionNumber}`);
      });
    } else {
      console.log(`   ❌ FEHLER: Template ${templateCheck1.id} hat KEINE Versionen!`);
    }

    // ============================================================
    // TEST 2: Template mit neuer Version verbinden (oneToMany Direction)
    // ============================================================
    console.log('\n\n📝 TEST 2: Template mit neuer Version verbinden\n');
    console.log('-'.repeat(60));

    // Erstelle eine weitere Version
    const version2 = await strapi.entityService.create(
      'plugin::magic-mail.email-template-version',
      {
        data: {
          versionNumber: 2,
          name: 'Version 2 ohne Template',
          subject: 'Test Subject V2',
          bodyHtml: '<p>Version 2 HTML</p>',
          bodyText: 'Version 2 Text'
        }
      }
    );

    console.log(`✅ Version 2 erstellt: ID ${version2.id} (zunächst ohne Template-Verbindung)`);

    // Update das Template und füge die neue Version hinzu
    const updatedTemplate = await strapi.entityService.update(
      'plugin::magic-mail.email-template',
      testTemplate.id,
      {
        data: {
          versions: {
            connect: [version2.id]
          }
        },
        populate: ['versions']
      }
    );

    console.log(`✅ Template updated mit Version 2`);

    // Prüfe ob die Verbindung funktioniert hat
    const templateCheck2 = await strapi.entityService.findOne(
      'plugin::magic-mail.email-template',
      testTemplate.id,
      {
        populate: ['versions']
      }
    );

    console.log('\n🔍 Prüfung nach Template Update:');
    if (templateCheck2.versions && templateCheck2.versions.length >= 2) {
      console.log(`   ✅ SUCCESS: Template ${templateCheck2.id} hat jetzt ${templateCheck2.versions.length} Versionen`);
      templateCheck2.versions.forEach(v => {
        console.log(`   📋 Version ${v.id}: versionNumber ${v.versionNumber}, name: ${v.name}`);
      });
    } else {
      console.log(`   ❌ FEHLER: Template ${templateCheck2.id} hat nur ${templateCheck2.versions?.length || 0} Version(en)!`);
    }

    // Prüfe auch von Version 2 aus
    const version2Check = await strapi.entityService.findOne(
      'plugin::magic-mail.email-template-version',
      version2.id,
      {
        populate: ['template']
      }
    );

    console.log('\n🔍 Prüfung der Version 2 → Template Verbindung:');
    if (version2Check.template) {
      console.log(`   ✅ SUCCESS: Version ${version2Check.id} ist mit Template ${version2Check.template.id} verbunden`);
      console.log(`   📋 Template Name: ${version2Check.template.name}`);
    } else {
      console.log(`   ❌ FEHLER: Version ${version2Check.id} hat KEINE Template-Verbindung!`);
    }

    // ============================================================
    // Zusammenfassung
    // ============================================================
    console.log('\n\n' + '='.repeat(60));
    console.log('📊 ZUSAMMENFASSUNG');
    console.log('='.repeat(60));

    const finalTemplate = await strapi.entityService.findOne(
      'plugin::magic-mail.email-template',
      testTemplate.id,
      {
        populate: ['versions']
      }
    );

    const allVersions = await strapi.entityService.findMany(
      'plugin::magic-mail.email-template-version',
      {
        filters: {
          template: testTemplate.id
        },
        populate: ['template']
      }
    );

    console.log(`\n📋 Template: ${finalTemplate.name} (ID: ${finalTemplate.id})`);
    console.log(`   Anzahl Versionen: ${finalTemplate.versions?.length || 0}`);
    
    console.log(`\n📋 Gefundene Versionen für dieses Template:`);
    allVersions.forEach(v => {
      console.log(`   - Version ${v.id}: versionNumber ${v.versionNumber}, Template-ID: ${v.template?.id || 'KEINE'}`);
    });

    // Cleanup
    console.log('\n\n🧹 Aufräumen...');
    await strapi.entityService.delete('plugin::magic-mail.email-template-version', version1.id);
    await strapi.entityService.delete('plugin::magic-mail.email-template-version', version2.id);
    await strapi.entityService.delete('plugin::magic-mail.email-template', testTemplate.id);
    console.log('✅ Test-Daten gelöscht\n');

  } catch (error) {
    console.error('\n❌ FEHLER:', error.message);
    console.error(error.stack);
  }
}

// Export für direkten Aufruf
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { testRelations };
}

// Auto-run wenn direkt aufgerufen
if (require.main === module) {
  testRelations().then(() => process.exit(0));
}
