/* School directory data utilities. Dates use the browser's ICU Persian calendar.
   No imported record or photo is sent to a server by this module. */
export const fields = [
  {key:'name',label:'نام و نام خانوادگی',aliases:['نام کامل','نام و نام‌خانوادگی','نام دانش آموز','نام دبیر','full name','name']},
  {key:'firstName',label:'نام',aliases:['نام کوچک','نام دانش‌آموز (کوچک)','first name','firstname']},
  {key:'lastName',label:'نام خانوادگی',aliases:['نام‌خانوادگی','فامیل','last name','lastname','surname']},
  {key:'nationalId',label:'کد ملی',aliases:['کدملی','شماره ملی','national id','nationalid']},
  {key:'studentCode',label:'کد دانش‌آموزی / پرسنلی',aliases:['کد دانش آموزی','شماره دانش آموزی','کد پرسنلی','شماره پرسنلی','student code','studentcode']},
  {key:'birthday',label:'تاریخ تولد',aliases:['تولد','روز تولد','تاریخ‌تولد','birth date','birthday','dob']},
  {key:'className',label:'کلاس',aliases:['نام کلاس','شماره کلاس','کلاس درس','class','classname']},
  {key:'grade',label:'پایه',aliases:['پایه تحصیلی','مقطع','grade']},
  {key:'studyField',label:'رشته تحصیلی',aliases:['رشته تحصیلی دانش آموز','study field','studyfield']},
  {key:'fatherName',label:'نام پدر',aliases:['نام و نام خانوادگی پدر','father name','fathername']},
  {key:'motherName',label:'نام مادر',aliases:['نام و نام خانوادگی مادر','mother name','mothername']},
  {key:'fatherJob',label:'شغل پدر',aliases:['شغل‌پدر','حرفه پدر','father job','fatherjob']},
  {key:'motherJob',label:'شغل مادر',aliases:['شغل‌مادر','حرفه مادر','mother job','motherjob']},
  {key:'subject',label:'درس / تخصص',aliases:['درس','تخصص','رشته','رشته تدریس','درس تدریس','subject','specialty']},
  {key:'address',label:'نشانی',aliases:['آدرس','آدرس منزل','نشانی منزل','address']},
  {key:'phone',label:'موبایل خود فرد',aliases:['موبایل','شماره موبایل','شماره همراه','تلفن همراه','موبایل دانش آموز','تلفن همراه دانش آموز','شماره دانش آموز','موبایل دبیر','phone','mobile']},
  {key:'fatherPhone',label:'موبایل پدر',aliases:['تلفن پدر','شماره پدر','تلفن همراه پدر','شماره همراه پدر','شماره موبایل پدر','father phone','fatherphone']},
  {key:'motherPhone',label:'موبایل مادر',aliases:['تلفن مادر','شماره مادر','تلفن همراه مادر','شماره همراه مادر','شماره موبایل مادر','mother phone','motherphone']},
  {key:'homePhone',label:'تلفن ثابت منزل',aliases:['تلفن منزل','تلفن ثابت','شماره منزل','تلفن خانه','home phone','homephone','landline']},
  {key:'emergencyPhone',label:'تلفن ضروری',aliases:['شماره تلفن ضروری','شماره ضروری','emergency phone','emergencyphone']},
  {key:'emergencyRelation',label:'نسبت تماس ضروری',aliases:['صاحب شماره ضروری','نسبت شماره ضروری','emergency relation','emergencyrelation']},
  {key:'notes',label:'یادداشت',aliases:['توضیحات','ملاحظات','notes']},
];

export function digits(value) {
  return String(value ?? '').replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632));
}
export function normalize(value) {
  return digits(value).replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[أإٱ]/g,'ا')
    .replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[\u200c\u200d\u200e\u200f]/g,' ')
    .replace(/\s+/g,' ').trim().toLocaleLowerCase('fa');
}
export function phoneDigits(value) {
  let v=digits(value).replace(/\D/g,'');
  if(v.startsWith('0098') && v.length===14)v='0'+v.slice(4);
  else if(v.startsWith('98') && v.length===12)v='0'+v.slice(2);
  if(v.length===10)v='0'+v;
  return v;
}

