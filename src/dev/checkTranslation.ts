/* eslint-disable no-console */
import { readFileSync, writeFileSync } from 'fs';

const translationKeys = new Set<string>();

const packageJson = readFileSync('package.json', 'utf-8');
const placeholderRegex = /%(.*?)%/g;
const matches = packageJson.matchAll(placeholderRegex);
for (const match of matches) {
  translationKeys.add(match[1]);
}

function checkPackageTranslationCompleteness(file: string) {
  const errors: string[] = [];
  const packageNlsJson = JSON.parse(readFileSync(file, 'utf-8'));
  for (const key of translationKeys.keys()) {
    if (!packageNlsJson.hasOwnProperty(key)) {
      errors.push(`Key "${key}" is missing in ${file}`);
    }
  }
  for (const key in packageNlsJson) {
    if (!translationKeys.has(key)) {
      errors.push(`Key "${key}" is not used in package.json`);
    }
  }
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
}

function checkL10nTranslationCompleteness() {
  const errors: string[] = [];
  const bundleL10n = JSON.parse(readFileSync('l10n/bundle.l10n.json', 'utf-8'));
  const bundleL10nZhcn = JSON.parse(readFileSync('l10n/bundle.l10n.zh-CN.json', 'utf-8'));

  const sortedKeys = Object.keys(bundleL10n);
  const sortedBundleL10nZhcn: { [key: string]: unknown } = {};
  for (const key of sortedKeys) {
    if (!bundleL10nZhcn[key]) {
      errors.push(`Key "${key}" is not implemented in l10n/bundle.l10n.zh-CN.json`);
      sortedBundleL10nZhcn[key] = '';
    } else {
      sortedBundleL10nZhcn[key] = bundleL10nZhcn[key];
    }
  }
  for (const key in bundleL10nZhcn) {
    if (bundleL10n[key] === undefined) {
      console.warn(`Key "${key}" is not used in l10n/bundle.l10n.json, removing it`);
    }
  }
  writeFileSync('l10n/bundle.l10n.zh-CN.json', JSON.stringify(sortedBundleL10nZhcn, null, 2).replace(/\n/g, '\r\n'));
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
}

checkPackageTranslationCompleteness('package.nls.json');
checkPackageTranslationCompleteness('package.nls.zh-CN.json');
checkL10nTranslationCompleteness();
