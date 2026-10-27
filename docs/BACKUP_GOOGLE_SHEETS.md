# Backup satu arah ke Google Sheets

Status: kode disiapkan di branch feature/backup-google-sheets. Belum terhubung ke Google dan belum dipublikasikan ke produksi.

## Pengaturan sekali setelah deploy tersedia

1. Buat spreadsheet pribadi baru khusus cadangan (jangan gunakan spreadsheet sekolah atau dokumen bersama tanpa izin). Catat ID dari URL `/spreadsheets/d/ID/edit`.
2. Pada Google Cloud project milik pengelola, aktifkan Google Sheets API, buat service account tanpa domain-wide delegation, dan buat kunci JSON untuk service account itu.
3. Bagikan spreadsheet kepada `client_email` di JSON tersebut dengan peran Editor. Tidak perlu membuat spreadsheet publik atau memberikan peran Editor pada seluruh Google Cloud project.
4. Di Netlify Project configuration → Environment variables tambahkan:
   - `SHEETS_SPREADSHEET_ID`: ID spreadsheet, bukan URL.
   - `SHEETS_CLIENT_EMAIL`: `client_email` service account.
   - `SHEETS_PRIVATE_KEY`: `private_key` dari JSON (baris baru nyata atau literal `\n` didukung). Tandai Contains secret values. Jangan beri awalan VITE_ dan jangan commit berkas JSON.
   Semua tersedia untuk runtime Functions, pada konteks Production. Pertahankan DATABASE_URL dan PUBLIC_ORIGIN yang sudah benar.
5. Publikasikan pembaruan dan environment setelah batas deploy memungkinkan. Masuk sebagai admin → Lainnya → Backup ke Google Sheets. Sinkronkan dulu, buka menu lagi, periksa revisi dan spreadsheet tujuan, pilih data pribadi bila diperlukan, lalu centang persetujuan dan Salin data resmi sekarang.
6. Periksa jumlah anggota, jenis hubungan, tanggal, nomor HP/NIK dengan nol awal, dan tab Info. Ulangi setelah perubahan tersinkron untuk salinan revisi baru. Rutinitas penyalinan data tidak membutuhkan deploy.

## Perilaku dan batas

- Hanya pemilik/admin dapat mengakses API; POST wajib origin situs yang diizinkan. Yang disalin snapshot resmi Neon, bukan unggahan browser atau usulan.
- Semua tab dibuat baru dalam satu batch atomik. Tab lama dan tab buatan pengguna tidak dihapus/ditimpa. Setiap tab bernama `Silsilah_r<revisi>_<UTC>_<acak>_<jenis>`.
- Nama dan teks dikirim sebagai stringValue sehingga tidak dijalankan sebagai rumus; nomor awal nol dan tanggal parsial tetap berupa teks. Foto/media tidak dikirim.
- Data aktif saja. Tautan ke anggota sampah dikecualikan. Default tidak menyertakan NIK, HP, agama, alamat, catatan, lokasi agenda, isi cerita dan profil keluarga; admin dapat menyertakannya secara eksplisit per penyalinan.
- Ini salinan tabular, bukan pengganti ZIP, belum mendukung pemulihan/impor dari Sheets, sinkron dua arah, maupun penjadwalan otomatis.
- Batas payload 1,8 MB dan teks per sel 45.000 unit UTF-16. Jika lebih, gunakan ZIP. Batas kapasitas spreadsheet Google tetap berlaku; tab lama dapat diarsipkan sendiri setelah ditinjau.
- Bila waktu tunggu habis, spreadsheet mungkin sudah menerima batch. Periksa tujuan sebelum mencoba lagi. Tidak ada retry otomatis.
- Tidak mengubah skema database, family revision, atau status usulan. Mencatat audit setelah Google mengonfirmasi keberhasilan.
- Kunci service account hanya di server; frontend tidak menerimanya. Akses token hanya dalam memori permintaan dan tidak dicatat. Rotasi/hapus kunci lewat Google Cloud bila tidak digunakan lagi.

## Verifikasi

Pengujian lokal memakai data fiktif dan mock HTTP: filter privasi, hubungan data aktif, string literal/formula, autentikasi JWT, batch atomik, dan kegagalan Google. Build TypeScript/Vite dan regresi domain dijalankan. Koneksi Google nyata, izin endpoint dengan PostgreSQL uji, dan pengujian tampilan browser belum diverifikasi; wajib uji satu spreadsheet cadangan setelah konfigurasi/deploy. Tidak ada data keluarga aktual yang dikirim dalam proses pengembangan.
