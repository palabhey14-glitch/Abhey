'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),lead=require('../functions/lead-forms');
process.env.SUPABASE_URL='https://project.example.test';process.env.SUPABASE_ANON_KEY='anon';process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_test_only';
const token='66666666-6666-4666-8666-666666666666',id='77777777-7777-4777-8777-777777777777',request_id='99999999-9999-4999-8999-999999999999';
const schema={title:'Enquiry',description:'Tell us more',questions:[{id,type:'text',label:'Your goal?',required:true,options:[]}]};
const response=(data)=>({ok:true,status:200,text:async()=>JSON.stringify(data)});
const body={token,version:1,request_id,first_name:'Sam',email:'sam@example.test',answers:{[id]:'Strength'}};
const event=(b=body)=>({httpMethod:'POST',headers:{'x-nf-client-connection-ip':'203.0.113.1'},body:JSON.stringify(b)});
test('public form GET exposes only the published schema and no prospect/contact records',async()=>{
 const out=await lead._handler({httpMethod:'GET',queryStringParameters:{token}}, {}, async url=>{assert.match(url,/published_schema,version/);return response([{published_schema:schema,version:1}]);});
 assert.equal(out.statusCode,200);assert.deepEqual(Object.keys(JSON.parse(out.body)).sort(),['schema','version']);
});
test('submissions are validated, IP addresses are hashed and service credentials remain server-side',async()=>{
 let saved;const out=await lead._handler(event(),{},async(url,init)=>{assert.equal(init.headers.apikey,'sb_secret_test_only');assert.equal(init.headers.Authorization,undefined);if(url.includes('/rpc/')){saved=JSON.parse(init.body);return response({accepted:true});}return response([{published_schema:schema,version:1}]);});
 assert.equal(out.statusCode,200);assert.equal(saved.p_values.email,'sam@example.test');assert.equal(saved.p_values.answers[id],'Strength');assert.match(saved.p_ip_hash,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(saved).includes('203.0.113.1'),false);assert.equal(saved.p_version,1);
});
test('invalid answers, stale forms, honeypots and rate limits do not silently create prospects',async()=>{
 let calls=0;const fetcher=async url=>{calls++;return url.includes('/rpc/')?response({accepted:false,reason:'rate_limit'}):response([{published_schema:schema,version:1}]);};
 let out=await lead._handler(event({...body,answers:{}}),{},fetcher);assert.equal(out.statusCode,400);assert.equal(calls,1);
 out=await lead._handler(event({...body,version:0}),{},fetcher);assert.equal(out.statusCode,409);
 calls=0;out=await lead._handler(event({...body,website:'spam'}),{},fetcher);assert.equal(out.statusCode,200);assert.equal(calls,0);
 out=await lead._handler(event(),{},fetcher);assert.equal(out.statusCode,429);
});
