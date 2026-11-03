import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [previousArg, currentArg, outputArg] = process.argv.slice(2);
if (!previousArg || !currentArg || !outputArg)
  throw new Error('Provide previous, current and empty output asset directories.');
const previous = path.resolve(previousArg);
const current = path.resolve(currentArg);
const output = path.resolve(outputArg);
if (
  [previous, current].some(
    (source) => output === source || output.startsWith(`${source}${path.sep}`),
  )
) {
  throw new Error('Asset output must be separate from its inputs.');
}
if (fs.existsSync(output) && fs.readdirSync(output).length > 0)
  throw new Error('Asset output must be empty.');
const manifestName = '.retained-assets.json';
const isAssetName = (name) => typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name);
const list = (directory) =>
  fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.name === manifestName) return [];
      if (!entry.isFile() || !isAssetName(entry.name))
        throw new Error('Only flat regular build assets are allowed.');
      return [entry.name];
    })
    .sort();
const currentFiles = list(current);
const previousFiles = list(previous);
if (currentFiles.length === 0) throw new Error('Current build must contain assets.');
let previousManifest = { version: 1, current: previousFiles, retained: {} };
const manifestPath = path.join(previous, manifestName);
if (fs.existsSync(manifestPath)) {
  if (!fs.lstatSync(manifestPath).isFile()) throw new Error('Invalid previous asset manifest.');
  previousManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (
    previousManifest?.version !== 1 ||
    !Array.isArray(previousManifest.current) ||
    !previousManifest.current.every(isAssetName) ||
    !previousManifest.retained ||
    typeof previousManifest.retained !== 'object' ||
    Array.isArray(previousManifest.retained) ||
    !Object.entries(previousManifest.retained).every(
      ([name, expiry]) => isAssetName(name) && Number.isSafeInteger(expiry) && expiry > 0,
    )
  ) {
    throw new Error('Invalid previous asset manifest.');
  }
}
const now = Date.now();
const retained = Object.fromEntries(
  Object.entries(previousManifest.retained).filter(([, expiry]) => expiry > now),
);
for (const name of previousManifest.current) retained[name] = now + 30 * 24 * 60 * 60 * 1000;
for (const name of currentFiles) delete retained[name];
const previousSet = new Set(previousFiles);
for (const name of Object.keys(retained)) {
  if (!previousSet.has(name))
    throw new Error('A retained asset is missing from the previous image.');
}
const digest = (filename) =>
  crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
for (const name of currentFiles) {
  if (
    previousSet.has(name) &&
    digest(path.join(previous, name)) !== digest(path.join(current, name))
  ) {
    throw new Error(`Immutable asset collision: ${name}`);
  }
}
fs.mkdirSync(output, { recursive: true });
for (const name of Object.keys(retained).sort())
  fs.copyFileSync(path.join(previous, name), path.join(output, name));
for (const name of currentFiles) fs.copyFileSync(path.join(current, name), path.join(output, name));
fs.writeFileSync(
  path.join(output, manifestName),
  JSON.stringify({ version: 1, current: currentFiles, retained }, null, 2) + '\n',
);
console.log(
  JSON.stringify({ current: currentFiles.length, retained: Object.keys(retained).length }),
);
