// Throw bad input at every API route, signed out and signed in; nothing should return a 500.
const B = process.env.BASE_URL || 'http://localhost:3000', st = Date.now().toString(36);
const routes = `/api/account /api/account/delete /api/account/password /api/account/signout-all /api/area /api/auth/forgot /api/auth/login /api/auth/resend /api/auth/reset /api/auth/signup /api/auth/verify /api/campaigns /api/campaigns/[slug] /api/campaigns/[slug]/coalition /api/campaigns/[slug]/delete /api/campaigns/[slug]/invites /api/campaigns/[slug]/leave-coalition /api/campaigns/[slug]/matches /api/campaigns/[slug]/pledges /api/campaigns/[slug]/pool-requests /api/campaigns/[slug]/settings /api/coalitions/[id]/application /api/coalitions/[id]/application/pdf /api/coalitions/[id]/approve /api/coalitions/[id]/chat /api/coalitions/[id]/donor /api/coalitions/[id]/donor-sign /api/coalitions/[id]/leave /api/coalitions/[id]/payment /api/coalitions/[id]/submit /api/coalitions/[id]/treasury-mock /api/deck /api/demo/pledge-map /api/join/[code] /api/map/coverage /api/match /api/messages /api/messages/[id] /api/messages/unread /api/nonprofits /api/nonprofits/[id]/remove /api/nonprofits/lookup /api/nonprofits/search /api/pool-requests/[id] /api/profile /api/search /api/swipes /api/users/[id]/block`.split(' ');
const params = { slug: ['nope', 'demo-amenia-kids-fund', "x'; drop table--"], id: ['not-a-uuid', '00000000-0000-0000-0000-000000000000', 'de000000-0000-4000-d000-000000000001'], code: ['zzz'] };
const bodies = [undefined, '{', '[]', 'null', JSON.stringify({ amountCents: 'abc', body: 'x'.repeat(5000), zips: 'nope', ein: '<script>', to: '../../', name: '', email: 'a', password: 1, toSlug: null, action: 'boom', confirm: true, documentId: 'x', nonprofitId: 'x', recognition: 'yes', method: 'x', amount_cents: -5 }),
  JSON.stringify({ zips: ['11234'], name: 'ab', goalType: 'per_child', goalPerChildCents: 1e18 }), JSON.stringify({ q: 'a'.repeat(1000) })];
let cookie = '';
const call = async (method, path, body) => {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', cookie, 'sec-fetch-site': 'same-origin' }, body });
  const s = r.headers.get('set-cookie'); if (s && s.startsWith('hs_session=') && !s.includes('hs_session=;')) cookie = s.split(';')[0];
  return r.status;
};
const bad = [];
for (const who of ['anon', 'user']) {
  if (who === 'user') {
    const r = await fetch(B + '/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }, body: JSON.stringify({ email: `fz-${st}@example.com`, name: 'Fuzz', password: 'correct horse battery' }) });
    cookie = r.headers.get('set-cookie').split(';')[0];
    const d = await r.json(); await call('POST', '/api/auth/verify', JSON.stringify({ token: new URL(d.verification.devLink, 'http://x').searchParams.get('token') }));
  }
  for (const route of routes) {
    if (who === 'user' && /delete|signout-all|logout|password/.test(route)) continue;   // keep the session
    const variants = [route];
    for (const [k, vs] of Object.entries(params)) if (route.includes(`[${k}]`)) { variants.length = 0; for (const v of vs) variants.push(route.replace(`[${k}]`, encodeURIComponent(v))); }
    for (const u of variants) {
      for (const q of ['', '?q=%27%22<x>&zips=abc&ein=1&after=-1&state=ZZ&limit=99999']) {
        const s = await call('GET', u + q); if (s >= 500) bad.push(['GET', u + q, s]);
      }
      for (const b of bodies) { const s = await call('POST', u, b); if (s >= 500) bad.push(['POST', u, s, (b || '').slice(0, 40)]); }
    }
  }
}
console.log(bad.length ? bad.map((x) => x.join(' ')).join('\n') : 'no 500s');
if (bad.length) process.exitCode = 1;
