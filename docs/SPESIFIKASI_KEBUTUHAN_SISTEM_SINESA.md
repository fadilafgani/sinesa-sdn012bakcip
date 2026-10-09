# SPESIFIKASI KEBUTUHAN SISTEM (SOFTWARE REQUIREMENTS SPECIFICATION)
## SINESA — Sistem Nilai Dan Evaluasi Siswa Aktif
**Instansi:** SDN 012 Babakan Ciparay Kota Bandung  
**Versi Dokumen:** 2.0 (Production Release — Native PHP REST API & MySQL)  
**Tanggal Rilis:** Oktober 2026  

---

## 1. PENDAHULUAN

### 1.1 Deskripsi Umum Sistem
**SINESA** (*Sistem Nilai Dan Evaluasi Siswa Aktif*) adalah platform evaluasi pembelajaran dan kuis interaktif berbasis web yang dirancang untuk mendukung proses asesmen formatif dan sumatif secara *realtime* di lingkungan sekolah dasar. Sistem ini menyediakan interaksi langsung antara guru sebagai pemandu sesi (*host*) dan siswa sebagai peserta evaluasi dengan fitur gamifikasi, penilaian berbasis server, dukungan rumus matematika (LaTeX), serta pengawasan integritas ujian (*anti-cheat*).

### 1.2 Karakteristik Pengguna (User Roles)
Sistem membagi hak akses ke dalam 3 (tiga) peran pengguna:
1. **Administrator (Admin):** Pengelola utama sistem, konfigurasi instansi sekolah, manajemen akun pengguna, serta audit keamanan data.
2. **Guru (Teacher):** Pembuat master kuis, pengelola bank soal dan media, pemandu jalannya sesi live permainan (*game host*), serta pengunduh rekapitulasi nilai evaluasi.
3. **Murid (Student):** Peserta evaluasi yang bergabung ke sesi permainan menggunakan kode PIN atau akun terdaftar, menjawab soal secara interaktif, dan melihat hasil capaian belajar.

---

## 2. KEBUTUHAN FUNGSIONAL (FUNCTIONAL REQUIREMENTS / FR)

Kebutuhan fungsional mendefinisikan fitur, kapabilitas, dan alur operasional yang wajib disediakan oleh sistem.

### 2.1 Modul Autentikasi, Otorisasi, & Akun Pengguna
| Kode Kebutuhan | Nama Kebutuhan | Deskripsi Fungsional | Aktor Terkait |
|:---|:---|:---|:---:|
| **FR-AUTH-01** | Registrasi Akun | Pengguna dapat melakukan pendaftaran akun baru dengan memasukkan nama lengkap, email, nama pengguna (*username*), dan kata sandi. | Guru, Murid |
| **FR-AUTH-02** | Login Pengguna | Sistem mengotentikasi pengguna menggunakan email/username dan kata sandi, kemudian menerbitkan token sesi JWT (*Access Token* & *HttpOnly Refresh Token*). | Semua Peran |
| **FR-AUTH-03** | Pembatasan Hak Akses (RBAC) | Sistem membatasi hak akses pengguna berdasarkan perannya (*admin*, *teacher*, *student*). Pengguna yang tidak berhak dilarang mengakses rute atau endpoint API tertentu (HTTP 403 Forbidden). | Sistem |
| **FR-AUTH-04** | Perpanjangan Sesi (*Silent Refresh*) | Sistem memperbarui *access token* yang kedaluwarsa secara otomatis di latar belakang tanpa mengeluarkan pengguna dari aplikasi. | Semua Peran |
| **FR-AUTH-05** | Logout Pengguna | Pengguna dapat mengakhiri sesi, mencabut token autentikasi, dan membersihkan data penyimpanan lokal secara aman. | Semua Peran |
| **FR-AUTH-06** | Manajemen Profil Diri | Pengguna dapat melihat dan menyunting profil pribadi (nama lengkap, gelar pengajar, biodata, serta foto profil/avatar). | Guru, Murid |

