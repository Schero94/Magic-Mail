/**
 * Test Controller für Template-Version Relations
 * [SUCCESS] Migrated to strapi.documents() API (Strapi v5 Best Practice)
 */

'use strict';

const EMAIL_TEMPLATE_UID = 'plugin::magic-mail.email-template';
const EMAIL_TEMPLATE_VERSION_UID = 'plugin::magic-mail.email-template-version';

module.exports = {
  /**
   * Test Template-Version Relations
   */
  async testRelations(ctx) {
    try {
      console.log('\n' + '='.repeat(60));
      console.log('[TEST] Template - Version Relations (Document Service API)');
      console.log('='.repeat(60));

      // Initialize test result variables
      let test1Success = false;
      let test1ReverseSuccess = false;
      let test2Success = false;
      let test2ReverseSuccess = false;
      let test3a_versionCreated = false;
      let test3a_hasTemplate = false;
      let test3b_twoVersions = false;
      let test3b_allHaveTemplate = false;

      // ============================================================
      // TEST 1: Version mit Template verbinden
      // ============================================================
      console.log('\n[TEST] TEST 1: Version → Template Verbindung\n');

      // Erstelle Test-Template
      const testTemplate = await strapi.documents(EMAIL_TEMPLATE_UID).create({
          data: {
            templateReferenceId: Math.floor(Math.random() * 1000000),
            name: 'Test Template Relations',
            subject: 'Test Subject',
            bodyHtml: '<p>Test HTML</p>',
            bodyText: 'Test Text',
            category: 'custom',
            isActive: true
          }
      });

      console.log(`[SUCCESS] Template erstellt: documentId ${testTemplate.documentId}`);

      // Erstelle Version mit Template-Verbindung
      const version1 = await strapi.documents(EMAIL_TEMPLATE_VERSION_UID).create({
          data: {
          template: testTemplate.documentId,
            versionNumber: 1,
            name: 'Version 1 von Test',
            subject: 'Test Subject V1',
            bodyHtml: '<p>Version 1 HTML</p>',
            bodyText: 'Version 1 Text'
          }
      });

      console.log(`[SUCCESS] Version erstellt: documentId ${version1.documentId}, versionNumber: ${version1.versionNumber}`);

      // Prüfe Version → Template
      const versionCheck = await strapi.documents(EMAIL_TEMPLATE_VERSION_UID).findOne({
        documentId: version1.documentId,
          populate: ['template']
      });

      console.log('\n[CHECK] Prüfung Version → Template:');
      test1Success = !!versionCheck.template;
      if (test1Success) {
        console.log(`   [SUCCESS] SUCCESS: Version → Template ${versionCheck.template.documentId}`);
      } else {
        console.log(`   [ERROR] FEHLER: Version hat KEINE Template-Verbindung!`);
      }

      // Prüfe Template → Versions
      const templateCheck1 = await strapi.documents(EMAIL_TEMPLATE_UID).findOne({
        documentId: testTemplate.documentId,
          populate: ['versions']
      });

      console.log('\n[CHECK] Prüfung Template → Versions:');
      test1ReverseSuccess = templateCheck1.versions && templateCheck1.versions.length > 0;
      if (test1ReverseSuccess) {
        console.log(`   [SUCCESS] SUCCESS: Template hat ${templateCheck1.versions.length} Version(en)`);
      } else {
        console.log(`   [ERROR] FEHLER: Template hat KEINE Versionen!`);
      }

      // ============================================================
      // TEST 2: Nachträgliche Verbindung
      // ============================================================
      console.log('\n\n[TEST] TEST 2: Nachträgliche Verbindung\n');

      // Version OHNE Template
      const version2 = await strapi.documents(EMAIL_TEMPLATE_VERSION_UID).create({
          data: {
            versionNumber: 2,
            name: 'Version 2 ohne Template',
            subject: 'Test Subject V2',
            bodyHtml: '<p>Version 2 HTML</p>',
            bodyText: 'Version 2 Text'
          }
      });

      console.log(`[SUCCESS] Version 2 erstellt: documentId ${version2.documentId} (ohne Template)`);

      // Nachträgliche Verbindung via Version-Update
      await strapi.documents(EMAIL_TEMPLATE_VERSION_UID).update({
        documentId: version2.documentId,
          data: {
          template: testTemplate.documentId
            }
      });

      console.log(`[SUCCESS] Version 2 mit Template verbunden`);

      // Prüfe Verbindung
      const templateCheck2 = await strapi.documents(EMAIL_TEMPLATE_UID).findOne({
        documentId: testTemplate.documentId,
          populate: ['versions']
      });

      console.log('\n[CHECK] Prüfung nach Update:');
      test2Success = templateCheck2.versions && templateCheck2.versions.length >= 2;
      if (test2Success) {
        console.log(`   [SUCCESS] SUCCESS: Template hat jetzt ${templateCheck2.versions.length} Versionen`);
      } else {
        console.log(`   [ERROR] FEHLER: Template hat nur ${templateCheck2.versions?.length || 0} Version(en)!`);
      }

      // Prüfe von Version 2 aus
      const version2Check = await strapi.documents(EMAIL_TEMPLATE_VERSION_UID).findOne({
        documentId: version2.documentId,
          populate: ['template']
      });

      test2ReverseSuccess = !!version2Check.template;
      if (test2ReverseSuccess) {
        console.log(`   [SUCCESS] SUCCESS: Version 2 → Template verbunden`);
      } else {
        console.log(`   [ERROR] FEHLER: Version 2 hat KEINE Template-Verbindung!`);
      }

      // ============================================================
      // TEST 3: Auto-Versionierung
      // ============================================================
      console.log('\n\n[TEST] TEST 3: Template Update (Auto-Versionierung)\n');

      const autoTemplate = await strapi.documents(EMAIL_TEMPLATE_UID).create({
          data: {
            templateReferenceId: Math.floor(Math.random() * 1000000),
            name: 'Auto Version Test',
            subject: 'Original Subject',
            bodyHtml: '<p>Original HTML</p>',
            bodyText: 'Original Text',
            category: 'custom',
            isActive: true
          }
      });

      console.log(`[SUCCESS] Template erstellt: documentId ${autoTemplate.documentId}`);

      // Update via email-designer Service
      const emailDesignerService = strapi.plugin('magic-mail').service('email-designer');
      await emailDesignerService.update(autoTemplate.documentId, {
        subject: 'Updated Subject V1',
        bodyHtml: '<p>Updated HTML V1</p>',
        bodyText: 'Updated Text V1'
      });

      console.log('[SUCCESS] Template updated');

      const afterFirstUpdate = await strapi.documents(EMAIL_TEMPLATE_UID).findOne({
        documentId: autoTemplate.documentId,
        populate: ['versions']
      });

      console.log('\n[CHECK] Prüfung nach 1. Update:');
      test3a_versionCreated = afterFirstUpdate.versions && afterFirstUpdate.versions.length === 1;
      
      if (test3a_versionCreated) {
        console.log(`   [SUCCESS] SUCCESS: Automatisch 1 Version erstellt`);
        
        const autoVersion1 = await strapi.documents(EMAIL_TEMPLATE_VERSION_UID).findOne({
          documentId: afterFirstUpdate.versions[0].documentId,
          populate: ['template']
        });

        test3a_hasTemplate = !!autoVersion1.template;
        if (test3a_hasTemplate) {
          console.log(`   [SUCCESS] SUCCESS: Version hat Template-Verbindung`);
        } else {
          console.log(`   [ERROR] FEHLER: Version hat KEINE Template-Verbindung!`);
        }
      } else {
        console.log(`   [ERROR] FEHLER: Keine Version erstellt!`);
      }

      // Zweites Update
      await emailDesignerService.update(autoTemplate.documentId, {
        subject: 'Updated Subject V2',
        bodyHtml: '<p>Updated HTML V2</p>',
        bodyText: 'Updated Text V2'
      });

      const afterSecondUpdate = await strapi.documents(EMAIL_TEMPLATE_UID).findOne({
        documentId: autoTemplate.documentId,
        populate: ['versions']
      });

      console.log('\n[CHECK] Prüfung nach 2. Update:');
      test3b_twoVersions = afterSecondUpdate.versions && afterSecondUpdate.versions.length === 2;
      
      if (test3b_twoVersions) {
        console.log(`   [SUCCESS] SUCCESS: Jetzt 2 Versionen vorhanden`);
        
        let allVersionsHaveTemplate = true;
        for (const version of afterSecondUpdate.versions) {
          const fullVersion = await strapi.documents(EMAIL_TEMPLATE_VERSION_UID).findOne({
            documentId: version.documentId,
            populate: ['template']
          });
          
          if (!fullVersion.template) {
            allVersionsHaveTemplate = false;
          }
        }

        test3b_allHaveTemplate = allVersionsHaveTemplate;
        if (allVersionsHaveTemplate) {
          console.log(`   [SUCCESS] SUCCESS: Alle Versionen haben Template-Verbindung!`);
        } else {
          console.log(`   [ERROR] FEHLER: Nicht alle Versionen haben Template-Verbindung!`);
        }
      } else {
        console.log(`   [ERROR] FEHLER: Falsche Anzahl Versionen!`);
      }

      // Cleanup Test 3
      console.log('\n[CLEANUP] Cleanup Test 3...');
      if (afterSecondUpdate.versions) {
        for (const version of afterSecondUpdate.versions) {
          await strapi.documents(EMAIL_TEMPLATE_VERSION_UID).delete({ documentId: version.documentId });
        }
      }
      await strapi.documents(EMAIL_TEMPLATE_UID).delete({ documentId: autoTemplate.documentId });
      console.log('   [SUCCESS] Test 3 Daten gelöscht');

      // ============================================================
      // Zusammenfassung
      // ============================================================
      console.log('\n\n' + '='.repeat(60));
      console.log('[STATS] ZUSAMMENFASSUNG');
      console.log('='.repeat(60));

      const finalTemplate = await strapi.documents(EMAIL_TEMPLATE_UID).findOne({
        documentId: testTemplate.documentId,
          populate: ['versions']
      });

      console.log(`\n[INFO] Template: "${finalTemplate.name}" (documentId: ${finalTemplate.documentId})`);
      console.log(`   Anzahl Versionen: ${finalTemplate.versions?.length || 0}`);

      // Cleanup
      console.log('\n[CLEANUP] Aufraumen...');
      await strapi.documents(EMAIL_TEMPLATE_VERSION_UID).delete({ documentId: version1.documentId });
      await strapi.documents(EMAIL_TEMPLATE_VERSION_UID).delete({ documentId: version2.documentId });
      await strapi.documents(EMAIL_TEMPLATE_UID).delete({ documentId: testTemplate.documentId });
      console.log('   [SUCCESS] Alle Test-Daten gelöscht');

      console.log('\n[SUCCESS] Test abgeschlossen!\n');

      const allSuccess = test1Success && test1ReverseSuccess && test2Success && test2ReverseSuccess && 
                         test3a_versionCreated && test3a_hasTemplate && test3b_twoVersions && test3b_allHaveTemplate;

      ctx.body = {
        success: allSuccess,
        message: allSuccess ? 'Alle Tests erfolgreich! [SUCCESS]' : 'Einige Tests fehlgeschlagen [ERROR]',
        tests: {
          test1_version_to_template: test1Success,
          test1_template_to_version: test1ReverseSuccess,
          test2_template_connect: test2Success,
          test2_version_to_template: test2ReverseSuccess,
          test3_auto_version_created: test3a_versionCreated,
          test3_auto_version_has_template: test3a_hasTemplate,
          test3_two_auto_versions: test3b_twoVersions,
          test3_all_auto_versions_have_template: test3b_allHaveTemplate,
        }
      };

    } catch (error) {
      console.error('\n[ERROR] FEHLER:', error.message);
      console.error(error.stack);
      ctx.throw(500, error);
    }
  }
};
