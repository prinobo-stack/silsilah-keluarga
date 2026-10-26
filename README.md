# Silsilah Bersama 0.4.0 — Render + Neon

Paket ini menjalankan web Silsilah di Render dan menyimpan akun, sesi, data keluarga, foto dalam arsip, dan usulan di PostgreSQL Neon. Tidak memakai cloudflared atau server HP. APK offline lama belum memperoleh sinkronisasi otomatis; penghubung Google Sheets belum disertakan.

## 1. Masukkan kode ke GitHub

Ekstrak ZIP ini di HP. Buka repository pribadi `prinobo-stack/silsilah-keluarga`. Pilih unggah file (Upload files; pada repository kosong ada tautan `uploading an existing file`). Unggah ISI folder hasil ekstraksi, bukan ZIP-nya dan bukan folder pembungkusnya. `package.json`, `server`, `src`, `scripts`, dan `dist` harus berada di halaman utama repository. Jangan unggah file database, cadangan keluarga, APK, atau kredensial.

Jika unggah lewat HP sulit, gunakan menu Chrome > Situs desktop. Simpan dengan Commit changes. Repository pribadi tetap dapat digunakan oleh Render yang sudah dihubungkan.

## 2. Isi Render

Pilih repository tersebut, lalu:

| Isian | Nilai |
|---|---|
| Name | silsilah-keluarga (atau nama unik lain) |
| Language | Node |
| Branch | Pilih branch yang benar-benar berisi kode; biasanya main atau master |
| Root Directory | Kosong |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Compute | Free $0/month |

Tambahkan Environment Variables:

- `NODE_VERSION`: `24.22.1`
- `DATABASE_URL`: di Neon buka Connect, pilih branch production dan koneksi pooled. Salin URI PostgreSQL saja (mulai `postgresql://`, tanpa `psql` dan tanpa tanda kutip), dengan `sslmode=require`. Tempel LANGSUNG ke Render; jangan ke chat, GitHub, atau file publik.
- `BOOTSTRAP_TOKEN`: tekan Generate di Render untuk membuat nilai acak, minimal 32 karakter. Simpan pribadi. Ini hanya untuk mengaktifkan pemilik pertama, bukan kode undangan keluarga.

Render otomatis menyediakan RENDER_EXTERNAL_URL, sehingga PUBLIC_ORIGIN tidak perlu diisi untuk alamat onrender.com. Jika memakai domain khusus kemudian, isi PUBLIC_ORIGIN dengan URL HTTPS domain tersebut dan deploy ulang.

Setelah seluruh kode dan variabel tersedia, tekan Deploy web service. Tunggu status Live. Jika gagal, kirim bagian log yang tidak memuat rahasia.

## 3. Aktifkan pemilik dan pindahkan data

Buka alamat HTTPS dari Render. Pada pengaturan akses, buat pemilik pertama memakai BOOTSTRAP_TOKEN yang sama. Buat nama akun dan sandi pribadi minimal 12 karakter. Jangan membuat pemilik dengan sandi yang dibagikan di chat.

Ekspor cadangan ZIP dari aplikasi atau web lama. Simpan cadangan asli di HP. Masuk sebagai pemilik cloud lalu impor cadangan tersebut dan sinkronkan. Periksa jumlah anggota, hubungan, dan foto sebelum membagikan alamat baru.

Cadangan keluarga bukan cadangan akun/sesi/usulan server. Akun keluarga lama perlu dibuat lagi oleh pemilik pada layanan baru; usulan yang masih menunggu di server lama tidak otomatis berpindah. Selesaikan atau catat usulan tersebut sebelum beralih. Jangan menghapus server/data lama selama pemeriksaan.

Anggota yang punya akun dapat mengajukan perubahan dan admin menyetujuinya. Pengunjung memperoleh tampilan pohon publik sesuai penyaringan aplikasi. Periksa dahulu apa yang terlihat sebagai pengunjung sebelum membagikan tautan.

## 4. Batas versi ini

- Render Free dapat tidur saat tidak ada pengunjung; pembukaan pertama bisa lebih lambat.
- Data resmi berada di Neon, bukan disk sementara Render. Simpan ekspor ZIP berkala secara terpisah.
- Alamat onrender.com tetap untuk layanan tersebut. HP boleh mati setelah migrasi berhasil.
- Domain DNSExit domainpriyo.work.gd belum dikonfigurasi oleh paket ini.
- Paket ini tidak memperbarui APK lama dan belum menyinkronkan Google Sheets. Kedua integrasi itu merupakan tahap lanjutan.

## Pemeriksaan pengembang

`npm ci`, `npm run build`. Untuk tes integrasi terhadap database PostgreSQL khusus pengujian (kosong dan terpisah dari data asli), isi TEST_DATABASE_URL dan jalankan `npm test`. Jangan menjalankan tes server pada database produksi.
