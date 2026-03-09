const fs = require('fs');
const path = require('path');

function readVersionTs() {
  const p = path.resolve(process.cwd(), 'version.ts');
  const s = fs.readFileSync(p, 'utf8');
  const m = s.match(/export const VERSION = ['"]([\d.]+)['"];?/);
  return m ? m[1] : null;
}

function readPrd() {
  const p = path.resolve(process.cwd(), 'PRD.md');
  const s = fs.readFileSync(p, 'utf8');
  const m = s.match(/版本：([\d.]+)/);
  return m ? m[1] : null;
}

const v1 = readVersionTs();
const v2 = readPrd();
if (!v1) { console.error('Cannot find VERSION in version.ts'); process.exit(2); }
if (!v2) { console.error('Cannot find version in PRD.md'); process.exit(2); }
if (v1 !== v2) {
  console.error(`Version mismatch: version.ts=${v1} PRD.md=${v2}`);
  process.exit(3);
}
console.log(`OK: version ${v1} matches PRD.md`);
process.exit(0);