const contactFields=[['phone',null],['fatherPhone','پدر'],['motherPhone','مادر'],['homePhone','تلفن منزل'],['emergencyPhone','تماس ضروری']];
export function contacts(record) {
  const out=[];
  for(const [key,relationship] of contactFields) {
    const baseRole=key==='emergencyPhone'?(record.emergencyRelation||'تماس ضروری'):relationship || (record.type==='teacher'?'دبیر':'دانش‌آموز');
    const contactName=key==='fatherPhone'?record.fatherName:key==='motherPhone'?record.motherName:key==='homePhone'?'منزل':record.name;
    // A slash, comma or newline separates numbers; spaces and hyphens belong to a number.
    const values=String(record[key]??'').split(/[,،;؛\n/|]+/).map(x=>x.trim()).filter(Boolean);
    for(const number of values)if(phoneDigits(number)) {
      const role=key==='homePhone'&&/^09\d{9}$/.test(phoneDigits(number))?'شماره جایگزین منزل':baseRole;
      out.push({role,label:role,number,name:contactName||role,key});
    }
  }
  return out;
}

const phoneKeys=new Set(contactFields.map(x=>x[0]));
export function searchRecords(records,query='',options={}) {
  const q=normalize(query), tokens=q.split(' ').filter(Boolean);
  const numeric=/^[+\d\s()\-.]+$/.test(q), numberQ=numeric?phoneDigits(q):'';
  const job=normalize(options.job||'');
  const results=[];
  for(const record of records) {
    if(options.type && options.type!=='all' && record.type!==options.type)continue;
    if(job && !normalize([record.fatherJob,record.motherJob,record.subject].filter(Boolean).join(' ')).includes(job))continue;
    const matches=[];
    const values=fields.filter(f=>!phoneKeys.has(f.key)&&!['firstName','lastName'].includes(f.key))
      .map(f=>({kind:f.key,label:f.label,value:String(record[f.key]??'')}));
    for(const [label,value] of Object.entries(record.extras||{}))if(value!=null && !(numeric&&/(?:تلفن|همراه|موبایل|phone|mobile|landline)/i.test(label)))values.push({kind:'extra',label,value:String(value)});
    const allText=normalize(values.map(v=>v.value).join(' '));
    const textHit=q && tokens.every(t=>allText.includes(t));
    if(textHit)for(const value of values)if(tokens.some(t=>normalize(value.value).includes(t)))matches.push(value);
    if(q)for(const contact of contacts(record)) {
      const hit=numeric ? (numberQ.length>=4 && phoneDigits(contact.number).endsWith(numberQ)) : normalize([contact.number,contact.name,contact.role].join(' ')).includes(q);
      if(hit)matches.push({kind:'phone',label:contact.role,value:contact.number,...contact});
    }
    if(!q || matches.length)results.push({record,matches});
  }
  return results;
}

