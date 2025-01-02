import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const fileContent = readFileSync('package.json', 'utf-8');
const version = JSON.parse(fileContent).version as string;
execSync('git add .');
execSync(`git commit -m "v${version}"`);
execSync('git push');
