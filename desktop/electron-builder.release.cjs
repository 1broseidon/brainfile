/**
 * The release build (task-72): package.json's `build`, plus what a release
 * needs. Zips (what the app updates from) and disk images (what a person
 * downloads), named by version and arch. Signed with the Developer ID and
 * notarized when the workflow has the Apple secrets (CSC_LINK, APPLE_API_*);
 * ad-hoc otherwise, as `npm run package` is.
 */
const base = require('./package.json').build;

const signed = !!process.env.CSC_LINK;

module.exports = {
  ...base,
  artifactName: 'Brainfile-${version}-${arch}-mac.${ext}',
  mac: {
    ...base.mac,
    target: ['zip', 'dmg'],
    // Without an identity electron-builder looks for the certificate CSC_LINK names; "-" signs ad hoc.
    identity: signed ? undefined : '-',
    hardenedRuntime: signed,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize: signed && !!process.env.APPLE_API_KEY,
  },
  dmg: { title: 'Brainfile ${version}' },
};
