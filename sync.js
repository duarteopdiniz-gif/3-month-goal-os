/* =========================================================================
 * sync.js — GitHub private-repo backup sync. Pure + testable in node.
 *
 * Design: no DOM. All I/O is injected (fetchFn, store) so engine-style node
 * tests can exercise every branch. The browser wires real fetch + localStorage.
 *
 * Safety rules enforced here:
 *  - REFUSE public repos (GET /repos/{repo}.private must be true).
 *  - Token is NEVER part of the snapshot (caller passes state without it; we
 *    also defensively strip a `_token`/`gh` field if present).
 *  - Strip UI-only fields (g._th) from the snapshot.
 *  - Conflict safety via last-synced sha: if remote sha != lastSha, do NOT
 *    overwrite — return {status:"conflict"}; caller resolves.
 *  - Skip PUT when remote content is byte-identical (no empty commits).
 *  - Clear error mapping (auth / missing-file / missing-repo / conflict / network).
 * ========================================================================= */

const BACKUP_PATH = "goal-os-backup.json";

/* ---- snapshot: deterministic, sanitized JSON string of the app state ---- */
function buildSnapshot(state){
  const clone = JSON.parse(JSON.stringify(state));
  // never back up secrets or UI-only fields
  delete clone._token; delete clone.gh;
  if(clone.settings){
    delete clone.settings.ghToken;
    // volatile sync bookkeeping must NOT be part of the snapshot, or every
    // push changes the content (lastSha updates) and identical-skip never fires.
    if(clone.settings.sync){ clone.settings = { ...clone.settings }; delete clone.settings.sync; }
  }
  if(Array.isArray(clone.goals)) clone.goals.forEach(g=>{ delete g._th; });
  return JSON.stringify(clone, null, 2);
}

/* base64 that works in both browser (btoa/atob over UTF-8) and node (Buffer) */
function b64encode(str){
  if(typeof Buffer!=="undefined") return Buffer.from(str,"utf8").toString("base64");
  // browser: encode UTF-8 safely
  return btoa(unescape(encodeURIComponent(str)));
}
function b64decode(b64){
  if(typeof Buffer!=="undefined") return Buffer.from(b64,"base64").toString("utf8");
  return decodeURIComponent(escape(atob(b64)));
}

/* ---- error mapping → {kind, message, retryable} ---- */
function mapError(status, context){
  if(status===401||status===403) return { kind:"auth", message:"GitHub rejected the token (check it has Contents: read & write on this repo).", retryable:false };
  if(status===404) return context==="repo"
    ? { kind:"no-repo", message:"Repository not found (check owner/name and that the token can see it).", retryable:false }
    : { kind:"no-file", message:"No backup file yet.", retryable:false };
  if(status===409||status===422) return { kind:"conflict", message:"Remote changed since last sync.", retryable:false };
  if(status>=500) return { kind:"server", message:"GitHub server error — will retry later.", retryable:true };
  return { kind:"http", message:"Unexpected response ("+status+").", retryable:false };
}

/* ---- repo validation: must exist AND be private ---- */
async function checkRepoPrivate(fetchFn, repo, token){
  let res;
  try{ res = await ghFetch(fetchFn, `https://api.github.com/repos/${repo}`, token); }
  catch(e){ return { ok:false, kind:"network", message:"Network error reaching GitHub.", retryable:true }; }
  if(!res.ok) return { ok:false, ...mapError(res.status, "repo") };
  const data = await res.json();
  if(data.private!==true) return { ok:false, kind:"public", message:"That repo is PUBLIC. Backups contain personal reflections — use a private repo.", retryable:false };
  return { ok:true };
}

/* ---- GET current backup file: returns {exists, sha, content} ---- */
async function getRemote(fetchFn, repo, token){
  let res;
  try{ res = await ghFetch(fetchFn, `https://api.github.com/repos/${repo}/contents/${BACKUP_PATH}`, token); }
  catch(e){ return { ok:false, kind:"network", message:"Network error.", retryable:true }; }
  if(res.status===404) return { ok:true, exists:false, sha:null, content:null };
  if(!res.ok) return { ok:false, ...mapError(res.status, "file") };
  const data = await res.json();
  return { ok:true, exists:true, sha:data.sha, content: data.content? b64decode(data.content.replace(/\n/g,"")) : null };
}

/* ---- PUT a snapshot. Conflict-safe. ----
 * lastSha = the sha we believe is current (from the last successful sync).
 * Returns one of:
 *   {status:"ok", sha}            — pushed (or skipped-identical with same sha)
 *   {status:"skipped", sha}       — remote already identical, no commit made
 *   {status:"conflict", remoteSha, remoteContent} — remote changed; caller resolves
 *   {status:"error", error:{kind,message,retryable}}
 */
