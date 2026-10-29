const { test } = require('node:test');
const assert = require('node:assert/strict');
const T = require('./training.js');
const catalog = [{ id:'bench', name:'Bench', primary:['chest','triceps'] },{id:'squat',name:'Squat',primary:['quads']}];
const log = (day,kg,type) => ({day,session_name:'Push',exercises:[{name:'Bench',sets:[{kg,reps:10,set_type:type}]}]});
test('new seven-day programs retain rest days and all per-set prescriptions',()=>{
  const draft=T.newProgram('Phase 2','2026-10-29',[1]);
  draft.days[0].exercises=[T.exercise({exercise_id:'bench',name:'Bench',primary:['chest']})];
  draft.days[0].exercises[0].prescriptions=[{weight_kg:80,reps_min:6,reps_max:8,tempo:'3-1-X-0',rir:2,set_type:'Top set',rest_seconds:150,group:'A1'}];
  const rows=T.payload(draft,'client');
  assert.equal(rows.length,7);assert.equal(rows.filter(x=>x.is_rest_day).length,6);
  assert.equal(rows[0].exercises[0].prescriptions[0].tempo,'3-1-X-0');
  assert.equal(rows[0].exercises[0].sets,1);assert.equal(rows[0].exercises[0].reps_max,8);
  assert.equal(rows[0].client_id,'client');assert.equal(rows[0].exercises[0].exercise_id,'bench');
});
test('set types include every requested option and AMRAP',()=>{
  for(const s of ['Warmup','Drop set','Superset','Giant set','Rest pause','Failure','Widowmaker','AMRAP','Top set','Back off set'])assert.ok(T.SET_TYPES.includes(s));
});
test('existing eight-day plans and legacy prescriptions are preserved',()=>{
  const rows=Array.from({length:8},(_,i)=>({program_name:'Legacy',program_start_date:'2026-01-01',cycle_day:i+1,is_rest_day:i!==0,session_name:'Push',exercises:i===0?[{name:'Bench',sets:2,reps_min:8,reps_max:10,rir:false,rest_seconds_min:120}]:[]}));
  const d=T.program(rows,'2026-01-01');const output=T.payload(d,'client');
  assert.equal(output.length,8);assert.equal(output[0].exercises[0].prescriptions.length,2);
  assert.equal(output[0].exercises[0].prescriptions[0].rir,null);
  d.days[0].exercises[0].name='Changed';assert.equal(rows[0].exercises[0].name,'Bench');
});
test('invalid set ranges, numeric data and tempos cannot be saved',()=>{
  for(const invalid of [{reps_min:12,reps_max:8},{weight_kg:'no'},{rest_seconds:-1},{rir:11},{tempo:'301'},{set_type:'Made up'},{reps_min:1.5}]){
    const d=T.newProgram('Program','2026-10-29',[1]);d.days[0].exercises=[T.exercise({name:'Bench',sets:1})];
    Object.assign(d.days[0].exercises[0].prescriptions[0],invalid);assert.throws(()=>T.payload(d,'client'));
  }
});
test('warmups excluded, primary splits preserve total sets and volume',()=>{
  const logs=[log('2026-10-01',60),log('2026-10-08',65),log('2026-10-09',100,'Warmup')];
  const r=T.analyse(logs,[],catalog,'2026-10-01','2026-10-14');
  assert.equal(r.sessions.length,2);assert.equal(r.exercises[0].sets,2);
  assert.equal(r.parts.reduce((n,p)=>n+p.total,0),2);
  assert.equal(r.parts.find(p=>p.id==='chest').total,1);
  assert.equal(r.weeks.reduce((s,w)=>s+Object.values(w.volume).reduce((a,b)=>a+b,0),0),1250);
  assert.equal(r.exercises[0].status,'Progressing');
  assert.ok(r.change>8&&r.change<9);
});
test('legacy names and newer IDs merge into one exercise history',()=>{
  const logs=[log('2026-10-01',60),log('2026-10-08',65)];logs[1].exercises[0].exercise_id='bench';
  assert.equal(T.analyse(logs,[],catalog,'2026-10-01','2026-10-14').exercises.length,1);
});
test('bodyweight, zero and high-rep sets never fabricate a weighted strength trend',()=>{
  const logs=[log('2026-10-01',null),log('2026-10-08',0),log('2026-10-09',20)];logs[2].exercises[0].sets[0].reps=40;
  const r=T.analyse(logs,[],catalog,'2026-10-01','2026-10-14');assert.equal(r.change,null);assert.equal(r.exercises[0].status,'Insufficient data');assert.equal(r.exercises[0].sets,3);
});
test('recorded bests retain older history but selected range stays bounded',()=>{
  const r=T.analyse([log('2026-08-01',90),log('2026-10-01',60),log('2026-10-08',65),log('2026-11-01',100)],[],catalog,'2026-10-01','2026-10-14');
  assert.equal(r.exercises[0].history.length,2);assert.equal(r.exercises[0].bests[0].day,'2026-08-01');
  assert.equal(r.exercises[0].newBest,false);assert.equal(r.sessions.length,2);
});
test('single readings and empty data retain empty body-part tiles',()=>{
  const empty=T.analyse([],[],[],'2026-10-01','2026-10-14');assert.equal(empty.parts.length,15);assert.equal(empty.change,null);
  const one=T.analyse([log('2026-10-01',60)],[],catalog,'2026-10-01','2026-10-14');assert.equal(one.change,null);
});
