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
test('lead form toolkit keeps rich question settings and validates public answers',()=>{
 const uid=n=>`77777777-7777-4777-8777-${String(n).padStart(12,'0')}`;
 const qs=[
  {...P.newQuestion('scale',uid(1)),label:'Energy today?',required:true,min:1,max:5},
  {...P.newQuestion('grid',uid(2)),label:'Training preferences',required:true,rows:['Monday','Tuesday'],columns:['Morning','Evening']},
  {...P.newQuestion('signature',uid(3)),label:'Consent',required:true,statement:'I agree to be contacted.'},
  {...P.newQuestion('info',uid(4)),label:'Next steps',text:'We will be in touch.'}
 ];
 const schema=P.schema({title:'Coaching enquiry',description:'',questions:qs});
 assert.equal(schema.questions[1].rows[0],'Monday');
 assert.equal(schema.questions[2].statement,'I agree to be contacted.');
 const answers={[uid(1)]:'4',[uid(2)]:{Monday:'Morning',Tuesday:'Evening'},[uid(3)]:{name:'Sam Patel',agreed:true}};
 const contact={first_name:'Sam',email:'sam@example.test',answers};
 assert.deepEqual(P.submission(contact,schema).answers[uid(2)],answers[uid(2)]);
 assert.throws(()=>P.submission({...contact,answers:{...answers,[uid(1)]:'9'}},schema),/valid number/);
 assert.throws(()=>P.submission({...contact,answers:{...answers,[uid(2)]:{Monday:'Not listed',Tuesday:'Evening'}}},schema),/grid/);
 assert.throws(()=>P.submission({...contact,answers:{...answers,[uid(3)]:{name:'Sam Patel',agreed:false}}},schema),/agree to sign/);
});
test('lead form choice limits, terms and dates reject unlisted or out-of-range submissions',()=>{
 const ids=['1','2','3'].map(n=>`88888888-8888-4888-8888-${n.padStart(12,'0')}`);
 const form=P.schema({title:'Enquiry',questions:[
  {...P.newQuestion('multiselect',ids[0]),label:'Goals',required:true,options:['Strength','Fitness','Mobility'],minPicks:2,maxPicks:2},
  {...P.newQuestion('date',ids[1]),label:'Preferred start',required:true,allowed:'future'},
  {...P.newQuestion('terms',ids[2]),label:'Privacy',text:'Contact me about coaching.',agreeLabel:'I agree'}
 ]});
 const good={first_name:'Sam',email:'sam@example.test',answers:{[ids[0]]:['Strength','Fitness'],[ids[1]]:'2099-01-01',[ids[2]]:'I agree'}};
 assert.equal(P.submission(good,form).answers[ids[2]],'I agree');
 assert.throws(()=>P.submission({...good,answers:{...good.answers,[ids[0]]:['Strength']}},form),/number of choices/);
 assert.throws(()=>P.submission({...good,answers:{...good.answers,[ids[1]]:'2020-01-01'}},form),/allowed date/);
 assert.throws(()=>P.submission({...good,answers:{...good.answers,[ids[2]]:'No'}},form),/Agree to the terms/);
});
test('public lead uploads accept only permitted private-file metadata',()=>{
 const fileId='99999999-9999-4999-8999-999999999999';
 const form=P.schema({title:'Enquiry',questions:[{...P.newQuestion('file',fileId),label:'Progress photo',required:true,maxFiles:2,accept:'images'}]});
 const contact={first_name:'Sam',email:'sam@example.test',answers:{[fileId]:[{name:'photo.png',size:1024,type:'image/png'}]}};
 assert.equal(P.submission(contact,form).answers[fileId][0].name,'photo.png');
 assert.throws(()=>P.submission({...contact,answers:{[fileId]:[{name:'form.pdf',size:1024,type:'application/pdf'}]}},form),/valid files/);
 assert.throws(()=>P.submission({...contact,answers:{[fileId]:[{name:'photo.png',size:10485761,type:'image/png'}]}},form),/valid files/);
 assert.throws(()=>P.submission({...contact,answers:{[fileId]:[]}},form),/Please answer/);
});
test('lead form preview renders separate pages and safely escapes content',()=>{
 globalThis.RewiredLeadToolkit=require('./lead-toolkit');
 const UI=require('./prospects-ui');
 UI.init({P,esc:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))});
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const form=P.schema({title:'Enquiry',questions:[{...P.newQuestion('text',id),label:'Your <goal>'},{...P.newQuestion('pagebreak','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),text:'Next page'}]});
 const html=UI.leadHTML(form,true);
 assert.equal((html.match(/data-pr-lead-page/g)||[]).length,2);
 assert.match(html,/Your &lt;goal&gt;/);
 assert.doesNotMatch(html,/Your <goal>/);
 assert.match(html,/data-pr-page-next/);
});
