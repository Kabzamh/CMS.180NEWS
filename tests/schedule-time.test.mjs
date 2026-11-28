// Tests browser-local date conversion without connecting to Supabase.
import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {readFile} from 'node:fs/promises';import ts from 'typescript';
if(!process.env.SCHEDULE_TEST_CHILD){
 for(const zone of ['Africa/Johannesburg','UTC','America/New_York','Australia/Lord_Howe']) {
  execFileSync(process.execPath,[new URL(import.meta.url).pathname],{env:{...process.env,TZ:zone,SCHEDULE_TEST_CHILD:'1'},stdio:'inherit'});
 }
 console.log('PASS: local scheduling time parsing, future checks, DST gaps/folds and 30-minute transitions');
}else{
 const source=await readFile(new URL('../src/lib/scheduleTime.ts',import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {parseFutureLocalTime,deviceTimeZone}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
 const now=Date.parse('2026-01-01T00:00:00Z'),run=s=>parseFutureLocalTime(s,now);
 assert.equal(deviceTimeZone(),process.env.TZ);
 for(const bad of ['2026-02-30T10:30','2026-13-01T09:00','2026-04-02T25:00','2026-04-02T09:99','2026-01-01T09:00Z','2026-01-01 09:00','garbage',''])assert.equal(run(bad).ok,false,bad);
 assert.equal(run('2001-01-01T00:00').ok,false);
 if(process.env.TZ==='Africa/Johannesburg') assert.deepEqual(run('2026-12-15T14:30'),{ok:true,iso:'2026-12-15T12:30:00.000Z'});
 if(process.env.TZ==='UTC') assert.deepEqual(run('2026-12-15T14:30'),{ok:true,iso:'2026-12-15T14:30:00.000Z'});
 if(process.env.TZ==='America/New_York'){
  assert.match(run('2026-03-08T02:30').error,/does not exist/);
  assert.match(run('2026-11-01T01:30').error,/occurs twice/);
  assert.deepEqual(run('2026-11-01T03:30'),{ok:true,iso:'2026-11-01T08:30:00.000Z'});
 }
 if(process.env.TZ==='Australia/Lord_Howe'){
  assert.match(run('2026-04-05T01:45').error,/occurs twice/);
  assert.match(run('2026-10-04T02:15').error,/does not exist/);
 }
}
