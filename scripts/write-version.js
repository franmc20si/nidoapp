// Escribe dist/version.json con el mismo id que se incrustó en el bundle
// (EXPO_PUBLIC_BUILD_ID). La app lo consulta para saber si hay versión nueva.
const fs = require('fs');
const path = require('path');

const version = process.env.EXPO_PUBLIC_BUILD_ID;
if (!version) {
  console.warn('write-version: sin EXPO_PUBLIC_BUILD_ID, no se escribe version.json');
  process.exit(0);
}
fs.writeFileSync(
  path.join(__dirname, '..', 'dist', 'version.json'),
  JSON.stringify({ version }),
);
console.log('version.json ->', version);
