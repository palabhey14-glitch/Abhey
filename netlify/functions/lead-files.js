// Short-lived private uploads for an enquiry that was already accepted.
'use strict';
const { env, json, rest } = require('../lib/supabase');
const P = require('../../site/app/js/prospects');
async function handler(event,_context,fetchImpl=fetch){
  try{
    if(event.httpMethod!=='POST')return json(405,{error:'Use POST.'});
    if((event.body||'').length>2000)return json(413,{error:'Upload request is too long.'});
    let body;try{body=JSON.parse(event.body||'{}');}catch{return json(400,{error:'Invalid upload request.'});}
    const {token,request_id,question_id,index}=body;
    if(![token,request_id,question_id].every(x=>P.UUID.test(String(x||'')))||!Number.isInteger(index)||index<0||index>4)return json(400,{error:'Invalid upload request.'});
    const forms=await rest(`/prospect_lead_forms?public_token=eq.${token}&select=id`,{service:true},fetchImpl);
    if(!forms?.length)return json(404,{error:'Enquiry not found.'});
    const after=new Date(Date.now()-15*60*1000).toISOString();
    const rows=await rest(`/prospects?lead_form_id=eq.${forms[0].id}&submission_key=eq.${request_id}&created_at=gte.${encodeURIComponent(after)}&select=id,answers,form_snapshot`,{service:true},fetchImpl);
    const lead=rows?.[0],question=lead?.form_snapshot?.questions?.find(q=>q.id===question_id&&q.type==='file');
    if(!question||!Array.isArray(lead.answers?.[question_id])||!lead.answers[question_id][index])return json(404,{error:'Enquiry upload is unavailable.'});
    const file=lead.answers[question_id][index];
    if(!file||!Number.isInteger(file.size)||file.size<1||file.size>10485760||!['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif','application/pdf'].includes(file.type))return json(400,{error:'Invalid file details.'});
    const {url,service}=env();
    if(!service)return json(503,{error:'Uploads are temporarily unavailable.'});
    const path=`lead/${lead.id}/${question_id}/${index}`;
    const res=await fetchImpl(`${url}/storage/v1/object/upload/sign/form-files/${path}`,{method:'POST',headers:{apikey:service,...(service.startsWith('sb_')?{}:{Authorization:`Bearer ${service}`}), 'Content-Type':'application/json','x-upsert':'true'},body:'{}'});
    if(!res.ok)return json(503,{error:'Could not prepare the file upload. Please try again.'});
    const signed=await res.json();
    if(!signed.url||!signed.url.startsWith('/object/upload/sign/form-files/'))return json(503,{error:'Could not prepare the file upload.'});
    return json(200,{url:`${url}/storage/v1${signed.url}`,type:file.type,size:file.size});
  }catch{return json(503,{error:'Could not prepare the file upload. Please try again.'});}
}
exports.handler=(event,context)=>handler(event,context);
exports._handler=handler;