---

### 2.2 Modul Manajemen Master Kuis & Bank Soal
| Kode Kebutuhan | Nama Kebutuhan | Deskripsi Fungsional | Aktor Terkait |
|:---|:---|:---|:---:|
| **FR-QUIZ-01** | Pembuatan Master Kuis | Guru dapat membuat kuis baru dengan mengisi judul, deskripsi, mata pelajaran, target kelas, durasi waktu pengerjaan per soal, jumlah nyawa (*lives*), dan mode permainan (*Serius* atau *Santai*). | Guru |
| **FR-QUIZ-02** | Pengaturan Fitur Kuis | Guru dapat mengaktifkan atau menonaktifkan fitur papan peringkat (*leaderboard*), pembatasan anti-cheat, penampilan kunci jawaban benar, dan pembahasan soal. | Guru |
| **FR-QUIZ-03** | Pembuatan Kode PIN Unik | Sistem secara otomatis meng-*generate* kode PIN 6 digit unik untuk setiap master kuis atau sesi live permainan. | Sistem, Guru |
| **FR-QUIZ-04** | Pengelolaan Butir Pertanyaan | Guru dapat menambah, menyunting urutan nomor soal (*ordering*), dan menghapus butir soal pada master kuis. | Guru |
| **FR-QUIZ-05** | Format Pilihan Ganda & Opsi Jawaban | Guru dapat menentukan pilihan jawaban (minimal 2 opsi, standar 4 opsi) dan menetapkan satu atau lebih kunci jawaban benar beserta bobot skor poin soal. | Guru |
| **FR-QUIZ-06** | Dukungan Rumus Matematika (LaTeX) | Sistem mendukung input dan perenderan formula matematika dan simbol ilmiah menggunakan format LaTeX (KaTeX) pada pertanyaan maupun opsi jawaban. | Guru, Murid |
| **FR-QUIZ-07** | Pengunggahan Media Soal | Guru dapat melampirkan berkas media (gambar, audio, video) sebagai stimulus pendukung pada setiap butir soal. | Guru |

---

### 2.3 Modul Sesi Live Evaluasi & Ruang Tunggu (Host Session)
| Kode Kebutuhan | Nama Kebutuhan | Deskripsi Fungsional | Aktor Terkait |
|:---|:---|:---|:---:|
| **FR-SESS-01** | Pembukaan Sesi Game (*Host Game*) | Guru dapat membuka sesi live kuis baru yang diawali dari ruang tunggu peserta (*Lobby*). | Guru |
| **FR-SESS-02** | Masuk Sesi Kuis (*Join via PIN*) | Murid dapat masuk ke ruang permainan dengan memasukkan 6 digit PIN sesi dan nama tampilan, baik dengan login akun maupun sebagai peserta tamu (*guest*). | Murid |
| **FR-SESS-03** | Pemantauan Peserta di Lobi | Guru dan murid di ruang tunggu dapat melihat daftar seluruh peserta yang telah terhubung secara *realtime* tanpa perlu memuat ulang peramban. | Guru, Murid |
| **FR-SESS-04** | Hitung Mundur Sesi (*Countdown*) | Guru dapat memulai sesi dan sistem memicu animasi hitung mundur (3-2-1) secara serentak di seluruh perangkat peserta. | Guru, Sistem |
| **FR-SESS-05** | Pengendalian Stage Soal | Guru memegang kendali penuh untuk memajukan fase kuis: membuka soal aktif, menampilkan pembahasan/kunci, membuka papan peringkat sementara, dan melanjutkan ke soal berikutnya. | Guru |
| **FR-SESS-06** | Sinkronisasi Waktu Mundur (*Timer*) | Sistem menyinkronkan sisa waktu pengerjaan soal di server secara tepat ke seluruh layar peramban murid. | Sistem |
| **FR-SESS-07** | Penyelesaian Sesi & Panggung Juara | Guru dapat menutup sesi kuis, menandai status kuis selesai (*completed*), dan menampilkan panggung podium 3 besar juara. | Guru, Murid |

