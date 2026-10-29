'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('./prospects');
const id='77777777-7777-4777-8777-777777777777';
const form={title:'Enquiry',description:'',questions:[{id,type:'select',label:'Main goal?',required:true,options:['Strength','Fat loss']}]};
test('prospect validation preserves optional contact fields, sanitises tags and rejects invalid sales values',()=>{
 const p=P.validateProspect({first_name:' Sam ',tags:['Strength','strength',' Website '],deal_value:'750.50',close_percentage:'40'});
 assert.equal(p.first_name,'Sam');assert.equal(p.email,null);assert.equal(p.deal_value,750.5);assert.equal(p.tags.length,2);
 for(const changes of [{first_name:''},{email:'bad'},{deal_value:'NaN'},{deal_value:'0.001'},{close_percentage:101},{stage:'__proto__'}])assert.throws(()=>P.validateProspect({first_name:'Sam',...changes}));
});
test('public lead forms validate mandatory questions and choice answers and ignore injected CRM fields',()=>{
 const values={first_name:'Sam',email:'sam@example.test',answers:{[id]:'Strength'},stage:'converted',coach_id:'attacker'};
 const result=P.submission(values,form);assert.equal(result.answers[id],'Strength');assert.equal(result.stage,undefined);assert.equal(result.coach_id,undefined);
 assert.throws(()=>P.submission({...values,answers:{}},form),/Please answer/);
 assert.throws(()=>P.submission({...values,answers:{[id]:'Injected option'}},form),/listed answer/);
 assert.throws(()=>P.schema({...form,questions:[...form.questions,...form.questions]}),/each question/);
 assert.throws(()=>P.schema({...form,questions:[{...form.questions[0],type:'__proto__'}]}),/each question/);
});
test('prospect search respects archived state, tags and sales stages',()=>{
 const rows=[{first_name:'Sam',last_name:'Patel',stage:'new',tags:['Website']},{first_name:'Alex',stage:'lost',tags:[],archived_at:'2026-10-30'}];
 assert.equal(P.filtered(rows,{q:'patel'}).length,1);assert.equal(P.filtered(rows,{q:'website',stage:'new'}).length,1);assert.equal(P.filtered(rows,{archived:true}).length,1);assert.equal(P.filtered(rows,{stage:'lost'}).length,0);
});
