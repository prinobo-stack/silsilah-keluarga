export function historyCursor(value:string|null):string|null {
 if(value===null)return null;
 if(!/^[1-9]\d{0,18}$/.test(value)||BigInt(value)>9223372036854775807n)throw Error('Penanda halaman riwayat tidak valid.');
 return value;
}
export function historyLabel(action:string){
 const [kind,ref,version]=action.split(':');
 const labels:Record<string,string>={rebase:'Menyiapkan ulang usulan dari bagian terpilih',privacy:'Mengubah pengaturan privasi publik',login:'Masuk akun',setup:'Aktivasi admin pertama',password:'Mengganti kata sandi sendiri','create-member':'Membuat akun keluarga','reset-password':'Mengatur ulang kata sandi anggota',member:'Mengubah peran atau status akun keluarga',approve:'Menyetujui usulan',reject:'Menolak usulan',proposal:'Mengirim atau memperbarui usulan'};
 if(kind==='sheets-backup')return 'Menyalin data resmi ke Google Sheets · revisi '+(ref??'?');
 if(kind==='snapshot')return 'Menyimpan data keluarga ke server · revisi '+(ref??'?');
 if(kind==='proposal')return labels[kind]+(version?' · versi '+version:'');
 return labels[kind]??'Aktivitas server';
}