---

### 2.4 Modul Gameplay Murid & Penyerahan Jawaban
| Kode Kebutuhan | Nama Kebutuhan | Deskripsi Fungsional | Aktor Terkait |
|:---|:---|:---|:---:|
| **FR-PLAY-01** | Tampilan Soal Interaktif | Murid menerima butir soal aktif, stimulus media, dan pilihan opsi jawaban secara langsung saat guru membuka stage pertanyaan. | Murid |
| **FR-PLAY-02** | Pengiriman Jawaban (*Submit Answer*) | Murid dapat memilih opsi jawaban dan menyerahkannya ke server sebelum durasi waktu soal berakhir. | Murid |
| **FR-PLAY-03** | Pencegahan Jawaban Ganda | Sistem memvalidasi dan menolak penyerahan jawaban lebih dari satu kali untuk butir soal yang sama oleh murid yang sama. | Sistem |
| **FR-PLAY-04** | Mode Nyawa Permainan (*Lives Mode*) | Jika kuis menerapkan mode nyawa (*lives*), sistem otomatis memotong jumlah sisa nyawa peserta apabila menjawab salah hingga kuis terkunci jika nyawa habis. | Sistem |
| **FR-PLAY-05** | Pergantian Layar Tanpa Refresh (*Zero Reload*) | Seluruh perubahan status dan transisi fase permainan berlangsung secara otomatis dan mulus di layar murid tanpa perlu menekan tombol *refresh* browser. | Sistem, Murid |

---

### 2.5 Modul Penilaian Atomik & Papan Peringkat (Scoring & Leaderboard)
| Kode Kebutuhan | Nama Kebutuhan | Deskripsi Fungsional | Aktor Terkait |
|:---|:---|:---|:---:|
| **FR-SCORE-01** | Validasi Kebenaran di Server | Penentuan kebenaran jawaban (`is_correct`) wajib dihitung di server berdasarkan kunci jawaban asli di basis data; server tidak mempercayai skor yang dikirim peramban. | Sistem |
| **FR-SCORE-02** | Transaksi Penilaian Atomik | Proses penilaian dieksekusi dalam transaksi basis data atomik (`BEGIN ... COMMIT / ROLLBACK`) untuk memastikan akumulasi total nilai dan pencatatan riwayat jawaban selalu konsisten. | Sistem |
| **FR-SCORE-03** | Papan Peringkat Live (*Live Leaderboard*) | Sistem menyusun urutan peringkat peserta secara dinamis berdasarkan total perolehan skor tertinggi dan kecepatan respon penyerahan jawaban. | Sistem, Guru, Murid |
| **FR-SCORE-04** | Kartu Nilai & Rekap Hasil Murid | Murid dapat melihat ringkasan performa pribadinya di akhir evaluasi (total perolehan nilai, peringkat, persentase akurasi, dan jumlah benar/salah). | Murid |

---

### 2.6 Modul Integritas Ujian & Pengawasan (Anti-Cheat)
| Kode Kebutuhan | Nama Kebutuhan | Deskripsi Fungsional | Aktor Terkait |
|:---|:---|:---|:---:|
| **FR-CHEAT-01** | Kewajiban Mode Layar Penuh (*Fullscreen*) | Sistem dapat mewajibkan murid mengaktifkan mode layar penuh saat mengerjakan soal; keluar dari mode layar penuh dicatat sebagai pelanggaran. | Sistem, Murid |
| **FR-CHEAT-02** | Deteksi Pindah Tab/Aplikasi | Sistem mendeteksi ketika peramban kehilangan fokus atau murid membuka tab/aplikasi lain, dan menambahkan hitungan pelanggaran (*violation count*). | Sistem |
| **FR-CHEAT-03** | Penguncian Otomatis Pelanggaran | Jika pelanggaran murid melebihi batas toleransi maksimal yang ditentukan guru, lembar soal otomatis di-*submit* dan akses ujian dikunci. | Sistem |

