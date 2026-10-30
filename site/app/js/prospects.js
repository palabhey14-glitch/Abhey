// Shared validation for coach prospects and public enquiry forms.
(function (root) {
  'use strict';
  const STAGES = { new: 'New lead', call_not_scheduled: 'Call not scheduled', call_scheduled: 'Call scheduled', call_completed: 'Call completed', follow_up: 'Following up', converted: 'Converted to client', lost: 'Not proceeding' };
  const GROUPS = {
    Basics: { text: 'Short answer', textarea: 'Long answer', select: 'Single choice', multiselect: 'Multiple choice', yesno: 'Yes / No', dropdown: 'Dropdown' },
    'Numbers and dates': { scale: 'Scale', grid: 'Grid', measurement: 'Measurement', date: 'Date', time: 'Time', ranking: 'Ranking' },
    'Client details': { contact: 'Contact details', availability: 'Availability', bodymap: 'Body map', file: 'File upload' },
    Content: { info: 'Info text', media: 'Image or video', terms: 'Terms document', signature: 'Signature', pagebreak: 'Page break' }
  };
  const TYPES = { ...Object.assign({}, ...Object.values(GROUPS)), number: 'Number' };
  const CONTENT = ['info','media','pagebreak'];
  const CHOICES = ['select','multiselect','dropdown','ranking'];
  const UNITS = ['kg','lb','cm','in','%','bpm','mmHg','hours','litres','steps'];
  const BODY = ['Head','Neck','Shoulder','Chest','Upper back','Lower back','Arm','Elbow','Wrist or hand','Abdomen','Hip','Glutes','Thigh','Hamstring','Knee','Shin or calf','Ankle or foot'];
  function newQuestion(type,id) {
    const q={id,type,label:'',help:'',required:false,options:[]};
    if(CHOICES.includes(type))q.options=['Option 1','Option 2'];
    if(type==='grid'){q.rows=['Row 1'];q.columns=['Column 1','Column 2'];}
    if(type==='scale'){q.min=1;q.max=5;}
    if(type==='measurement'){q.unit='kg';}
    if(type==='text')q.maxLength=250;
    if(type==='textarea')q.maxLength=1000;
    if(type==='info')q.label='Before you start';
    if(type==='pagebreak')q.label='Next part';
    if(type==='terms'){q.label='Terms';q.required=true;q.agreeLabel='I have read and agree to these terms';}
    if(type==='signature'){q.label='Signature';q.required=true;q.agreeLabel='I agree';}
    if(type==='bodymap')q.label='Where do you feel pain or discomfort?';
    if(type==='contact')q.label='Contact details';
    if(type==='availability')q.label='Availability';
    if(type==='file'){q.label='Upload a file';q.maxFiles=1;q.accept='both';}
    return q;
  }
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;
  const clean = (value) => String(value ?? '').trim();
  function tags(values) { return [...new Map((values || []).map(clean).filter(Boolean).map((v) => [v.toLowerCase(), v])).values()]; }
  function validateProspect(values) {
    const p = { first_name: clean(values.first_name), last_name: clean(values.last_name), email: clean(values.email).toLowerCase() || null, phone: clean(values.phone) || null, deal_value: values.deal_value === '' || values.deal_value == null ? null : Number(values.deal_value), stage: values.stage || 'call_not_scheduled', close_percentage: values.close_percentage === '' || values.close_percentage == null ? null : Number(values.close_percentage), tags: tags(values.tags), notes: clean(values.notes) || null };
    if (!p.first_name || p.first_name.length > 40 || p.last_name.length > 40) throw Error('Add a first name and keep each name under 40 characters.');
    if (p.email && (!EMAIL.test(p.email) || p.email.length > 254)) throw Error('Enter a valid email address.');
    if (p.phone && !/^\+?[0-9 ()-]{6,25}$/.test(p.phone)) throw Error('Check the phone number, including its country code.');
    if (!Object.hasOwn(STAGES,p.stage)) throw Error('Choose a deal stage.');
    if (p.deal_value !== null && (!Number.isFinite(p.deal_value) || p.deal_value < 0 || p.deal_value > 1000000 || Math.abs(p.deal_value * 100 - Math.round(p.deal_value * 100)) > 0.00001)) throw Error('Enter a deal value from 0 to 1,000,000 with at most two decimal places.');
    if (p.close_percentage !== null && (!Number.isInteger(p.close_percentage) || p.close_percentage < 0 || p.close_percentage > 100)) throw Error('Choose a close percentage from 0 to 100.');
    if (p.tags.length > 20 || p.tags.some((t) => t.length > 40)) throw Error('Use up to 20 tags, each under 40 characters.');
    if ((p.notes || '').length > 2000) throw Error('Keep notes under 2,000 characters.');
    return p;
  }
  function schema(values) {
    const title = clean(values.title), description = clean(values.description);
    if (!title || title.length > 120 || description.length > 500) throw Error('Add a form title (up to 120 characters) and keep its introduction under 500 characters.');
    const ids = new Set();
    if (!Array.isArray(values.questions) || values.questions.length > 20) throw Error('A lead form can have up to 20 questions.');
    const questions = values.questions.map((q) => {
      const id = clean(q.id), type = q.type, label = clean(q.label), required = !!q.required;
      if (!UUID.test(id) || ids.has(id) || !Object.hasOwn(TYPES,type) || !label || label.length > 160) throw Error('Give each question a label (up to 160 characters) and choose its answer type.');
      ids.add(id);
      const options = CHOICES.includes(type) ? tags(q.options) : [];
      if (CHOICES.includes(type) && (options.length < 2 || options.length > 20 || options.some((o) => o.length > 80))) throw Error('Choice questions need 2–20 unique options, each under 80 characters.');
      const help=clean(q.help);
      if(help.length>300)throw Error('Keep question help text under 300 characters.');
      const out={id,type,label,required:CONTENT.includes(type)?false:required,options,help};
      if(['text','textarea'].includes(type)){out.placeholder=clean(q.placeholder).slice(0,80);out.maxLength=Number(q.maxLength)|| (type==='text'?250:1000);if(out.maxLength<1||out.maxLength>2000)throw Error('Answer length must be between 1 and 2,000 characters.');}
      if(type==='scale'||type==='measurement'||type==='number'){out.min=q.min===''||q.min==null?null:Number(q.min);out.max=q.max===''||q.max==null?null:Number(q.max);if(type==='scale'&&(out.min==null||out.max==null||out.min<0||out.max>10||out.min>=out.max||!Number.isInteger(out.min)||!Number.isInteger(out.max)))throw Error('Scale must run from a lower whole number to a higher one, up to 10.');if((out.min!=null&&!Number.isFinite(out.min))||(out.max!=null&&!Number.isFinite(out.max))||(out.min!=null&&out.max!=null&&out.min>=out.max))throw Error('Check the minimum and maximum values.');}
      if(type==='scale'){out.lowLabel=clean(q.lowLabel).slice(0,40);out.highLabel=clean(q.highLabel).slice(0,40);}
      if(type==='measurement'){out.unit=UNITS.includes(q.unit)?q.unit:'kg';out.placeholder=clean(q.placeholder).slice(0,80);}
      if(type==='grid'){out.rows=tags(q.rows);out.columns=tags(q.columns);if(!out.rows.length||out.rows.length>10||out.columns.length<2||out.columns.length>7)throw Error('Grid questions need 1–10 rows and 2–7 columns.');}
      if(type==='date')out.allowed=['any','past','future'].includes(q.allowed)?q.allowed:'any';
      if(type==='multiselect'){out.minPicks=q.minPicks===''||q.minPicks==null?null:Number(q.minPicks);out.maxPicks=q.maxPicks===''||q.maxPicks==null?null:Number(q.maxPicks);if((out.minPicks!=null&&(!Number.isInteger(out.minPicks)||out.minPicks<0))||(out.maxPicks!=null&&(!Number.isInteger(out.maxPicks)||out.maxPicks<1))||(out.minPicks!=null&&out.maxPicks!=null&&out.minPicks>out.maxPicks))throw Error('Check the minimum and maximum number of choices.');}
      if(['info','pagebreak'].includes(type)){out.text=clean(q.text);if(out.text.length>2000)throw Error('Keep content text under 2,000 characters.');}
      if(type==='media'){out.url=clean(q.url);out.caption=clean(q.caption);if(!/^https:\/\/[^\s]+$/i.test(out.url)||out.url.length>500||out.caption.length>200)throw Error('Add a valid HTTPS image or video link and a short caption.');}
      if(type==='terms'){out.text=clean(q.text);out.agreeLabel=clean(q.agreeLabel)||'I agree';if(!out.text||out.text.length>8000||out.agreeLabel.length>120)throw Error('Add terms (up to 8,000 characters) and a short agreement label.');out.required=true;}
      if(type==='signature'){out.statement=clean(q.statement);out.agreeLabel=clean(q.agreeLabel)||'I agree';if(out.statement.length>1000||out.agreeLabel.length>120)throw Error('Keep the signature statement and agreement label short.');}
      if(type==='file'){out.maxFiles=Number(q.maxFiles)||1;out.accept=['images','pdf','both'].includes(q.accept)?q.accept:'both';if(!Number.isInteger(out.maxFiles)||out.maxFiles<1||out.maxFiles>5)throw Error('Choose 1–5 files per upload question.');}
      return out;
    });
    return { title, description, questions };
  }
  function submission(values, formSchema) {
    const p = validateProspect({ ...values, stage: 'new', tags: [], notes: '' });
    if (!p.email) throw Error('Add your email address so we can respond to your enquiry.');
    const form = schema(formSchema), answers = {};
    for (const q of form.questions) {
      const raw = values.answers?.[q.id];
      const value = ['multiselect','ranking','availability','bodymap','file'].includes(q.type) ? (Array.isArray(raw)?(q.type==='file'?raw:raw.map(clean).filter(Boolean)):[]) : ['grid','contact','signature'].includes(q.type) ? (raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{}) : CONTENT.includes(q.type)?'':clean(raw);
      const missing = Array.isArray(value) ? !value.length : typeof value==='object'? (q.type==='signature'?!clean(value.name)&&!value.agreed:!Object.keys(value).length) : value === '';
      if(CONTENT.includes(q.type)){answers[q.id]='';continue;}
      if (q.required && missing) throw Error(`Please answer: ${q.label}`);
      if (!missing) {
        if (CHOICES.includes(q.type) && (Array.isArray(value) ? value : [value]).some((v) => !q.options.includes(v))) throw Error(`Choose a listed answer for: ${q.label}`);
        if(q.type==='ranking'&&(value.length!==q.options.length||new Set(value).size!==value.length))throw Error(`Rank every option for: ${q.label}`);
        if(q.type==='multiselect'&&((q.minPicks!=null&&value.length<q.minPicks)||(q.maxPicks!=null&&value.length>q.maxPicks)))throw Error(`Check the number of choices for: ${q.label}`);
        if (['number','measurement','scale'].includes(q.type) && (!Number.isFinite(Number(value)) || Math.abs(Number(value)) > 1000000 ||(q.min!=null&&Number(value)<q.min)||(q.max!=null&&Number(value)>q.max)||(q.type==='scale'&&!Number.isInteger(Number(value))))) throw Error(`Enter a valid number for: ${q.label}`);
        if(q.type==='yesno'&&!['Yes','No'].includes(value))throw Error(`Choose Yes or No for: ${q.label}`);
        if(q.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||(q.allowed==='past'&&value>new Date().toISOString().slice(0,10))||(q.allowed==='future'&&value<new Date().toISOString().slice(0,10))))throw Error(`Choose an allowed date for: ${q.label}`);
        if(q.type==='time'&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw Error(`Choose a time for: ${q.label}`);
        if(q.type==='grid'&&(Object.keys(value).some(k=>!q.rows.includes(k)||!q.columns.includes(clean(value[k])))||(q.required&&q.rows.some(r=>!value[r]))))throw Error(`Complete the grid for: ${q.label}`);
        if(q.type==='bodymap'&&value.some(v=>!BODY.includes(v)))throw Error(`Choose a listed body area for: ${q.label}`);
        if(q.type==='availability'&&value.some(v=>!['Mon','Tue','Wed','Thu','Fri','Sat','Sun','Early morning','Morning','Midday','Afternoon','Evening'].includes(v)))throw Error(`Choose a listed time for: ${q.label}`);
        if(q.type==='contact'&&(Object.keys(value).some(k=>!['name','email','phone'].includes(k))||Object.values(value).some(v=>typeof v!=='string'||v.length>254)))throw Error(`Check the contact details for: ${q.label}`);
        if(q.type==='file'&&(value.length>q.maxFiles||value.some(f=>!f||typeof f!=='object'||Array.isArray(f)||Object.keys(f).some(k=>!['name','size','type'].includes(k))||!clean(f.name)||clean(f.name).length>120||!Number.isInteger(f.size)||f.size<1||f.size>10485760||!['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif','application/pdf'].includes(f.type)||(q.accept==='pdf'&&f.type!=='application/pdf')||(q.accept==='images'&&f.type==='application/pdf'))))throw Error(`Choose valid files for: ${q.label}`);
        if(q.type==='terms'&&value!=='I agree')throw Error(`Agree to the terms for: ${q.label}`);
        if(q.type==='signature'&&(!/^.{1,120}$/.test(clean(value.name))||value.agreed!==true||Object.keys(value).some(k=>!['name','agreed'].includes(k))))throw Error(`Type your name and agree to sign: ${q.label}`);
        if(typeof value!=='string'&&JSON.stringify(value).length>2000)throw Error(`Keep the answer to “${q.label}” shorter.`);
        if (typeof value === 'string' && value.length > (q.maxLength||2000)) throw Error(`Keep the answer to “${q.label}” under ${q.maxLength||2000} characters.`);
      }
      answers[q.id] = value;
    }
    if(form.questions.filter(q=>q.type==='file').reduce((n,q)=>n+(answers[q.id]||[]).length,0)>5)throw Error('A lead form can include up to five uploaded files in total.');
    return { first_name: p.first_name, last_name: p.last_name, email: p.email, phone: p.phone, answers };
  }
  const name = (p) => `${p.first_name} ${p.last_name || ''}`.trim();
  const daysInStage = (p, today) => Math.max(0, Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${String(p.stage_changed_at || p.created_at).slice(0,10)}T12:00:00Z`)) / 86400000));
  function filtered(rows, view) { const q = clean(view.q).toLowerCase();return rows.filter((p) => !!p.archived_at === !!view.archived && (!view.stage || p.stage === view.stage) && (!view.tag || (p.tags || []).includes(view.tag)) && (!q || [name(p), p.email, p.phone, ...(p.tags || [])].join(' ').toLowerCase().includes(q))); }
  const api = { STAGES, TYPES, GROUPS, CONTENT, CHOICES, UNITS, BODY, newQuestion, UUID, EMAIL, tags, validateProspect, schema, submission, name, daysInStage, filtered };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RewiredProspects = api;
})(typeof window !== 'undefined' ? window : globalThis);
