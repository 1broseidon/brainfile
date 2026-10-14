/**
 * Brainfile's update key (task-71): an update's manifest is trusted only
 * when it is signed by the private half, which lives in the repository's
 * BRAINFILE_UPDATE_KEY secret and signs each desktop release. Replacing it
 * means the apps already out there accept nothing signed with the new one.
 */
export const UPDATE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAv70Qz9D2qa7F8i7NRSO/l35DrWAd13TN7qb/7bcTFo4=
-----END PUBLIC KEY-----`;
