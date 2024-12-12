import { readFileSync, writeFileSync } from 'fs';

const fileContent = readFileSync('package.json', 'utf-8');
const regex = /"version": "(\d+)\.(\d+)\.(\d+)",/;
const match = fileContent.match(regex);
if (!match) {
  throw new Error('版本号格式不正确');
}
const patchVersion = parseInt(match[3]) + 1;
const newVersion = `"version": "${match[1]}.${match[2]}.${patchVersion}",`;
writeFileSync('package.json', fileContent.replace(regex, newVersion));