---

### 2.7 Modul Analisis, Rekapitulasi Nilai, & Ekspor Laporan
| Kode Kebutuhan | Nama Kebutuhan | Deskripsi Fungsional | Aktor Terkait |
|:---|:---|:---|:---:|
| **FR-REP-01** | Analisis Butir Soal | Guru dapat melihat telemetri statistik performa kuis: rata-rata nilai kelas, tingkat kesulitan soal, dan sebaran jawaban peserta pada setiap butir soal. | Guru |
| **FR-REP-02** | Rekapitulasi Nilai Peserta | Guru dapat melihat tabel daftar nilai seluruh siswa yang telah mengikuti sesi evaluasi. | Guru |
| **FR-REP-03** | Ekspor Laporan Hasil Ujian | Guru dapat mengunduh dokumen laporan nilai dalam format PDF siap cetak, berkas spreadsheet Microsoft Excel (.xlsx), atau format CSV. | Guru |

---

### 2.8 Modul Administrasi Sistem & Pengaturan Sekolah (Admin Panel)
| Kode Kebutuhan | Nama Kebutuhan | Deskripsi Fungsional | Aktor Terkait |
|:---|:---|:---|:---:|
| **FR-ADM-01** | Dashboard Statistik Global | Administrator dapat memantau telemetri sistem: total pengguna, total master kuis, total sesi live dimainkan, total jawaban diproses, dan penggunaan media penyimpanan. | Admin |
| **FR-ADM-02** | Manajemen Data Pengguna (CRUD) | Admin dapat menambah pengguna baru, melihat seluruh akun (dengan fitur pencarian dan filter peran/status), menyunting data akun, dan menghapus akun. | Admin |
| **FR-ADM-03** | Proteksi Akun Mandiri | Sistem mencegah administrator menghapus atau menonaktifkan akunnya sendiri saat sedang aktif masuk di sistem. | Sistem, Admin |
| **FR-ADM-04** | Reset Kata Sandi | Admin dapat mereset kata sandi akun guru atau murid yang mengalami kendala lupa sandi. | Admin |
| **FR-ADM-05** | Konfigurasi Identitas Sekolah | Admin dapat mengubah nama sekolah, alamat, NPSN, logo aplikasi, judul aplikasi, dan tema warna sistem. | Admin |
| **FR-ADM-06** | Pengaturan Izin Pendaftaran | Admin dapat membuka atau menutup akses registrasi mandiri untuk siswa baru maupun akses peserta tamu (*guest*). | Admin |
| **FR-ADM-07** | Pencatatan Jejak Aktivitas (*Audit Trail*) | Sistem mencatat seluruh riwayat tindakan penting (login, perubahan konfigurasi, mutasi pengguna) ke dalam log aktivitas admin. | Admin |

---

## 3. KEBUTUHAN NON-FUNGSIONAL (NON-FUNCTIONAL REQUIREMENTS / NFR)

Kebutuhan non-fungsional menetapkan kriteria kualitas teknis, batasan performa, keandalan, dan keamanan operasional perangkat lunak sesuai standar rekayasa perangkat lunak umum.

