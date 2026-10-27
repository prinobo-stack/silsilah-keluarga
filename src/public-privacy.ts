export interface PublicPrivacy {enabled:boolean;photos:boolean;nicknames:boolean}
export const DEFAULT_PUBLIC_PRIVACY:Readonly<PublicPrivacy>={enabled:true,photos:false,nicknames:false};
export function parsePublicPrivacy(value:unknown):PublicPrivacy{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Pengaturan privasi tidak valid.');
 const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['enabled','photos','nicknames'].includes(k))||['enabled','photos','nicknames'].some(k=>typeof v[k]!=='boolean'))throw Error('Pengaturan privasi tidak valid.');
 return {enabled:v.enabled as boolean,photos:v.photos as boolean,nicknames:v.nicknames as boolean};
}
export const privacyKey=(p:PublicPrivacy)=>`${Number(p.enabled)}${Number(p.photos)}${Number(p.nicknames)}`;
