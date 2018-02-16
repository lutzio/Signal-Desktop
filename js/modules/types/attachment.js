const isString = require('lodash/isString');

const MIME = require('./mime');
const { arrayBufferToBlob, blobToArrayBuffer, dataURLToBlob } = require('blob-util');
const { autoOrientImage } = require('../auto_orient_image');

// Schema version history
//
// Version 1
//   - Auto-orient JPEG attachments using EXIF `Orientation` data
//   - Add `schemaVersion` property
// Version 2
//   - Sanitize Unicode order override characters

// // Incoming message attachment fields
// {
//   id: string
//   contentType: MIMEType
//   data: ArrayBuffer
//   digest: ArrayBuffer
//   fileName: string
//   flags: null
//   key: ArrayBuffer
//   size: integer
//   thumbnail: ArrayBuffer
//   schemaVersion: integer
// }

// // Outgoing message attachment fields
// {
//   contentType: MIMEType
//   data: ArrayBuffer
//   fileName: string
//   size: integer
//   schemaVersion: integer
// }

// Middleware
// type UpgradeStep = Attachment -> Promise Attachment

// SchemaVersion -> UpgradeStep -> UpgradeStep
const withSchemaVersion = (schemaVersion, next) => async (attachment) => {
  const isAlreadyUpgraded = attachment.schemaVersion >= schemaVersion;
  if (isAlreadyUpgraded) {
    return attachment;
  }

  let upgradedAttachment;
  try {
    upgradedAttachment = await next(attachment);
  } catch (error) {
    console.error('Attachment.withSchemaVersion: error:', error);
    upgradedAttachment = null;
  }

  const hasSuccessfullyUpgraded = upgradedAttachment !== null;
  if (!hasSuccessfullyUpgraded) {
    return attachment;
  }

  return Object.assign(
    {},
    upgradedAttachment,
    { schemaVersion }
  );
};

// Upgrade steps
const autoOrientJPEG = async (attachment) => {
  if (!MIME.isJPEG(attachment.contentType)) {
    return attachment;
  }

  const dataBlob = await arrayBufferToBlob(attachment.data, attachment.contentType);
  const newDataBlob = await dataURLToBlob(await autoOrientImage(dataBlob));
  const newDataArrayBuffer = await blobToArrayBuffer(newDataBlob);

  // IMPORTANT: We overwrite the existing `data` `ArrayBuffer` losing the original
  // image data. Ideally, we’d preserve the original image data for users who want to
  // retain it but due to reports of data loss, we don’t want to overburden IndexedDB
  // by potentially doubling stored image data.
  // See: https://github.com/signalapp/Signal-Desktop/issues/1589
  const newAttachment = Object.assign({}, attachment, {
    data: newDataArrayBuffer,
    size: newDataArrayBuffer.byteLength,
  });

  // `digest` is no longer valid for auto-oriented image data, so we discard it:
  delete newAttachment.digest;

  return newAttachment;
};

const UNICODE_LEFT_TO_RIGHT_OVERRIDE = '\u202D';
const UNICODE_RIGHT_TO_LEFT_OVERRIDE = '\u202E';
const UNICODE_REPLACEMENT_CHARACTER = '\uFFFD';
// NOTE: Expose synchronous version to do property-based testing using `testcheck`,
// which currently doesn’t support async testing:
// https://github.com/leebyron/testcheck-js/issues/45
exports.replaceUnicodeOrderOverridesSync = (attachment) => {
  if (!isString(attachment.fileName)) {
    return attachment;
  }

  const normalizedFilename = attachment.fileName
    .replace(UNICODE_LEFT_TO_RIGHT_OVERRIDE, UNICODE_REPLACEMENT_CHARACTER)
    .replace(UNICODE_RIGHT_TO_LEFT_OVERRIDE, UNICODE_REPLACEMENT_CHARACTER);
  const newAttachment = Object.assign({}, attachment, {
    fileName: normalizedFilename,
  });

  return newAttachment;
};

exports.replaceUnicodeOrderOverrides = async attachment =>
  exports.replaceUnicodeOrderOverridesSync(attachment)

// Public API
const toVersion1 = withSchemaVersion(1, autoOrientJPEG);
const toVersion2 = withSchemaVersion(2, exports.replaceUnicodeOrderOverrides);

// UpgradeStep
exports.upgradeSchema = attachment =>
  toVersion1(attachment).then(toVersion2);