### 3.1 Keamanan (Security)
* **NFR-SEC-01 (Enkripsi Kata Sandi):** Seluruh kata sandi pengguna wajib dienkripsi satu arah menggunakan algoritma *hashing* standar industri (**Bcrypt**) dengan *cost factor* yang aman sebelum disimpan ke basis data.
* **NFR-SEC-02 (Otentikasi Token JWT):** Komunikasi sesi dilindungi menggunakan **JSON Web Token (JWT)** bertanda tangan kriptografi HS256, memisahkan antara *Access Token* berumur pendek (15 menit) dan *Refresh Token* (7 hari).
* **NFR-SEC-03 (Penyimpanan Token Aman):** *Refresh Token* disimpan di dalam *Cookie* bertipe `HttpOnly`, `SameSite=Strict`, dan `Secure` untuk mencegah pencurian token melalui celah *Cross-Site Scripting (XSS)*.
* **NFR-SEC-04 (Pencegahan SQL Injection):** Seluruh interaksi basis data pada backend wajib menggunakan *Prepared Statements* dengan *parameter binding* (PHP Data Objects / PDO).
* **NFR-SEC-05 (Integritas Nilai Server):** Penentuan kebenaran jawaban dan perhitungan skor wajib dilakukan secara eksklusif di sisi server (*Server-Side Verification*); sistem tidak boleh mempercayai klaim skor dari peramban client.
* **NFR-SEC-06 (Validasi Berkas Unggahan):** Sistem wajib memvalidasi berkas media yang diunggah berdasarkan tipe MIME asli (*content inspection*), membatasi kapasitas berkas maksimal (5MB gambar, 10MB audio/video), dan mengacak nama berkas simpanan.

---

### 3.2 Performa & Kecepatan Respon (Performance)
* **NFR-PERF-01 (Waktu Respon API):** Rata-rata waktu respon endpoint REST API untuk operasi standar (pemuatan kuis, verifikasi login, penyerahan jawaban) tidak boleh melebihi **1 detik** pada kondisi jaringan sekolah normal.
* **NFR-PERF-02 (Latensi Sinkronisasi Realtime):** Transmisi event pembaruan sesi live (pergantian soal dan timer) dari perangkat guru ke seluruh perangkat murid harus tersampaikan secara instan dengan latensi di bawah **1 detik**.
* **NFR-PERF-03 (Optimalisasi Bundel Web):** Aset frontend harus dioptimalkan melalui teknik pemisahan kode (*code splitting* pada Vite) agar ukuran unduhan awal aplikasi ringan dan waktu pemuatan halaman awal (*First Contentful Paint*) berada di bawah **2 detik**.
* **NFR-PERF-04 (Anti-Buffering Web Server):** Web server (LiteSpeed/Apache) dikonfigurasi tanpa penundaan buffer (*unbuffered streaming*) pada endpoint realtime agar paket data dialirkan secara instan ke peramban.

---

### 3.3 Keandalan & Integritas Data (Reliability)
* **NFR-REL-01 (Konsistensi Transaksi ACID):** Proses penyerahan jawaban, evaluasi skor, dan pembaruan poin peserta wajib dieksekusi di dalam transaksi basis data berstandar ACID (MySQL InnoDB) dengan mekanisme *Rollback* otomatis jika terjadi galat.
* **NFR-REL-02 (Pemulihan Sambungan Otomatis):** Klien realtime harus memiliki mekanisme *reconnect* otomatis (*Exponential Backoff* & *Heartbeat Watchdog*) jika sambungan internet pengguna terputus sesaat, tanpa menyebabkan data kuis hilang.
* **NFR-REL-03 (Penyaringan Duplikasi Event):** Klien realtime harus dilengkapi sistem proteksi memori (*bounded cache*) untuk menyaring event duplikat atau event lampau (*stale event*) akibat pengiriman ulang jaringan.

---

### 3.4 Ketersediaan Layanan (Availability)
* **NFR-AVL-01 (Tingkat Kesiapan / Uptime):** Aplikasi ditargetkan memiliki tingkat ketersediaan layanan (*uptime*) minimal **99%** selama jam operasional kegiatan belajar mengajar di sekolah.
* **NFR-AVL-02 (Kemandirian Infrastruktur):** Sistem beroperasi secara mandiri (*self-hosted*) pada web server standar (Apache / LiteSpeed) dan basis data relasional MySQL tanpa ketergantungan pada layanan cloud berbayar pihak ketiga (*Zero Vendor Lock-in*).

---

