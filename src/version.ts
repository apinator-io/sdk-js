// Replaced at build time with package.json's version (tsup.config.ts, and
// vitest.config.ts for tests). release-please bumps package.json, so this can't
// drift the way the hard-coded "1.0.0" in the connect URL did.
declare const __SDK_VERSION__: string;

export const SDK_VERSION: string = __SDK_VERSION__;
