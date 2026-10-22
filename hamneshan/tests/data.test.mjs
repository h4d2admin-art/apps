import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const moduleText=await readFile(new URL('../dist/data.js',import.meta.url),'utf8');
const d=await import('data:text/javascript;base64,'+Buffer.from(moduleText).toString('base64'));

test('phone lookup keeps every collision, relationship and shared household',()=>{
  const records=[{id:'1',type:'student',name:'علي رضايي',fatherName:'حسن',fatherPhone:'+98 912 000 1234',motherPhone:'۰۹۳۵۰۰۰۱۲۳۴',homePhone:'۰۲۱۸۸۰۰۱۲۳۴'}, {id:'2',type:'student',name:'نگار',homePhone:'02188001234'}, {id:'3',type:'teacher',name:'دبیر',phone:'00989120001234'}];
  const result=d.searchRecords(records,'۱۲۳۴');
  assert.equal(result.length,3);
  assert.deepEqual(result[0].matches.filter(m=>m.kind==='phone').map(m=>m.role),['پدر','مادر','تلفن منزل']);
  assert.equal(result[2].matches[0].role,'دبیر');
  assert.equal(d.searchRecords(records,'+98 9120001234').length,2);
  assert.equal(d.searchRecords(records,'رضایی')[0].record.id,'1');
  assert.equal(d.searchRecords(records,'0001').length,0,'a middle phone fragment must not match');
  assert.equal(d.searchRecords([{id:'s',name:'صفر',phone:'09120000098'}],'۰۰۹۸').length,1,'a four-digit suffix is never mistaken for a country prefix');
  assert.equal(d.searchRecords([{id:'s',name:'صفر',phone:'09120001234',extras:{'تلفن همراه خود را وارد بفرمایید:':'989120001234'}}],'0001').length,0,'preserved raw phone columns must not introduce middle-fragment matches');
});
test('jobs, raw additional columns, class and role filtering',()=>{
  const records=[{id:'a',type:'student',name:'سارا',motherJob:'پزشك',fatherJob:'مهندس',className:'دهم الف',extras:{'محل خدمت مادر':'درمانگاه سپید'}},{id:'b',type:'teacher',name:'سیمین',subject:'ریاضی'}];
  assert.equal(d.searchRecords(records,'پزشک')[0].matches[0].label,'شغل مادر');
  assert.equal(d.searchRecords(records,'درمانگاه')[0].record.id,'a');
  assert.equal(d.searchRecords(records,'دهم الف')[0].record.id,'a');
  assert.equal(d.searchRecords(records,'',{type:'teacher'}).length,1);
  assert.equal(d.searchRecords(records,'',{job:'مهندس'})[0].record.id,'a');
});
test('strict calendars including Esfand leap dates and Gregorian Excel dates',()=>{
  assert.equal(d.birthdayInfo('۱۳۹۹/۱۲/۳۰').valid,true);
  assert.equal(d.birthdayInfo('۱۴۰۰/۱۲/۳۰').valid,false);
  assert.equal(d.birthdayInfo('۱۳۸۹/۰۷/۳۲').valid,false);
  assert.equal(d.birthdayInfo('2010/10/22').valid,false,'calendar must be explicit');
  assert.equal(d.birthdayInfo('2010-10-22','gregorian').normalized,'1389/07/30');
  assert.equal(d.birthdayInfo('2010-02-30','gregorian').valid,false);
  assert.equal(d.birthdayInfo(40473,'excel').normalized,'1389/07/30');
  assert.equal(d.birthdayInfo(60,'excel').valid,false);
});
test('Tehran midnight, upcoming across Nowruz, and nonleap Esfand 30 policy',()=>{
  assert.equal(d.todayParts(new Date('2026-10-21T21:00:00Z')).dateKey,'1405/07/30');
  const rs=[{id:'n',name:'نوروز',birthday:'1389/01/01'},{id:'l',name:'کبیسه',birthday:'1399/12/30'}];
  const upcoming=d.upcomingBirthdays(rs,new Date('2026-03-19T12:00:00Z'),3);
  assert.equal(upcoming[0].record.id,'l');assert.equal(upcoming[0].daysUntil,1);assert.equal(upcoming[0].leapAdjusted,true);
  assert.equal(upcoming[1].record.id,'n');assert.equal(upcoming[1].daysUntil,2);
});
test('CSV handles BOM, quotes, newlines, trailing empty cells, tab separator and malformed input',()=>{
  assert.deepEqual(d.parseCSV('\ufeffنام,یادداشت,شماره\r\n"سارا","سلام،\nدوست ""خوب""",۰۹۱۲\r\nعلی,,'),[['نام','یادداشت','شماره'],['سارا','سلام،\nدوست "خوب"','۰۹۱۲'],['علی','','']]);
  assert.deepEqual(d.parseCSV('نام\tنام خانوادگی\nعلی\tاحمدی'),[['نام','نام خانوادگی'],['علی','احمدی']]);
  assert.throws(()=>d.parseCSV('نام\n"بسته نشده'));
});
test('import maps split names, preserves unknown data, stable IDs, flags missing and duplicate rows',()=>{
  const rows=[['نام','نام خانوادگی','کد ملی','موبایل پدر','تاریخ تولد','شغل مادر','محل خدمت'],['علي','رضايي','0012345678','9120001234','1389/07/30','پزشک','تهران'],['علي','رضايي','0012345678','9120001234','1389/07/30','پزشک','تهران'],['','','','','','',''],['','','123','1234','1400/12/30','','']];
  const map=d.autoMap(rows[0]);
  assert.equal(map.firstName,0);assert.equal(map.lastName,1);assert.equal(map.fatherPhone,3);
  const result=d.rowsToRecords(rows,map);
  assert.equal(result.records.length,1);assert.equal(result.records[0].name,'علي رضايي');
  assert.equal(result.records[0].fatherPhone,'09120001234');
  assert.equal(result.records[0].extras['محل خدمت'],'تهران');
  assert.equal(result.errors.length,1);assert.ok(result.warnings.some(w=>w.includes('تکراری')));
  assert.equal(result.records[0].id,d.rowsToRecords(rows,map).records[0].id);
});
test('CSV output blocks formula cells',()=>{
  assert.match(d.exportCSV([{name:'=HYPERLINK("x")'}]),/"'=HYPERLINK/);
});
test('school-specific student import combines mother name and preserves previous-class meaning',()=>{
  const headers=Array(33).fill('');headers[0]='نام کوچک دانش آموز را وارد بفرمایید:';headers[1]='نام خانوادگی دانش آموز را وارد بفرمایید:';headers[2]='کد ملی دانش آموز را وارد بفرمایید:';headers[6]='کلاسی که سال قبل در آن مشغول به تحصیل بوده اید را انتخاب نمایید:';
  const row=Array(33).fill('');row[0]='نمونه';row[1]='آزمون';row[2]='0012345678';row[3]='دهم';row[4]='ریاضی';row[6]='1161';row[7]='1389/07/30';row[12]='989120001234';row[15]='مادر';row[16]='نمونه';row[32]='09120001234';
  const result=d.importSchoolRows([headers,row],'student');
  assert.equal(result.records[0].className,'');assert.equal(result.records[0].previousClass,'1161');
  assert.equal(result.records[0].motherName,'مادر نمونه');assert.equal(result.records[0].phone,'09120001234');
  assert.equal(result.records[0].studyField,'ریاضی');assert.equal(result.records[0].sourceRow,2);
  assert.equal(d.contacts(result.records[0]).find(c=>c.key==='homePhone').role,'شماره جایگزین منزل');
  headers[32]='تلفن ثابت منزل\r\nپیش شماره';row[30]='آدرس نمونه\r\nخط دوم';
  const crlf=d.importSchoolRows([headers,row],'student');
  const lf=d.importSchoolRows([headers.map(h=>h.replace(/\r\n/g,'\n')),row.map(v=>v.replace(/\r\n/g,'\n'))],'student');
  assert.deepEqual(crlf.records,lf.records,'SheetJS CRLF and openpyxl LF produce identical data and extra field names');
});
test('school-specific teacher import handles three header rows, subjects and duplicate identities',()=>{
  const sections=Array(64).fill(''),headers=Array(64).fill(''),options=Array(64).fill('');
  headers[0]='نام کوچک خود را وارد بفرمایید:';headers[8]='کد ملی خود را وارد بفرمایید:';options[22]='اقتصاد';options[44]='فیزیک';
  const a=Array(64).fill('');a[0]='دبیر';a[1]='نمونه';a[3]='https://example.invalid/private-photo';a[4]='1360/01/01';a[8]='0012345678';a[12]='989120001234';a[13]='989130001234';a[14]='همسر';a[22]='اقتصاد';a[44]='فیزیک';
  const b=[...a];b[1]='نمونهٔ دوم';
  const result=d.importSchoolRows([sections,headers,options,a,b],'teacher');
  assert.equal(result.records.length,2);assert.equal(result.records[0].subject,'اقتصاد، فیزیک');
  assert.equal(result.records[0].photo,null);assert.equal(result.records[0].sourceRow,4);
  assert.equal(d.contacts(result.records[0]).find(c=>c.key==='emergencyPhone').role,'همسر');
  assert.equal(result.records[1].duplicateOf,result.records[0].id);assert.notEqual(result.records[1].id,result.records[0].id);
  assert.ok(result.warnings.some(w=>w.includes('هر دو پرونده')));
  assert.equal(d.importSchoolRows([['نام'],['نمونه']],'teacher'),null);
});
