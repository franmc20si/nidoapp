const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'dist', 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const inject = [
  '  <link rel="manifest" href="/manifest.json" />',
  '  <meta name="mobile-web-app-capable" content="yes" />',
  '  <meta name="apple-mobile-web-app-capable" content="yes" />',
  '  <meta name="apple-mobile-web-app-title" content="Nido" />',
  '  <link rel="icon" type="image/png" href="/nido_png.png" />',
  '  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
].join('\n');

html = html.replace('<link rel="icon" href="/favicon.ico" />', '');
html = html.replace('</head>', inject + '\n</head>');

fs.writeFileSync(htmlPath, html);
console.log('Head injected OK');
