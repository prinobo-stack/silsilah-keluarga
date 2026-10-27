import {sign,randomInt,randomBytes} from 'node:crypto';
import {resolveAddress,type State} from '../src/domain.ts';
export interface SheetsConfig {spreadsheetId:string;email:string;privateKey:string;}
export function sheetsConfig(env:NodeJS.ProcessEnv=process.env):SheetsConfig|null {
 const spreadsheetId=env.SHEETS_SPREADSHEET_ID?.trim(),email=env.SHEETS_CLIENT_EMAIL?.trim(),privateKey=env.SHEETS_PRIVATE_KEY?.replace(/\\n/g,'\n');
 if(!spreadsheetId||!email||!privateKey)return null;
 if(!/^[a-zA-Z0-9_-]{10,200}$/.test(spreadsheetId)||!email.endsWith('.iam.gserviceaccount.com')||!privateKey.includes('BEGIN PRIVATE KEY'))return null;
 return {spreadsheetId,email,privateKey};
}
export function backupTables(s:State,revision:number,privateFields:boolean,at:string){
 const people=s.persons.filter(p=>!p.deletedAt),ids=new Set(people.map(p=>p.id));
 const tables:{name:string;rows:string[][]}[]=[
 {name:'Info',rows:[['Keterangan','Nilai'],['Keluarga',s.familyName],['Revisi resmi',String(revision)],['Waktu UTC',at],['Biodata pribadi',privateFields?'Disertakan':'Tidak disertakan'],['Catatan','Salinan satu arah data aktif. Foto, akun, sandi, token, sampah dan usulan tidak disertakan. Gunakan ZIP untuk cadangan lengkap.']]},
 {name:'Anggota',rows:[['ID','Nama','Panggilan','Jenis kelamin','Status','Lahir','Perkiraan lahir','Wafat','Tempat lahir',...(privateFields?['NIK','Nomor HP','Agama','Alamat berlaku','Catatan']:[])],...people.map(p=>[p.id,p.name,p.nickname,p.sex,p.status,p.birth,String(p.birthApprox),p.death,p.place,...(privateFields?[p.nik??'',p.phone??'',p.religion??'',resolveAddress(s,p.id).address,p.notes]:[])])]},
 {name:'OrangTua',rows:[['ID','ID orang tua','ID anak','Jenis hubungan','Peran'],...s.parents.filter(p=>ids.has(p.parentId)&&ids.has(p.childId)).map(p=>[p.id,p.parentId,p.childId,p.kind,p.role])]},
 {name:'Pasangan',rows:[['ID','ID anggota 1','ID anggota 2','Status','Mulai','Selesai',...(privateFields?['Catatan']:[])],...s.unions.filter(u=>u.members.every(id=>ids.has(id))).map(u=>[u.id,...u.members,u.status,u.start,u.end,...(privateFields?[u.notes]:[])])]},
 {name:'Saudara',rows:[['ID','ID lebih tua','ID lebih muda',...(privateFields?['Catatan']:[])],...(s.siblings??[]).filter(l=>ids.has(l.olderId)&&ids.has(l.youngerId)).map(l=>[l.id,l.olderId,l.youngerId,...(privateFields?[l.notes]:[])])]},
 {name:'Agenda',rows:[['ID','Acara','Tanggal','Jam',...(privateFields?['Lokasi','Catatan']:[])],...(s.events??[]).map(e=>[e.id,e.title,e.date,e.time,...(privateFields?[e.location,e.notes]:[])])]},
 ];
 if(privateFields){tables.push({name:'Cerita',rows:[['ID','Judul','Tanggal','Isi','ID anggota'],...s.memories.map(m=>[m.id,m.title,m.date,m.body,m.personIds.filter(id=>ids.has(id)).join(', ')])]});tables.push({name:'Profil',rows:[['Sejarah','Asal-usul','Tokoh pendahulu'],[s.familyProfile?.history??'',s.familyProfile?.origins??'',s.familyProfile?.ancestors??'']]});}
 return tables;
}
// Explicit stringValue prevents names such as =IMPORTXML(...) becoming formulas.
export function sheetsRequests(tables:ReturnType<typeof backupTables>,prefix:string,existingIds:number[]=[]){
 const used=new Set(existingIds),requests:unknown[]=[];
 for(const t of tables){let sheetId:number;do{sheetId=randomInt(1,2147483647);}while(used.has(sheetId));used.add(sheetId);
 const cols=t.rows.reduce((max,r)=>Math.max(max,r.length),1);
 if(t.rows.some(r=>r.some(c=>c.length>45000)))throw Error('Ada teks terlalu panjang untuk Google Sheets. Gunakan cadangan ZIP.');
 requests.push({addSheet:{properties:{sheetId,title:prefix+'_'+t.name,gridProperties:{rowCount:Math.max(2,t.rows.length),columnCount:cols,frozenRowCount:1}}}},
 {updateCells:{start:{sheetId,rowIndex:0,columnIndex:0},rows:t.rows.map(row=>({values:row.map(text=>({userEnteredValue:{stringValue:text}}))})),fields:'userEnteredValue'}});
 }
 const body=JSON.stringify({requests});if(Buffer.byteLength(body)>1800000)throw Error('Data terlalu besar untuk satu salinan Google Sheets. Gunakan cadangan ZIP.');return body;
}
export async function sendSheetsBackup(config:SheetsConfig,tables:ReturnType<typeof backupTables>,revision:number,request:typeof fetch=fetch){
 const deadline=AbortSignal.timeout(22000);
 const now=Math.floor(Date.now()/1000),base=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const unsigned=base({alg:'RS256',typ:'JWT'})+'.'+base({iss:config.email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+300});
 const assertion=unsigned+'.'+sign('RSA-SHA256',Buffer.from(unsigned),config.privateKey).toString('base64url');
 const tokenResponse=await request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:deadline});
 if(!tokenResponse.ok)throw Error('Koneksi Google belum berhasil. Periksa email dan kunci service account di server.');
 const token=await tokenResponse.json() as {access_token?:string};if(!token.access_token)throw Error('Google tidak memberikan akses.');
 const root='https://sheets.googleapis.com/v4/spreadsheets/'+config.spreadsheetId;
 const headers={Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'};
 const info=await request(root+'?fields=sheets.properties.sheetId',{headers,signal:deadline});
 if(!info.ok)throw Error('Spreadsheet belum dapat diakses. Periksa ID, aktifkan Sheets API, dan bagikan spreadsheet sebagai Editor kepada service account.');
 const metadata=await info.json() as {sheets?:{properties:{sheetId:number}}[]};
 const prefix='Silsilah_r'+revision+'_'+new Date().toISOString().replace(/\D/g,'').slice(0,14)+'_'+randomBytes(3).toString('hex');
 const body=sheetsRequests(tables,prefix,metadata.sheets?.map(s=>s.properties.sheetId));
 const result=await request(root+':batchUpdate',{method:'POST',headers,body,signal:deadline});
 if(!result.ok)throw Error('Google belum menerima salinan. Periksa kapasitas spreadsheet dan coba lagi.');
 return {revision,url:'https://docs.google.com/spreadsheets/d/'+config.spreadsheetId,prefix};
}