### 3.5 Kemudahan Penggunaan & Antarmuka (Usability)
* **NFR-USA-01 (Desain Responsif / Mobile-Friendly):** Antarmuka pengguna harus sepenuhnya adaptif dan proporsional saat diakses melalui smartphone (lebar layar mulai 360px), tablet, laptop, hingga monitor desktop.
* **NFR-USA-02 (Tanpa Muat Ulang Halaman / Zero Reload):** Selama sesi kuis live berjalan, seluruh perpindahan fase (menunggu di lobi &rarr; hitung mundur &rarr; lembar soal &rarr; hasil &rarr; podium) harus berlangsung reaktif tanpa menuntut murid melakukan *refresh* peramban fisik.
* **NFR-USA-03 (Keterbacaan Visual & Formula Matematika):** Tampilan teks soal, media gambar, dan simbol rumus matematika (KaTeX) harus disajikan dengan kontras warna yang jelas, tipografi tajam, dan mudah dipahami oleh peserta didik tingkat sekolah dasar.

---

### 3.6 Kompatibilitas (Compatibility)
* **NFR-CMP-01 (Kompatibilitas Lintas Peramban):** Aplikasi web harus dapat beroperasi secara konsisten pada seluruh peramban web modern populer, termasuk Google Chrome, Mozilla Firefox, Microsoft Edge, dan Apple Safari.
* **NFR-CMP-02 (Kompatibilitas Perangkat Keras & Sistem Operasi):** Sistem dapat diakses tanpa hambatan dari perangkat berbasis Android, iOS, Windows, macOS, maupun Linux tanpa memerlukan instalasi aplikasi khusus.

---

### 3.7 Kemudahan Pemeliharaan (Maintainability)
* **NFR-MNT-01 (Arsitektur Terpisah / Modular):** Kode program dibangun dengan arsitektur terpisah antara antarmuka pengguna (*Frontend SPA React 18*), logika pemrosesan data (*Backend REST API PHP*), dan lapisan penyimpanan (*MySQL InnoDB*).
* **NFR-MNT-02 (Pencatatan Jejak Audit):** Setiap modifikasi administratif dan aktivitas otentikasi penting tercatat di tabel log riwayat untuk mempermudah pemeliharaan, penelusuran kesalahan (*troubleshooting*), dan audit operasional sekolah.

---

## 4. MATRIKS KETERKAITAN KEBUTUHAN (TRACEABILITY MATRIX)

| Kategori Fungsional (FR) | Target Pengguna | Kebutuhan Non-Fungsional Pendukung (NFR) |
|---|:---:|---|
| **FR-AUTH (Autentikasi & Akun)** | Admin, Guru, Murid | NFR-SEC-01 (Bcrypt), NFR-SEC-02 (JWT), NFR-SEC-03 (HttpOnly Cookie) |
| **FR-QUIZ (Master Kuis & LaTeX)** | Guru | NFR-USA-03 (KaTeX Rendering), NFR-SEC-06 (Validasi Berkas) |
| **FR-SESS (Live Host & Orkestrasi)** | Guru, Murid | NFR-PERF-02 (Latensi < 1s), NFR-PERF-04 (Anti-Buffer Web Server) |
| **FR-PLAY (Gameplay Interaktif)** | Murid | NFR-USA-01 (Responsif), NFR-USA-02 (Zero Reload), NFR-REL-02 (Auto-Reconnect) |
| **FR-SCORE (Penilaian & Leaderboard)** | Guru, Murid | NFR-SCORE-01 (Server Scoring), NFR-REL-01 (ACID Transaction) |
| **FR-CHEAT (Pengawasan Anti-Cheat)** | Murid | NFR-SEC-05 (Integritas Ujian), NFR-REL-03 (Anti-Duplikasi) |
| **FR-REP (Analisis & Ekspor Nilai)** | Guru | NFR-PERF-03 (Pemisahan Bundel), NFR-CMP-01 (Cross-Browser) |
| **FR-ADM (Manajemen Panel Admin)** | Admin | NFR-SEC-04 (Prepared Statements), NFR-MNT-02 (Audit Trail) |

---
*Dokumen ini merupakan spesifikasi acuan resmi pengembangan dan pengujian sistem SINESA.*
