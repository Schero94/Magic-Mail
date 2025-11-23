/**
 * Test Controller für Template-Version Relations
 */

'use strict';

module.exports = {
  /**
   * Test Template-Version Relations
   * 
   * Tests beide Richtungen:
   * 1. Version → Template beim Erstellen
   * 2. Template → Version nachträglich via connect
   */
  async testRelations(ctx) {
    try {
      console.log('\n' + '='.repeat(60));
      console.log('🧪 TEST: Template ↔ Version Relations');
      console.log('='.repeat(60));

      // Initialize all test result variables
      let test1Success = false;
      let test1ReverseSuccess = false;
      let test2Success = false;
      let test2ReverseSuccess = false;
      let test3a_versionCreated = false;
      let test3a_hasTemplate = false;
      let test3b_twoVersions = false;
      let test3b_allHaveTemplate = false;

      // ============================================================
      // TEST 1: Version mit Template verbinden (manyToOne Direction)
      // ============================================================
      console.log('\n📝 TEST 1: Version → Template Verbindung\n');

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

      // Erstelle eine Version und verbinde sie direkt mit dem Template
      const version1 = await strapi.entityService.create(
        'plugin::magic-mail.email-template-version',
        {
          data: {
            template: testTemplate.id, // 👈 Direkte Verbindung beim Erstellen
            versionNumber: 1,
            name: 'Version 1 von Test',
            subject: 'Test Subject V1',
            bodyHtml: '<p>Version 1 HTML</p>',
            bodyText: 'Version 1 Text'
          }
        }
      );

      console.log(`✅ Version erstellt: ID ${version1.id}, versionNumber: ${version1.versionNumber}`);

      // Prüfe die Verbindung von Version → Template
      const versionCheck = await strapi.entityService.findOne(
        'plugin::magic-mail.email-template-version',
        version1.id,
        {
          populate: ['template']
        }
      );

      console.log('\n🔍 Prüfung Version → Template:');
      test1Success = !!versionCheck.template;
      if (test1Success) {
        console.log(`   ✅ SUCCESS: Version ${versionCheck.id} → Template ${versionCheck.template.id}`);
        console.log(`   📋 Template: "${versionCheck.template.name}"`);
      } else {
        console.log(`   ❌ FEHLER: Version ${versionCheck.id} hat KEINE Template-Verbindung!`);
      }

      // Prüfe die Verbindung von Template → Version
      const templateCheck1 = await strapi.entityService.findOne(
        'plugin::magic-mail.email-template',
        testTemplate.id,
        {
          populate: ['versions']
        }
      );

      console.log('\n🔍 Prüfung Template → Versions:');
      test1ReverseSuccess = templateCheck1.versions && templateCheck1.versions.length > 0;
      if (test1ReverseSuccess) {
        console.log(`   ✅ SUCCESS: Template ${templateCheck1.id} hat ${templateCheck1.versions.length} Version(en)`);
        templateCheck1.versions.forEach(v => {
          console.log(`   📋 Version ${v.id}: versionNumber ${v.versionNumber}`);
        });
      } else {
        console.log(`   ❌ FEHLER: Template ${templateCheck1.id} hat KEINE Versionen!`);
      }

      // ============================================================
      // TEST 2: Nachträglich Version mit Template verbinden
      // ============================================================
      console.log('\n\n📝 TEST 2: Nachträgliche Verbindung (Template Update)\n');

      // Erstelle Version OHNE Template
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

      console.log(`✅ Version 2 erstellt: ID ${version2.id} (ohne Template)`);

      // Verbinde Version nachträglich mit Template über Template-Update
      await strapi.entityService.update(
        'plugin::magic-mail.email-template',
        testTemplate.id,
        {
          data: {
            versions: {
              connect: [version2.id] // 👈 Nachträgliche Verbindung
            }
          }
        }
      );

      console.log(`✅ Template updated: Version ${version2.id} verbunden`);

      // Prüfe ob die Verbindung jetzt existiert
      const templateCheck2 = await strapi.entityService.findOne(
        'plugin::magic-mail.email-template',
        testTemplate.id,
        {
          populate: ['versions']
        }
      );

      console.log('\n🔍 Prüfung nach Template Update:');
      test2Success = templateCheck2.versions && templateCheck2.versions.length >= 2;
      if (test2Success) {
        console.log(`   ✅ SUCCESS: Template hat jetzt ${templateCheck2.versions.length} Versionen`);
        templateCheck2.versions.forEach(v => {
          console.log(`   📋 Version ${v.id}: versionNumber ${v.versionNumber}, "${v.name}"`);
        });
      } else {
        console.log(`   ❌ FEHLER: Template hat nur ${templateCheck2.versions?.length || 0} Version(en)!`);
      }

      // Prüfe auch von Version 2 aus
      const version2Check = await strapi.entityService.findOne(
        'plugin::magic-mail.email-template-version',
        version2.id,
        {
          populate: ['template']
        }
      );

      console.log('\n🔍 Prüfung Version 2 → Template:');
      test2ReverseSuccess = !!version2Check.template;
      if (test2ReverseSuccess) {
        console.log(`   ✅ SUCCESS: Version ${version2Check.id} → Template ${version2Check.template.id}`);
        console.log(`   📋 Template: "${version2Check.template.name}"`);
      } else {
        console.log(`   ❌ FEHLER: Version ${version2Check.id} hat KEINE Template-Verbindung!`);
      }

      // ============================================================
      // TEST 3: ECHTER USE CASE - Template Update mit Auto-Versionierung
      // ============================================================
      console.log('\n\n📝 TEST 3: Template Update (Auto-Versionierung)\n');

      // Erstelle ein neues Template für diesen Test
      const autoTemplate = await strapi.entityService.create(
        'plugin::magic-mail.email-template',
        {
          data: {
            templateReferenceId: Math.floor(Math.random() * 1000000),
            name: 'Auto Version Test',
            subject: 'Original Subject',
            bodyHtml: '<p>Original HTML</p>',
            bodyText: 'Original Text',
            category: 'custom',
            isActive: true
          }
        }
      );

      console.log(`✅ Template erstellt: ID ${autoTemplate.id}, name: "${autoTemplate.name}"`);

      // Prüfe: Sollte noch KEINE Versionen haben
      const beforeUpdate = await strapi.entityService.findOne(
        'plugin::magic-mail.email-template',
        autoTemplate.id,
        { populate: ['versions'] }
      );

      console.log(`   📊 Versionen vor Update: ${beforeUpdate.versions?.length || 0}`);

      // Jetzt UPDATE das Template (sollte automatisch Version erstellen)
      console.log('\n🔄 Führe Template-Update aus...');
      
      const emailDesignerService = strapi.plugin('magic-mail').service('email-designer');
      await emailDesignerService.update(autoTemplate.id, {
        subject: 'Updated Subject V1',
        bodyHtml: '<p>Updated HTML V1</p>',
        bodyText: 'Updated Text V1'
      });

      console.log('✅ Template updated');

      // Prüfe ob automatisch eine Version erstellt wurde
      const afterFirstUpdate = await strapi.entityService.findOne(
        'plugin::magic-mail.email-template',
        autoTemplate.id,
        { populate: ['versions'] }
      );

      console.log('\n🔍 Prüfung nach 1. Update:');
      test3a_versionCreated = afterFirstUpdate.versions && afterFirstUpdate.versions.length === 1;
      
      if (test3a_versionCreated) {
        console.log(`   ✅ SUCCESS: Automatisch 1 Version erstellt`);
        
        // Prüfe ob die Version eine Template-Verbindung hat
        const autoVersion1 = await strapi.entityService.findOne(
          'plugin::magic-mail.email-template-version',
          afterFirstUpdate.versions[0].id,
          { populate: ['template'] }
        );

        test3a_hasTemplate = !!autoVersion1.template;
        if (test3a_hasTemplate) {
          console.log(`   ✅ SUCCESS: Version ${autoVersion1.id} hat Template-Verbindung (Template ID: ${autoVersion1.template.id})`);
          console.log(`   📋 Version: versionNumber ${autoVersion1.versionNumber}, subject: "${autoVersion1.subject}"`);
        } else {
          console.log(`   ❌ FEHLER: Version ${autoVersion1.id} hat KEINE Template-Verbindung!`);
        }
      } else {
        console.log(`   ❌ FEHLER: Keine Version erstellt! Versionen: ${afterFirstUpdate.versions?.length || 0}`);
      }

      // Zweites Update - sollte eine zweite Version erstellen
      console.log('\n🔄 Führe 2. Template-Update aus...');
      
      await emailDesignerService.update(autoTemplate.id, {
        subject: 'Updated Subject V2',
        bodyHtml: '<p>Updated HTML V2</p>',
        bodyText: 'Updated Text V2'
      });

      console.log('✅ Template updated (2. Mal)');

      // Prüfe ob jetzt 2 Versionen existieren
      const afterSecondUpdate = await strapi.entityService.findOne(
        'plugin::magic-mail.email-template',
        autoTemplate.id,
        { populate: ['versions'] }
      );

      console.log('\n🔍 Prüfung nach 2. Update:');
      test3b_twoVersions = afterSecondUpdate.versions && afterSecondUpdate.versions.length === 2;
      
      if (test3b_twoVersions) {
        console.log(`   ✅ SUCCESS: Jetzt 2 Versionen vorhanden`);
        
        // Prüfe beide Versionen
        let allVersionsHaveTemplate = true;
        for (const version of afterSecondUpdate.versions) {
          const fullVersion = await strapi.entityService.findOne(
            'plugin::magic-mail.email-template-version',
            version.id,
            { populate: ['template'] }
          );
          
          if (fullVersion.template) {
            console.log(`   ✅ Version ${fullVersion.id} (v${fullVersion.versionNumber}): Template-Verbindung OK`);
          } else {
            console.log(`   ❌ Version ${fullVersion.id} (v${fullVersion.versionNumber}): KEINE Template-Verbindung!`);
            allVersionsHaveTemplate = false;
          }
        }

        test3b_allHaveTemplate = allVersionsHaveTemplate;
        if (allVersionsHaveTemplate) {
          console.log(`   ✅ SUCCESS: Alle Versionen haben Template-Verbindung!`);
        }
      } else {
        console.log(`   ❌ FEHLER: Falsche Anzahl Versionen! Erwartet: 2, Gefunden: ${afterSecondUpdate.versions?.length || 0}`);
      }

      // Cleanup für Test 3
      console.log('\n🧹 Cleanup Test 3...');
      if (afterSecondUpdate.versions) {
        for (const version of afterSecondUpdate.versions) {
          await strapi.entityService.delete('plugin::magic-mail.email-template-version', version.id);
        }
      }
      await strapi.entityService.delete('plugin::magic-mail.email-template', autoTemplate.id);
      console.log('   ✅ Test 3 Daten gelöscht');

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

      console.log(`\n📋 Template: "${finalTemplate.name}" (ID: ${finalTemplate.id})`);
      console.log(`   Anzahl Versionen im Template: ${finalTemplate.versions?.length || 0}`);
      
      if (finalTemplate.versions && finalTemplate.versions.length > 0) {
        finalTemplate.versions.forEach(v => {
          console.log(`   - Version ${v.id}: versionNumber ${v.versionNumber}`);
        });
      }

      // Cleanup
      console.log('\n🧹 Aufräumen...');
      await strapi.entityService.delete('plugin::magic-mail.email-template-version', version1.id);
      console.log(`   ✅ Version ${version1.id} gelöscht`);
      await strapi.entityService.delete('plugin::magic-mail.email-template-version', version2.id);
      console.log(`   ✅ Version ${version2.id} gelöscht`);
      await strapi.entityService.delete('plugin::magic-mail.email-template', testTemplate.id);
      console.log(`   ✅ Template ${testTemplate.id} gelöscht`);

      console.log('\n✅ Test abgeschlossen!\n');

      // Return result
      const allSuccess = test1Success && test1ReverseSuccess && test2Success && test2ReverseSuccess && 
                         test3a_versionCreated && test3a_hasTemplate && test3b_twoVersions && test3b_allHaveTemplate;

      ctx.body = {
        success: allSuccess,
        message: allSuccess ? 'Alle Tests erfolgreich! ✅' : 'Einige Tests fehlgeschlagen ❌',
        tests: {
          test1_version_to_template: test1Success,
          test1_template_to_version: test1ReverseSuccess,
          test2_template_connect: test2Success,
          test2_version_to_template: test2ReverseSuccess,
          test3_auto_version_created: test3a_versionCreated,
          test3_auto_version_has_template: test3a_hasTemplate,
          test3_two_auto_versions: test3b_twoVersions,
          test3_all_auto_versions_have_template: test3b_allHaveTemplate,
        },
        template: {
          id: testTemplate.id,
          name: testTemplate.name,
          versionsCount: finalTemplate.versions?.length || 0
        }
      };

    } catch (error) {
      console.error('\n❌ FEHLER:', error.message);
      console.error(error.stack);
      ctx.throw(500, error);
    }
  }
};

