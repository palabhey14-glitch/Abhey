'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),lead=require('../functions/lead-files');
process.env.SUPABASE_URL='https://project.example.test';process.env.SUPABASE_ANON_KEY='anon';process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_test_only';
const token='66666666-6666-4666-8666-666666666666',request_id='99999999-9999-4999-8999-999999999999',question_id='77777777-7777-4777-8777-777777777777',form_id='88888888-8888-4888-8888-888888888888',prospect_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const event=(index=0)=>({httpMethod:'POST',body:JSON.stringify({token,request_id,question_id,index})});
const response=(data)=>({ok:true,status:200,text:async()=>JSON.stringify(data),json:async()=>data});
test('file upload links are issued only for a recent accepted enquiry and its listed file',async()=>{
 const calls=[];const fetcher=async(url,init)=>{calls.push({url,init});if(url.includes('/prospect_lead_forms?'))return response([{id:form_id}]);if(url.includes('/prospects?'))return response([{id:prospect_id,form_snapshot:{questions:[{id:question_id,type:'file'}]},answers:{[question_id]:[{name:'photo.png',size:100,type:'image/png'}]}}]);if(url.includes('/storage/v1/object/upload/sign/'))return response({url:`/object/upload/sign/form-files/lead/${prospect_id}/${question_id}/0?token=signed`});throw Error('unexpected request');};
 const out=await lead._handler(event(),{},fetcher);
 assert.equal(out.statusCode,200);
 assert.match(JSON.parse(out.body).url,/\/storage\/v1\/object\/upload\/sign\/form-files\/lead\//);
 assert.equal(calls[2].init.headers.apikey,'sb_secret_test_only');
 assert.equal(calls[2].init.headers.Authorization,undefined);
 assert.match(calls[1].url,/created_at=gte\./);
 const denied=await lead._handler(event(1),{},fetcher);assert.equal(denied.statusCode,404);assert.equal(calls.length,5);
});
test('file upload links reject malformed IDs before accessing the database',async()=>{
 let called=false;const out=await lead._handler({httpMethod:'POST',body:JSON.stringify({token:'bad',request_id,question_id,index:0})},{},async()=>{called=true;throw Error('unexpected');});
 assert.equal(out.statusCode,400);assert.equal(called,false);
});
