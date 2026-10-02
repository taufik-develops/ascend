/* Pre-push safety check: makes sure no secret is about to be committed.
   Run with:  npm run check-secrets  */
const { execSync } = require('child_process');
const fs = require('fs');

let bad = [];

// 1. Is .env tracked by git?
try {
  const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n');
  if (tracked.includes('.env')) bad.push('.env is TRACKED by git — run: git rm --cached .env');
} catch { /* not a git repo yet, fine */ }

// 2. Is .gitignore protecting it?
const ignore = fs.existsSync('.gitignore') ? fs.readFileSync('.gitignore', 'utf8') : '';
if (!/^\.env$/m.test(ignore)) bad.push('.gitignore is missing a line containing exactly: .env');

// 3. Does any committed source file contain something that looks like a real key?
const files = ['server.js', 'brand.js', 'prompts.js', 'public/app.js', 'render.yaml', 'package.json'];
const patterns = [/AIza[0-9A-Za-z_\-]{30,}/, /sk-or-v1-[0-9a-f]{20,}/, /sk-[A-Za-z0-9]{40,}/];
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const text = fs.readFileSync(f, 'utf8');
  if (patterns.some((p) => p.test(text))) bad.push(`${f} appears to contain a REAL API key`);
}

if (bad.length) {
  console.log('\n  DANGER — do not push yet:\n');
  bad.forEach((b) => console.log('   ✗ ' + b));
  console.log('');
  process.exit(1);
}
console.log('\n  SAFE — no secrets will be uploaded. Good to push.\n');
