/* Tests for sync.js — mock fetch, no network. */
const S = require("./sync.js");
let pass=0, fail=0;
const ok=(n,c,x="")=>{ c?(pass++,console.log("  ✓",n)):(fail++,console.log("  ✗",n,x)); };

/* mock fetch factory: routes by URL + method */
function mockFetch(routes){
  return async (url, opts={})=>{
    const method=opts.method||"GET";
    for(const r of routes){
      if(r.match(url, method, opts)) return r.respond(url, method, opts);
    }
    throw new Error("no route for "+method+" "+url);
  };
}
function res(status, bodyObj){ return { ok: status>=200&&status<300, status, json: async()=>bodyObj }; }

(async()=>{
  console.log("[snapshot] strips _th, token, is deterministic JSON");
  const state={ _token:"SECRET", settings:{ghToken:"SECRET2", day:"Sun"}, goals:[{id:"g1",title:"x",_th:{green:85}}], entries:[], _v:2 };
  const snap=S.buildSnapshot(state);
  ok("no _token in snapshot", !snap.includes("SECRET"), snap);
  ok("no ghToken in snapshot", !snap.includes("SECRET2"));
  ok("no _th in snapshot", !snap.includes("_th"));
  ok("keeps real data", snap.includes("\"settings\"") && snap.includes("\"day\""));

  console.log("\n[base64] round-trips UTF-8");
  const t="réflexion ✓ 日本"; ok("b64 round trip", S.b64decode(S.b64encode(t))===t);

  console.log("\n[checkRepoPrivate] refuses public, accepts private, maps 404");
  let f=mockFetch([{match:u=>u.endsWith("/repos/me/r"),respond:()=>res(200,{private:false})}]);
  let r=await S.checkRepoPrivate(f,"me/r","tok"); ok("public repo refused", r.ok===false && r.kind==="public", JSON.stringify(r));
  f=mockFetch([{match:u=>u.endsWith("/repos/me/r"),respond:()=>res(200,{private:true})}]);
  r=await S.checkRepoPrivate(f,"me/r","tok"); ok("private repo ok", r.ok===true, JSON.stringify(r));
  f=mockFetch([{match:u=>u.endsWith("/repos/me/r"),respond:()=>res(404,{})}]);
  r=await S.checkRepoPrivate(f,"me/r","tok"); ok("missing repo → no-repo", r.ok===false && r.kind==="no-repo", JSON.stringify(r));
  f=mockFetch([{match:u=>u.endsWith("/repos/me/r"),respond:()=>res(401,{})}]);
  r=await S.checkRepoPrivate(f,"me/r","tok"); ok("401 → auth", r.ok===false && r.kind==="auth", JSON.stringify(r));

  console.log("\n[push] first push (no remote file) → PUT, returns new sha");
  let put=null;
  f=mockFetch([
    {match:(u,m)=>u.includes("/contents/")&&m==="GET",respond:()=>res(404,{})},
    {match:(u,m)=>u.includes("/contents/")&&m==="PUT",respond:(u,m,o)=>{ put=JSON.parse(o.body); return res(201,{content:{sha:"sha1"}}); }},
  ]);
  r=await S.push(f,"me/r","tok","SNAP", null);
  ok("first push ok", r.status==="ok" && r.sha==="sha1", JSON.stringify(r));
  ok("PUT body base64 of snapshot", put && S.b64decode(put.content)==="SNAP");
  ok("PUT without sha (create)", put && put.sha===undefined);

  console.log("\n[push] identical remote content → skipped (no commit)");
  f=mockFetch([{match:(u,m)=>u.includes("/contents/")&&m==="GET",respond:()=>res(200,{sha:"shaX",content:S.b64encode("SNAP")})}]);
  r=await S.push(f,"me/r","tok","SNAP","shaX");
  ok("identical → skipped", r.status==="skipped" && r.sha==="shaX", JSON.stringify(r));

  console.log("\n[push] update when content differs & sha matches lastSha → PUT with sha");
  put=null;
  f=mockFetch([
    {match:(u,m)=>u.includes("/contents/")&&m==="GET",respond:()=>res(200,{sha:"shaX",content:S.b64encode("OLD")})},
    {match:(u,m)=>u.includes("/contents/")&&m==="PUT",respond:(u,m,o)=>{ put=JSON.parse(o.body); return res(200,{content:{sha:"shaY"}}); }},
  ]);
  r=await S.push(f,"me/r","tok","NEW","shaX");
  ok("update ok, new sha", r.status==="ok" && r.sha==="shaY", JSON.stringify(r));
  ok("PUT included prior sha", put && put.sha==="shaX");

  console.log("\n[push] CONFLICT: remote sha != lastSha → no overwrite");
  f=mockFetch([{match:(u,m)=>u.includes("/contents/")&&m==="GET",respond:()=>res(200,{sha:"REMOTE",content:S.b64encode("THEIRS")})}]);
  r=await S.push(f,"me/r","tok","MINE","shaOLD");
  ok("sha mismatch → conflict", r.status==="conflict" && r.remoteSha==="REMOTE" && r.remoteContent==="THEIRS", JSON.stringify(r));

  console.log("\n[push] CONFLICT: first connect (lastSha null) but remote already has a backup");
  f=mockFetch([{match:(u,m)=>u.includes("/contents/")&&m==="GET",respond:()=>res(200,{sha:"REMOTE",content:S.b64encode("THEIRS")})}]);
  r=await S.push(f,"me/r","tok","MINE",null);
  ok("first-connect existing → conflict", r.status==="conflict" && r.remoteSha==="REMOTE", JSON.stringify(r));

  console.log("\n[push] 422 on PUT → conflict (not a hard error)");
  f=mockFetch([
    {match:(u,m)=>u.includes("/contents/")&&m==="GET",respond:()=>res(200,{sha:"shaX",content:S.b64encode("OLD")})},
    {match:(u,m)=>u.includes("/contents/")&&m==="PUT",respond:()=>res(422,{})},
  ]);
  r=await S.push(f,"me/r","tok","NEW","shaX");
  ok("422 → conflict", r.status==="conflict", JSON.stringify(r));

  console.log("\n[push] network error on GET → retryable error");
  f=async()=>{ throw new Error("net"); };
  r=await S.push(f,"me/r","tok","X",null);
  ok("network → error retryable", r.status==="error" && r.error.kind==="network" && r.error.retryable===true, JSON.stringify(r));

  console.log("\n[getRemote] 404 → exists:false (not an error)");
  f=mockFetch([{match:(u,m)=>u.includes("/contents/")&&m==="GET",respond:()=>res(404,{})}]);
  r=await S.getRemote(f,"me/r","tok"); ok("missing file → exists:false", r.ok===true && r.exists===false, JSON.stringify(r));

  console.log("\n[ics] escaping, folding, RRULE");
  ok("escape ; , \\ newline", S.icsEscape("a;b,c\\d\ne")==="a\\;b\\,c\\\\d\\ne");
  const longText="DESCRIPTION:"+"x".repeat(120);
  const folded=S.icsFold(longText);
  ok("fold produces CRLF + leading space", folded.includes("\r\n ") && folded.split("\r\n").every(l=>Buffer.byteLength(l,"utf8")<=75), JSON.stringify(folded.split("\r\n").map(l=>Buffer.byteLength(l))));
  const ics=S.buildICS({ startISO:"2026-10-08", untilISO:"2026-12-13", dayOfWeek:0, time:"18:00", appUrl:"https://x/?tab=week" });
  ok("has VCALENDAR + VEVENT + VALARM", /BEGIN:VCALENDAR/.test(ics)&&/BEGIN:VEVENT/.test(ics)&&/BEGIN:VALARM/.test(ics));
  ok("weekly RRULE until period end", /RRULE:FREQ=WEEKLY;UNTIL=20261213T235959/.test(ics), ics.split("\r\n").find(l=>l.startsWith("RRULE")));
  ok("DTSTART is first Sunday on/after 8 Oct = 11 Oct at 1800", /DTSTART:20261011T180000/.test(ics), ics.split("\r\n").find(l=>l.startsWith("DTSTART")));
  ok("CRLF line endings", ics.includes("\r\n"));

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail?1:0);
})();
