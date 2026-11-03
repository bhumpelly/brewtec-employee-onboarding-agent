// Node: Read login  (Workflow 5, JavaScript)
// Decides if the browser login box must be shown.
// Basic Auth: the browser remembers the last typed login and sends it again on every request,
// also when the user clicks "Employee login" on the public page later.
// After a wrong login, "Wrong login" sets a short cookie bt_bad=<h> (15 minutes). h is a short
// hash of that wrong login, it cannot be turned back into the password.
// When the browser sends the same old wrong login again, we show the login box instead of
// checking it again. So the user can type a new login, and one wrong try is counted only once.
const j = $input.first().json;
const auth = String(j.headers?.authorization || '');
const retry = String(j.query?.retry || '');
const cookie = String(j.headers?.cookie || '');
const bad = (cookie.match(/(?:^|;\s*)bt_bad=([0-9a-f]{8})/) || [])[1] || '';
const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
const h = auth ? fnv(auth) : '';
return [{ json: { auth, h, ask_again: !auth || retry === h || bad === h } }];