async function push(fetchFn, repo, token, snapshot, lastSha){
  const remote = await getRemote(fetchFn, repo, token);
  if(!remote.ok) return { status:"error", error:{ kind:remote.kind, message:remote.message, retryable:remote.retryable } };

  // Conflict: a backup exists whose sha we didn't produce (another device, or
  // first connect to a repo that already has a backup).
  if(remote.exists && lastSha!=null && remote.sha!==lastSha){
    return { status:"conflict", remoteSha:remote.sha, remoteContent:remote.content };
  }
  // First-ever connect to a repo that ALREADY has a backup (lastSha null) → also a conflict.
  if(remote.exists && lastSha==null){
    return { status:"conflict", remoteSha:remote.sha, remoteContent:remote.content };
  }
  // Identical content → skip (no empty commit).
  if(remote.exists && remote.content!=null && remote.content===snapshot){
    return { status:"skipped", sha:remote.sha };
  }

  const body = { message:`backup ${new Date().toISOString()}`, content: b64encode(snapshot) };
  if(remote.exists) body.sha = remote.sha;
  let res;
  try{
    res = await ghFetch(fetchFn, `https://api.github.com/repos/${repo}/contents/${BACKUP_PATH}`, token, {
      method:"PUT", body: JSON.stringify(body)
    });
  }catch(e){ return { status:"error", error:{ kind:"network", message:"Network error during push.", retryable:true } }; }
  if(res.status===409||res.status===422) return { status:"conflict", remoteSha:remote.sha, remoteContent:remote.content };
  if(!res.ok) return { status:"error", error: mapError(res.status, "file") };
  const data = await res.json();
  return { status:"ok", sha: data.content? data.content.sha : null };
}

/* ---- common fetch wrapper (auth + api headers) ---- */
function ghFetch(fetchFn, url, token, opts={}){
  return fetchFn(url, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opts.body? {"Content-Type":"application/json"} : {})
    }
  });
}

/* =========================================================================
 * ICS — repeating weekly reminder (RFC 5545). Pure/testable.
 *   dayOfWeek: 0=Sun..6=Sat ; time "HH:MM" (floating local) ; untilDate "YYYY-MM-DD"
 * Produces a VEVENT with weekly RRULE until the period end + a VALARM at start.
 * ========================================================================= */
function icsEscape(t){ return String(t).replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\n/g,"\\n"); }
/* fold lines at 75 OCTETS (UTF-8), continuation lines start with a space */
function icsFold(line){
  const bytes=Buffer!==undefined? null:null; // runtime-agnostic below
  const enc = s=> (typeof TextEncoder!=="undefined") ? new TextEncoder().encode(s).length : Buffer.byteLength(s,"utf8");
  if(enc(line)<=75) return line;
  const out=[]; let cur=""; let curBytes=0; let first=true;
  for(const ch of line){
    const chBytes = (typeof TextEncoder!=="undefined")? new TextEncoder().encode(ch).length : Buffer.byteLength(ch,"utf8");
    const limit = first? 75 : 74; // continuation lines reserve 1 octet for leading space
    if(curBytes+chBytes>limit){ out.push((first?"":" ")+cur); first=false; cur=ch; curBytes=chBytes; }
    else { cur+=ch; curBytes+=chBytes; }
  }
  out.push((first?"":" ")+cur);
  return out.join("\r\n");
}
/* first date on/after a start date that falls on dayOfWeek (0=Sun) */
function firstOccurrence(startISO, dayOfWeek){
  const [y,m,d]=startISO.split("-").map(Number); const dt=new Date(y,m-1,d);
  const diff=(dayOfWeek - dt.getDay() + 7)%7; dt.setDate(dt.getDate()+diff);
  const pad=n=>String(n).padStart(2,"0");
  return `${dt.getFullYear()}${pad(dt.getMonth()+1)}${pad(dt.getDate())}`;
}
function buildICS({ startISO, untilISO, dayOfWeek, time, appUrl }){
  const [hh,mm]=time.split(":"); const dateStamp=firstOccurrence(startISO, dayOfWeek);
  const dtstart=`${dateStamp}T${hh}${mm}00`;
  const [uy,um,ud]=untilISO.split("-"); const until=`${uy}${um}${ud}T235959`;
  const uid=`goalreview-${dateStamp}-${hh}${mm}@goal-os`;
  const now=new Date(); const pad=n=>String(n).padStart(2,"0");
  const dtstamp=`${now.getUTCFullYear()}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const desc=icsEscape(`Open your Goal Review and complete this week's check-in. ${appUrl||""}`);
  const lines=[
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Goal Review//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `RRULE:FREQ=WEEKLY;UNTIL=${until}`,
    icsFold(`SUMMARY:${icsEscape("Weekly goal review")}`),
    icsFold(`DESCRIPTION:${desc}`),
    "BEGIN:VALARM","ACTION:DISPLAY",icsFold(`DESCRIPTION:${icsEscape("Weekly goal review")}`),"TRIGGER:PT0M","END:VALARM",
    "END:VEVENT","END:VCALENDAR"
  ];
  return lines.join("\r\n");
}

const Sync = { BACKUP_PATH, buildSnapshot, b64encode, b64decode, mapError, checkRepoPrivate, getRemote, push, ghFetch, icsEscape, icsFold, firstOccurrence, buildICS };
if (typeof module !== "undefined") module.exports = Sync;
if (typeof window !== "undefined") window.Sync = Sync;
