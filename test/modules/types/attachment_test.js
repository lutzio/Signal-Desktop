const { assert } = require('chai');

const Attachment = require('../../../js/modules/types/attachment');

describe('Attachment', () => {
  describe('replaceUnicodeOrderOverrides', () => {
    it('should sanitize left-to-right order override character', async () => {
      const input = {
        contentType: 'image/jpeg',
        data: null,
        fileName: 'test\u202Dfig.exe',
        size: 1111,
        schemaVersion: 1,
      };
      const expected = {
        contentType: 'image/jpeg',
        data: null,
        fileName: 'test\uFFFDfig.exe',
        size: 1111,
        schemaVersion: 1,
      };

      const actual = await Attachment.replaceUnicodeOrderOverrides(input);
      assert.deepEqual(actual, expected);
    });

    it('should sanitize right-to-left order override character', async () => {
      const input = {
        contentType: 'image/jpeg',
        data: null,
        fileName: 'test\u202Efig.exe',
        size: 1111,
        schemaVersion: 1,
      };
      const expected = {
        contentType: 'image/jpeg',
        data: null,
        fileName: 'test\uFFFDfig.exe',
        size: 1111,
        schemaVersion: 1,
      };

      const actual = await Attachment.replaceUnicodeOrderOverrides(input);
      assert.deepEqual(actual, expected);
    });
  });
});