const faDate=new Intl.DateTimeFormat('en-US-u-ca-persian',{timeZone:'Asia/Tehran',year:'numeric',month:'numeric',day:'numeric'});
const civilDate=new Intl.DateTimeFormat('en-US-u-ca-gregory',{timeZone:'Asia/Tehran',year:'numeric',month:'numeric',day:'numeric'});
const fullDate=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{timeZone:'Asia/Tehran',weekday:'long',year:'numeric',month:'long',day:'numeric'});
const weekDate=new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',weekday:'long'});
const dayMillis=86400000;
function parts(format,date){const p=Object.fromEntries(format.formatToParts(date).filter(x=>['year','month','day'].includes(x.type)).map(x=>[x.type,Number(digits(x.value))]));return p;}
export function todayParts(date=new Date()) {
  const j=parts(faDate,date),g=parts(civilDate,date);
  return {...j,label:fullDate.format(date),weekday:weekDate.format(date),dateKey:`${j.year}/${String(j.month).padStart(2,'0')}/${String(j.day).padStart(2,'0')}`,gregorianYear:g.year,gregorianMonth:g.month,gregorianDay:g.day};
}
const jalaliYearCache=new Map();
function calendarYear(year) {
  if(jalaliYearCache.has(year))return jalaliYearCache.get(year);
  const dates=new Map();
  // Every modern Jalali year begins in March. ICU handles the leap-year calculation.
  const start=Date.UTC(year+621,2,15,12);
  for(let i=0;i<385;i++) {
    const stamp=start+i*dayMillis,j=parts(faDate,new Date(stamp));
    if(j.year===year)dates.set(`${j.month}/${j.day}`,stamp);
    if(j.year>year)break;
  }
  jalaliYearCache.set(year,dates);
  return dates;
}
function invalid(error){return {valid:false,error};}
function fromGregorian(year,month,day) {
  if(!Number.isInteger(year)||year<1800||year>2300||month<1||month>12||day<1||day>31)return invalid('تاریخ میلادی معتبر نیست.');
  const date=new Date(Date.UTC(year,month-1,day,12));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return invalid('تاریخ میلادی معتبر نیست.');
  const j=parts(faDate,date);
  return {valid:true,...j,calendar:'jalali',sourceCalendar:'gregorian',normalized:`${j.year}/${String(j.month).padStart(2,'0')}/${String(j.day).padStart(2,'0')}`};
}
export function birthdayInfo(value,calendar='jalali') {
  if(value===null||value===undefined||String(value).trim()==='')return invalid('تاریخ تولد ثبت نشده است.');
  if(calendar==='excel') {
    const serial=Number(digits(value));
    if(!Number.isFinite(serial)||serial<1||serial>146463||Math.floor(serial)===60)return invalid('عدد تاریخ اکسل معتبر نیست (سامانهٔ تاریخ ۱۹۰۰).');
    const date=new Date(Date.UTC(1899,11,serial<60?31:30,12)+Math.floor(serial)*dayMillis);
    return {...fromGregorian(date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDate()),sourceCalendar:'excel'};
  }
  if(value instanceof Date) {
    if(calendar!=='gregorian'||!Number.isFinite(value.getTime()))return invalid('نوع تقویم تاریخ مشخص نیست.');
    return fromGregorian(value.getUTCFullYear(),value.getUTCMonth()+1,value.getUTCDate());
  }
  const cleaned=digits(value).trim();
  const match=cleaned.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:T00:00:00(?:\.000)?Z)?$/);
  if(!match)return invalid('تاریخ باید به صورت سال/ماه/روز باشد؛ نمونه: ۱۳۸۹/۰۷/۳۰.');
  const [,y,m,d]=match,year=Number(y),month=Number(m),day=Number(d);
  if(calendar==='gregorian')return fromGregorian(year,month,day);
  if(calendar!=='jalali')return invalid('تقویم پشتیبانی نمی‌شود.');
  if(year<1200||year>1700||month<1||month>12||day<1||day>(month<=6?31:month<=11?30:30))return invalid('تاریخ شمسی معتبر نیست.');
  if(month===12&&day===30&&!calendarYear(year).has('12/30'))return invalid('اسفند این سال ۲۹ روز دارد.');
  return {valid:true,year,month,day,calendar:'jalali',sourceCalendar:'jalali',normalized:`${year}/${String(month).padStart(2,'0')}/${String(day).padStart(2,'0')}`};
}
const monthNames=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
export function upcomingBirthdays(records,date=new Date(),days=30) {
  const today=todayParts(date),start=Date.UTC(today.gregorianYear,today.gregorianMonth-1,today.gregorianDay,12);
  const limit=Math.max(0,Math.min(366,Number(days)||0));
  const dates=[];
  for(let i=0;i<=limit;i++)dates.push({...parts(faDate,new Date(start+i*dayMillis)),daysUntil:i});
  const out=[];
  for(const record of records) {
    const birthday=birthdayInfo(record.birthday,record.birthdayCalendar||'jalali');
    if(!birthday.valid)continue;
    for(const day of dates) {
      const leapAdjusted=birthday.month===12&&birthday.day===30&&!calendarYear(day.year).has('12/30');
      const anniversaryDay=leapAdjusted?29:birthday.day;
      if(day.year>=birthday.year&&day.month===birthday.month&&day.day===anniversaryDay) {
        out.push({record,daysUntil:day.daysUntil,dateLabel:`${day.day} ${monthNames[day.month-1]}`,birthday:{year:day.year,month:day.month,day:day.day},leapAdjusted});
        break;
      }
    }
  }
  return out.sort((a,b)=>a.daysUntil-b.daysUntil||String(a.record.name).localeCompare(String(b.record.name),'fa'));
}

  const headerKey=value=>normalize(value).replace(/[\s\u200c\u200d\/()_\-:،.]+/g,'');
