export function defaultFamilyPassword(): string {
 const bytes=crypto.getRandomValues(new Uint8Array(18));
 return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
export function defaultFamilyLogin(name:string):string{
 return name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,'.').replace(/[^a-z0-9._-]/g,'').slice(0,120);
}
