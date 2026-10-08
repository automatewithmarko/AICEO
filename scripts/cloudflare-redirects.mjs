import { readdir, writeFile } from 'node:fs/promises';
// Preserve Netlify's case-insensitive asset URLs without changing Vite output.
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(async e => e.isDirectory() ? files(`${dir}/${e.name}`) : `${dir}/${e.name}`))).flat();
}
const redirects = (await files('dist')).map(p => p.slice(5)).filter(p => p !== p.toLowerCase())
  .map(p => `/${encodeURI(p.toLowerCase())} /${encodeURI(p)} 301`);
await writeFile('dist/_redirects', redirects.join('\n') + '\n');
console.log(`Preserved ${redirects.length} legacy asset URLs.`);