export function autoMap(headers) {
  const normalized=headers.map(headerKey),map={};
  for(const field of fields) {
    const aliases=[field.label,field.key,...(field.aliases||[])].map(headerKey);
    map[field.key]=normalized.findIndex(h=>aliases.includes(h));
  }
  // Survey question labels have polite verb endings rather than short column names.
  const hints={firstName:/^نامکوچک(?:دانشآموز|دانشاموز|خود)/,lastName:/^نامخانوادگی(?:دانشآموز|دانشاموز|خود)/,nationalId:/^کدملی(?:دانشآموز|دانشاموز|خود)/,grade:/^پایهتحصیلی/,studyField:/^رشتهتحصیلی(?:دانشآموز|دانشاموز)/,birthday:/^تاریختولد(?:دانشآموز|دانشاموز|خود)/,phone:/^تلفنهمراه(?:خوددانشآموز|خوددانشاموز|خودرا)/,motherPhone:/^تلفنهمراهمادر/,fatherPhone:/^تلفنهمراهپدر/,fatherName:/^نامپدر(?:دانشآموز|دانشاموز|خود)/,motherName:/^ناممادر(?:دانشآموز|دانشاموز)/,motherJob:/^شغلمادر/,fatherJob:/^شغلپدر/,address:/^آدرسمنزلخود/,homePhone:/^تلفنثابتمنزلخود/,studentCode:/^شمارهپرسنلیخود/,emergencyPhone:/^یکشمارهتلفنضروریجایگزین/,emergencyRelation:/^شمارهتلفنواردشدهمتعلقبهکیست/};
  for(const [key,pattern] of Object.entries(hints))if(map[key]===-1)map[key]=normalized.findIndex(h=>pattern.test(h));
  // The unqualified Persian «نام» is a first name when a surname is present.
  if(map.name===-1&&map.firstName!==-1&&map.lastName===-1) {map.name=map.firstName;map.firstName=-1;}
  return map;
}
function stableHash(value){let hash=2166136261;for(const ch of value){hash^=ch.codePointAt(0);hash=Math.imul(hash,16777619);}return(hash>>>0).toString(36);}
function cellText(value){return value==null?'':digits(value).replace(/\r\n?/g,'\n').trim();}
export function rowsToRecords(rows,mapping,type='student',calendar='jalali') {
  const records=[],errors=[],warnings=[];
  if(!Array.isArray(rows)||!rows.length)return {records,errors:['فایل خالی است.'],warnings};
  if(!['student','teacher'].includes(type))return {records,errors:['نوع پرونده معتبر نیست.'],warnings};
  const headers=rows[0],used=new Set(Object.values(mapping).filter(v=>Number.isInteger(v)&&v>=0)),seen=new Set();
  for(let i=1;i<rows.length;i++) {
    const row=rows[i];
    if(!Array.isArray(row)||row.every(v=>String(v??'').trim()===''))continue;
    const raw={};
    for(const field of fields){const index=mapping[field.key];raw[field.key]=Number.isInteger(index)&&index>=0?cellText(row[index]):'';}
    const name=raw.name||[raw.firstName,raw.lastName].filter(Boolean).join(' ');
    if(!name){errors.push(`ردیف ${i+1}: نام فرد مشخص نیست؛ این ردیف وارد نشد.`);continue;}
    const record={id:'',type,name,nationalId:raw.nationalId,studentCode:raw.studentCode,birthday:raw.birthday,birthdayCalendar:calendar,className:raw.className,grade:raw.grade,studyField:raw.studyField,fatherName:raw.fatherName,motherName:raw.motherName,fatherJob:raw.fatherJob,motherJob:raw.motherJob,subject:raw.subject,address:raw.address,phone:raw.phone,fatherPhone:raw.fatherPhone,motherPhone:raw.motherPhone,homePhone:raw.homePhone,emergencyPhone:raw.emergencyPhone,emergencyRelation:raw.emergencyRelation,notes:raw.notes,extras:{},photo:null};
    if(record.nationalId&&/^\d{8,9}$/.test(record.nationalId)){record.nationalId=record.nationalId.padStart(10,'0');warnings.push(`ردیف ${i+1}: صفر ابتدای کد ملی به طول ۱۰ رقم بازگردانده شد؛ بررسی کنید.`);}
    for(const [key] of contactFields)if(record[key]) {
      const compact=digits(record[key]).replace(/[\s()\-]+/g,'');
      if(/^\d{10}$/.test(compact)){record[key]='0'+compact;warnings.push(`ردیف ${i+1}: صفر ابتدای «${fields.find(f=>f.key===key).label}» بازگردانده شد؛ بررسی کنید.`);}
    }
    if(record.birthday) {
      const parsed=birthdayInfo(record.birthday,calendar);
      if(parsed.valid){record.birthday=parsed.normalized;record.birthdayCalendar='jalali';}
      else warnings.push(`ردیف ${i+1} (${name}): ${parsed.error} این فرد تا اصلاح تاریخ در فهرست تولد نمایش داده نمی‌شود.`);
    }
    for(let c=0;c<headers.length;c++)if(!used.has(c)&&String(row[c]??'').trim())record.extras[String(headers[c]||`ستون ${c+1}`)]=cellText(row[c]);
    const identity=record.nationalId?`national:${record.nationalId}`:record.studentCode?`code:${record.studentCode}`:`person:${normalize(name)}|${record.birthday}|${record.className}|${record.phone}|${record.fatherPhone}`;
    record.id=`${type}-${stableHash(identity)}`;
    if(seen.has(record.id)){warnings.push(`ردیف ${i+1} (${name}): شناسه تکراری است؛ این ردیف وارد نشد.`);continue;}
    seen.add(record.id);records.push(record);
  }
  return {records,errors,warnings};
}

