// The public lead form uses the same grouped question toolkit as Content > Forms.
(function(root){
  'use strict';
  const choices=['select','multiselect','dropdown','ranking'];
  const list=(value)=>String(value||'').split('\n').map(x=>x.trim()).filter(Boolean);
  const esc=(value)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const field=(name,label,value='',attrs='')=>`<label class="pr-field">${label}<input data-setting="${name}" value="${esc(value)}" ${attrs}></label>`;
  const area=(name,label,value='',rows=4,attrs='')=>`<label class="pr-field">${label}<textarea data-setting="${name}" rows="${rows}" ${attrs}>${esc(value)}</textarea></label>`;
  const select=(name,label,options,value)=>`<label class="pr-field">${label}<select data-setting="${name}">${options.map(([v,t])=>`<option value="${esc(v)}"${String(value)===String(v)?' selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
  const nums=(name,label,value,attrs='')=>field(name,label,value,`type="number" step="any" ${attrs}`);
  function settings(P,q){
    const t=q.type;
    if(choices.includes(t))return area('options','Options · one per line',(q.options||[]).join('\n'),4,'maxlength="2000"')+(t==='multiselect'? `<div class="pr-two">${nums('minPicks','Minimum choices',q.minPicks??'','min="0" step="1"')}${nums('maxPicks','Maximum choices',q.maxPicks??'','min="1" step="1"')}</div>`:'');
    if(t==='text'||t==='textarea')return `<div class="pr-two">${select('maxLength','Answer length',(t==='text'?[100,250,500]:[250,500,1000,2000]).map(n=>[n,`Up to ${n} characters`]),q.maxLength|| (t==='text'?250:1000))}${field('placeholder','Placeholder',q.placeholder||'','maxlength="80"')}</div>`;
    if(t==='number'||t==='measurement')return `<div class="pr-two">${nums('min','Lowest',q.min??'')}${nums('max','Highest',q.max??'')}</div>${t==='measurement'?select('unit','Unit',P.UNITS.map(u=>[u,u]),q.unit||'kg'):''}`;
    if(t==='scale')return `<div class="pr-two">${nums('min','From',q.min??1,'min="0" max="9" step="1"')}${nums('max','To',q.max??5,'min="1" max="10" step="1"')}</div><div class="pr-two">${field('lowLabel','Low end label',q.lowLabel||'','maxlength="40"')}${field('highLabel','High end label',q.highLabel||'','maxlength="40"')}</div>`;
    if(t==='grid')return area('rows','Rows · one per line',(q.rows||[]).join('\n'))+area('columns','Columns · one per line',(q.columns||[]).join('\n'));
    if(t==='date')return select('allowed','Allowed dates',[['any','Any date'],['past','Past dates only'],['future','Today or later']],q.allowed||'any');
    if(t==='availability')return '<p class="pr-setting-note">Visitors can select days and times that work for them.</p>';
    if(t==='bodymap')return '<p class="pr-setting-note">Visitors can select the areas where they feel pain or discomfort.</p>';
    if(t==='contact')return '<p class="pr-setting-note">Name, email and phone are already included at the top of every lead form. This item adds a separate contact details question.</p>';
    if(t==='file')return `<div class="pr-two">${select('maxFiles','Maximum files',[1,2,3,4,5].map(n=>[n,`Up to ${n}`]),q.maxFiles||1)}${select('accept','File type',[['both','Images or PDF'],['images','Images'],['pdf','PDF']],q.accept||'both')}</div><p class="pr-setting-note">Visitors can upload up to 10 MB per file. Files stay private and appear in their prospect response.</p>`;
    if(t==='info'||t==='pagebreak')return area('text','Text shown to visitors',q.text||'',4,'maxlength="2000"');
    if(t==='media')return field('url','HTTPS image or video link',q.url||'','type="url" maxlength="500" placeholder="https://"')+field('caption','Caption',q.caption||'','maxlength="200"');
    if(t==='terms')return area('text','Terms shown to visitors',q.text||'',8,'maxlength="8000"')+field('agreeLabel','Agreement checkbox',q.agreeLabel||'I have read and agree to these terms','maxlength="120"');
    if(t==='signature')return area('statement','Statement',q.statement||'',3,'maxlength="1000"')+field('agreeLabel','Agreement checkbox',q.agreeLabel||'I agree','maxlength="120"')+'<p class="pr-setting-note">Visitors type their name and tick the agreement box. The response records the name and submission time.</p>';
    return '';
  }
  function read(card,q){
    const get=(k)=>card.querySelector(`[data-setting="${k}"]`)?.value;
    q.label=card.querySelector('[data-pr-q-label]').value;
    q.help=card.querySelector('[data-pr-q-help]')?.value||'';
    q.required=card.querySelector('[data-pr-q-required]').checked;
    if(choices.includes(q.type))q.options=list(get('options'));
    if(q.type==='grid'){q.rows=list(get('rows'));q.columns=list(get('columns'));}
    for(const k of ['placeholder','unit','allowed','lowLabel','highLabel','text','url','caption','statement','agreeLabel','accept'])if(get(k)!==undefined)q[k]=get(k);
    for(const k of ['maxLength','min','max','minPicks','maxPicks','maxFiles'])if(get(k)!==undefined)q[k]=get(k);
    return q;
  }
  function question(P,q){
    const name=`answer_${q.id}`,req=q.required?' required':'',title=`${esc(q.label)}${q.required?' *':''}`;
    if(P.CONTENT.includes(q.type)){
      if(q.type==='media'){
        const url=esc(q.url||''),yt=String(q.url).match(/^https:\/\/(?:www\.)?youtube\.com\/(?:watch\?v=|shorts\/|embed\/)([\w-]{6,})/i)||String(q.url).match(/^https:\/\/youtu\.be\/([\w-]{6,})/i),vi=String(q.url).match(/^https:\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/)?(\d+)/i);
        const visual=yt?`<iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}" title="${title}" loading="lazy" allowfullscreen></iframe>`:vi?`<iframe src="https://player.vimeo.com/video/${vi[1]}" title="${title}" loading="lazy" allowfullscreen></iframe>`:/\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(q.url)?`<img src="${url}" alt="${esc(q.caption||q.label)}" loading="lazy">`:/\.(mp4|webm)(\?.*)?$/i.test(q.url)?`<video src="${url}" controls preload="metadata"></video>`:`<a href="${url}" target="_blank" rel="noopener noreferrer">Open image or video ↗</a>`;
        return `<section class="pr-public-content"><h2>${title}</h2>${visual}${q.caption?`<p>${esc(q.caption)}</p>`:''}</section>`;
      }
      return `<section class="pr-public-content${q.type==='pagebreak'?' pr-public-break':''}"><h2>${title}</h2>${q.text?`<p>${esc(q.text)}</p>`:''}</section>`;
    }
    let answer='';
    if(q.type==='text'||q.type==='textarea')answer=q.type==='textarea'?`<textarea name="${name}" rows="4" maxlength="${q.maxLength||1000}" placeholder="${esc(q.placeholder||'')}"${req}></textarea>`:`<input name="${name}" type="text" maxlength="${q.maxLength||250}" placeholder="${esc(q.placeholder||'')}"${req}>`;
    else if(q.type==='select'||q.type==='dropdown')answer=`<select name="${name}"${req}><option value="">Choose an answer</option>${q.options.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>`;
    else if(q.type==='multiselect'||q.type==='bodymap'||q.type==='availability'){const opts=q.type==='bodymap'?P.BODY:q.type==='availability'?['Mon','Tue','Wed','Thu','Fri','Sat','Sun','Early morning','Morning','Midday','Afternoon','Evening']:q.options;answer=`<div class="pr-choice-grid">${opts.map(o=>`<label class="pr-public-choice"><input type="checkbox" name="${name}" value="${esc(o)}">${esc(o)}</label>`).join('')}</div>`;}
    else if(q.type==='yesno')answer=`<div class="pr-choice-grid">${['Yes','No'].map(o=>`<label class="pr-public-choice"><input type="radio" name="${name}" value="${o}"${req}>${o}</label>`).join('')}</div>`;
    else if(q.type==='ranking')answer=`<div class="pr-rank">${q.options.map((_,i)=>`<label>Rank ${i+1}<select name="${name}" data-rank="${i}"${req}><option value="">Choose an option</option>${q.options.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select></label>`).join('')}</div>`;
    else if(q.type==='scale')answer=`<div class="pr-scale">${Array.from({length:q.max-q.min+1},(_,i)=>q.min+i).map(n=>`<label><input type="radio" name="${name}" value="${n}"${req}><span>${n}</span></label>`).join('')}</div><div class="pr-scale-labels"><span>${esc(q.lowLabel||'')}</span><span>${esc(q.highLabel||'')}</span></div>`;
    else if(q.type==='number'||q.type==='measurement')answer=`<div class="pr-measure"><input type="number" name="${name}" step="any"${q.min!=null?` min="${q.min}"`:''}${q.max!=null?` max="${q.max}"`:''}${req}>${q.unit?`<span>${esc(q.unit)}</span>`:''}</div>`;
    else if(q.type==='date'||q.type==='time')answer=`<input type="${q.type}" name="${name}"${req}>`;
    else if(q.type==='grid')answer=`<div class="pr-grid">${q.rows.map((r,i)=>`<label>${esc(r)}<select data-grid-row="${esc(r)}" name="${name}_${i}"${req}><option value="">Choose</option>${q.columns.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></label>`).join('')}</div>`;
    else if(q.type==='contact')answer=`<div class="pr-two"><label>Full name<input name="${name}_name" data-contact="name" maxlength="120"${req}></label><label>Email<input type="email" name="${name}_email" data-contact="email" maxlength="254"${req}></label></div><label>Phone<input type="tel" name="${name}_phone" data-contact="phone" maxlength="25"${req}></label>`;
    else if(q.type==='file')answer=`<input type="file" name="${name}" accept="${q.accept==='pdf'?'.pdf,application/pdf':q.accept==='images'?'image/*':'.pdf,application/pdf,image/*'}"${q.maxFiles>1?' multiple':''}${req}><small>Up to ${q.maxFiles} ${q.maxFiles===1?'file':'files'}, 10 MB each. Images and PDFs only.</small>`;
    else if(q.type==='terms')answer=`<div class="pr-terms-text">${esc(q.text)}</div><label class="pr-public-choice"><input type="checkbox" name="${name}" value="I agree" required>${esc(q.agreeLabel)}</label>`;
    else if(q.type==='signature')answer=`${q.statement?`<p>${esc(q.statement)}</p>`:''}<input name="${name}" maxlength="120" placeholder="Type your full name"${req}><label class="pr-public-choice"><input type="checkbox" name="consent_${q.id}"${req}>${esc(q.agreeLabel)}</label>`;
    return `<fieldset class="pr-public-question"><legend>${title}</legend>${q.help?`<p class="pr-public-help">${esc(q.help)}</p>`:''}${answer}</fieldset>`;
  }
  function answer(form,q){
    if(['info','media','pagebreak'].includes(q.type))return '';
    if(q.type==='signature')return {name:form.querySelector(`[name="answer_${q.id}"]`)?.value||'',agreed:!!form.querySelector(`[name="consent_${q.id}"]`)?.checked};
    if(q.type==='terms')return form.querySelector(`[name="answer_${q.id}"]`)?.checked?'I agree':'';
    if(q.type==='file')return [...(form.querySelector(`[name="answer_${q.id}"]`)?.files||[])].map(f=>({name:f.name,size:f.size,type:f.type}));
    if(q.type==='grid'){const out={};form.querySelectorAll(`[name^="answer_${q.id}_"]`).forEach(x=>{if(x.value)out[x.dataset.gridRow]=x.value;});return out;}
    if(q.type==='contact'){const out={};form.querySelectorAll(`[name^="answer_${q.id}_"]`).forEach(x=>{if(x.value)out[x.dataset.contact]=x.value;});return out;}
    const inputs=[...form.querySelectorAll(`[name="answer_${q.id}"]`)];
    if(['multiselect','bodymap','availability'].includes(q.type))return inputs.filter(x=>x.checked).map(x=>x.value);
    if(q.type==='ranking')return inputs.map(x=>x.value).filter(Boolean);
    if(['yesno','scale'].includes(q.type))return inputs.find(x=>x.checked)?.value||'';
    return inputs[0]?.value||'';
  }
  const api={settings,read,question,answer};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RewiredLeadToolkit=api;
})(typeof window!=='undefined'?window:globalThis);
