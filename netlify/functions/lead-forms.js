// Public, token-addressed enquiry forms. Prospect records are never public.
'use strict';
const { createHmac } = require('node:crypto');
const { env, json, rest } = require('../lib/supabase');
const P = require('../../site/app/js/prospects');
async function handler(event, _context, fetchImpl = fetch) {
  try {
    if (!['GET','POST'].includes(event.httpMethod)) return json(405,{error:'Use GET or POST.'});
    let body={};
    if (event.httpMethod==='POST') {
      if ((event.body||'').length>64000) return json(413,{error:'This enquiry is too long.'});
      try { body=JSON.parse(event.body||'{}'); } catch { return json(400,{error:'Send valid enquiry details.'}); }
      if (body.website) return json(200,{accepted:true}); // Honeypot; do not create a lead.
    }
    const token=event.httpMethod==='GET'?event.queryStringParameters?.token:body.token;
    if (!P.UUID.test(String(token||''))) return json(404,{error:'This enquiry form is unavailable.'});
    const {service}=env();
    if (!service) return json(503,{error:'Enquiries are temporarily unavailable. Please try again later.'});
    const forms=await rest(`/prospect_lead_forms?public_token=eq.${token}&accepting=eq.true&archived_at=is.null&select=published_schema,version`,{service:true},fetchImpl);
    if (!forms?.[0]?.published_schema) return json(404,{error:'This enquiry form is unavailable.'});
    const schema=P.schema(forms[0].published_schema);
    if (event.httpMethod==='GET') return json(200,{schema,version:forms[0].version});
    if (body.version!==forms[0].version) return json(409,{error:'This form has been updated. Refresh it before submitting.'});
    if (!P.UUID.test(String(body.request_id||''))) return json(400,{error:'Refresh the form and try again.'});
    let values;
    try { values=P.submission(body,schema); } catch(error) {return json(400,{error:error.message});}
    const headers=event.headers||{};
    const ip=headers['x-nf-client-connection-ip']||headers['X-Nf-Client-Connection-Ip']||'unknown';
    const ipHash=createHmac('sha256',service).update(String(ip)).digest('hex');
    const result=await rest('/rpc/submit_prospect_lead',{method:'POST',service:true,body:{p_token:token,p_values:values,p_request_id:body.request_id,p_ip_hash:ipHash,p_version:body.version}},fetchImpl);
    if (result?.reason==='changed') return json(409,{error:'This form has been updated. Refresh it before submitting.'});
    if (result?.reason==='rate_limit') return json(429,{error:'Too many enquiries. Please try again in an hour.'});
    if (!result?.accepted) return json(404,{error:'This enquiry form is no longer accepting responses.'});
    return json(200,{accepted:true});
  } catch (_) { return json(503,{error:'Your enquiry could not be saved. Please try again shortly.'}); }
}
exports.handler=(event,context)=>handler(event,context);
exports._handler=handler;