export function importSchoolRows(rows,type) {
  if(!Array.isArray(rows)||!rows.length)return null;
  let headerRow=-1;
  for(let i=0;i<Math.min(5,rows.length);i++) {
    const head=rows[i]||[];
    if(type==='student'&&head.length>=33&&headerKey(head[0]).startsWith('نامکوچکدانش')&&headerKey(head[2]).startsWith('کدملیدانش')){headerRow=i;break;}
    if(type==='teacher'&&head.length>=64&&headerKey(head[0]).startsWith('نامکوچکخود')&&headerKey(head[8]).startsWith('کدملیخود')){headerRow=i;break;}
  }
  if(headerRow===-1)return null;
  const isTeacher=type==='teacher', mainHeaders=rows[headerRow],optionHeaders=isTeacher?(rows[headerRow+1]||[]):[];
  const headers=mainHeaders.map((h,c)=>{
    if(isTeacher&&c>=22&&c<=54)return `دروس تدریس · ${optionHeaders[c]||`گزینه ${c+1}`}`;
    if(isTeacher&&c>=57&&c<=62)return `ایام حضور · ${h}`;
    return cellText(h||(isTeacher&&rows[headerRow-1]?.[c])||`ستون ${c+1}`);
  });
  const offset=headerRow+(isTeacher?2:1),records=[],errors=[],warnings=[],seen=new Map();
  const columnMap=isTeacher?{firstName:0,lastName:1,fatherName:2,birthday:4,nationalId:8,address:10,homePhone:11,phone:12,emergencyPhone:13,emergencyRelation:14,studentCode:17}:{firstName:0,lastName:1,nationalId:2,grade:3,studyField:4,birthday:7,phone:12,motherName:15,motherPhone:20,motherJob:21,fatherName:23,fatherPhone:27,fatherJob:28,address:30,homePhone:32};
  for(let r=offset;r<rows.length;r++) {
    const row=rows[r];if(!Array.isArray(row)||row.every(v=>!String(v??'').trim()))continue;
    const result=rowsToRecords([headers,row],columnMap,type,'jalali');
    for(const message of result.errors)errors.push(message.replace('ردیف 2',`ردیف ${r+1}`));
    for(const message of result.warnings)warnings.push(message.replace('ردیف 2',`ردیف ${r+1}`));
    if(!result.records.length)continue;
    const record=result.records[0];record.sourceRow=r+1;record.extras={};
    for(const [key] of contactFields)if(record[key]) {
      record[key]=String(record[key]).split(/[,،;؛\n/|]+/).map(v=>phoneDigits(v)).filter(Boolean).join(' / ');
      if(key==='homePhone'&&record[key].split(' / ').some(v=>v.length===8))warnings.push(`ردیف ${r+1}: شماره منزل ۸ رقمی است و پیش‌شماره ندارد؛ پیش‌شماره حدس زده نشده است.`);
    }
    for(let c=0;c<headers.length;c++)if(row[c]!==null&&row[c]!==undefined&&String(row[c]).trim())record.extras[String(headers[c])]=cellText(row[c]);
    if(isTeacher) {
      record.subject=row.slice(22,55).map(cellText).filter(Boolean).join('، ');
      record.photoSource=cellText(row[3]);
    }else {
      record.motherName=[cellText(row[15]),cellText(row[16])].filter(Boolean).join(' ');
      record.motherBirthday=cellText(row[17]);record.fatherBirthday=cellText(row[24]);
      record.previousClass=cellText(row[6]);
      record.className='';
    }
    const duplicate=seen.get(record.id);
    if(duplicate) {
      record.duplicateOf=duplicate.id;
      record.id+=`-row-${r+1}`;
      warnings.push(`ردیف ${r+1} (${record.name}): شناسه با ردیف ${duplicate.sourceRow} یکسان است؛ هر دو پرونده برای بررسی حفظ شده‌اند.`);
    }else seen.set(record.id,record);
    records.push(record);
  }
  return {records,errors,warnings};
}

export function parseCSV(value) {
  const text=String(value??'').replace(/^\uFEFF/,'');
  // Choose a delimiter using only unquoted characters in the header.
  const counts={',':0,';':0,'\t':0};let quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){i++;continue;}quoted=!quoted;}
    if(!quoted&&(c==='\n'||c==='\r'))break;
    if(!quoted&&c in counts)counts[c]++;
  }
  const delimiter=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
  const rows=[];let row=[],cell='';quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"' && (quoted||cell==='')) {if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===delimiter&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){row.push(cell);rows.push(row);row=[];cell='';if(c==='\r'&&text[i+1]==='\n')i++;}
    else cell+=c;
  }
  if(quoted)throw new Error('علامت نقل‌قول در فایل CSV بسته نشده است.');
  if(cell||row.length){row.push(cell);rows.push(row);}
  return rows;
}
export function exportCSV(records) {
  const keys=fields.filter(f=>!['firstName','lastName'].includes(f.key));
  const protect=value=>{let s=String(value??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  return '\uFEFF'+[keys.map(f=>protect(f.label)).join(','),...records.map(r=>keys.map(f=>protect(r[f.key])).join(','))].join('\r\n');
}
