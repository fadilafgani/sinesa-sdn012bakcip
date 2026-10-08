# Panduan Pemetaan Migrasi Data (Supabase ke MySQL)
**Sistem Nilai Dan Evaluasi Siswa Aktif (SINESA)**  
*Dokumen Arsitektur & Spesifikasi Pemetaan Data Non-Destruktif*

---

## 1. Prinsip Utama & Kebijakan Migrasi

1. **Non-Destruktif (Zero Data Loss)**:
   - Supabase **TIDAK DIHAPUS** dan tetap dipertahankan sebagai referensi/cadangan.
   - Script migrasi menggunakan klausul `INSERT ... ON DUPLICATE KEY UPDATE` atau pengecekan eksistensi primary key.
   - **TIDAK MENGGUNAKAN** perintah `DROP TABLE`, `TRUNCATE TABLE`, atau `DELETE`.
   - Data yang sudah ada di database tujuan (MySQL) tidak akan terhapus.
2. **Integritas Relasional (Foreign Key Integrity)**:
   - Urutan eksekusi migrasi mengikuti *topological sort* pohon ketergantungan relasi antar-tabel.
3. **Idempotensi**:
   - Script migrasi dapat dijalankan berulang kali (*re-runnable*) tanpa menimbulkan duplikasi data atau error *constraint violation*.

---

## 2. Identifikasi Teknis

### A. Kompatibilitas UUID
- **Supabase (PostgreSQL)**: Tipe data native `UUID` (128-bit) yang disajikan dalam format teks 36 karakter standar (RFC 4122): `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`.
- **New Database (MySQL)**: Tipe data `VARCHAR(36)` dengan collation `utf8mb4_unicode_ci`.
- **Kompatibilitas**: **100% Identik (Character-for-Character)**. Tidak ada hashing, pemotongan, atau konversi representasi heksadesimal. Seluruh kunci asing (foreign key) tetap mereferensikan UUID asli yang sama persis.

### B. Urutan Ketergantungan Foreign Key (Topological Order)
Untuk mencegah pelanggaran relasi foreign key saat import, urutan pemindahan data diatur secara ketat sebagai berikut:

```
[Level 0] profiles & users (Entitas Mandiri / Root)
    │
    ├── [Level 1] quizzes (Membutuhkan teacher_id -> profiles.id)
    │       │
    │       ├── [Level 2] questions (Membutuhkan quiz_id -> quizzes.id)
    │       │       │
    │       │       └── [Level 3] options (Membutuhkan question_id -> questions.id)
    │       │
    │       └── [Level 2] quiz_sessions (Membutuhkan quiz_id & host_id -> profiles.id)
    │               │
    │               └── [Level 3] participants (Membutuhkan session_id & student_id)
    │                       │
    │                       └── [Level 4] answers (Membutuhkan participant_id, question_id, option_id)
    │
    ├── [Level 1] activity_logs (Membutuhkan user_id -> profiles.id)
    ├── [Level 1] media_files (Membutuhkan user_id -> profiles.id)
    └── [Level 0] settings (Entitas Mandiri / Key-Value)
```

> **Safety Mechanism**: Script migrasi mengeksekusi `SET FOREIGN_KEY_CHECKS = 0;` sebelum batch insert dan mengaktifkannya kembali dengan `SET FOREIGN_KEY_CHECKS = 1;` setelah verifikasi selesai.

### C. Konversi Timestamp
- **Supabase**: String ISO 8601 berserta zona waktu: `YYYY-MM-DDTHH:MM:SS.uuuuuu+00:00` atau `...Z`.
- **MySQL**: Tipe data `DATETIME` (`YYYY-MM-DD HH:MM:SS`) atau `DATETIME(3)` (`YYYY-MM-DD HH:MM:SS.uuu`).
- **Aturan Konversi**:
  ```php
  function transform_timestamp(?string $iso): ?string {
      if (!$iso || trim($iso) === '') return null;
      try {
          $dt = new DateTime($iso);
          return $dt->format('Y-m-d H:i:s');
      } catch (Exception $e) {
          return date('Y-m-d H:i:s');
      }
  }
  ```

### D. Penyelarasan ENUM
Seluruh nilai enum pada Supabase telah disesuaikan 1:1 pada schema MySQL:
- `user_role` -> `ENUM('admin', 'teacher', 'student')`
- `quiz_mode` -> `ENUM('serius', 'santai')`
- `question_type` -> `ENUM('multiple_choice', 'true_false', 'multiple_answer', 'matching')`
- `media_type` -> `ENUM('text', 'image', 'audio', 'video', 'latex')`
- `status` (quiz_sessions) -> `ENUM('lobby', 'active', 'completed')`
- `current_stage` -> `ENUM('waiting', 'countdown', 'question', 'question_result', 'leaderboard', 'finished')`
- `file_type` -> `ENUM('image', 'audio', 'document')`

### E. Penanganan Nullable & Default Values
- Nilai `NULL` pada Supabase untuk `description`, `avatar_url`, `media_url`, `student_id`, `explanation`, `match_text`, dan `completed_at` dipertahankan sebagai `NULL`.
- Kolom baru yang tidak ada pada Supabase lama diberi nilai default yang aman:
  - `quizzes.quiz_mode`: `'serius'`
  - `quizzes.lives_count`: `3`
  - `participants.lives`: `3`
  - `participants.violation_count`: `0`
  - `participants.is_completed`: `0`
  - `profiles.status`: `'active'`

### F. Kompatibilitas Password Hash
- Supabase Auth menggunakan algoritma **Bcrypt** (`$2a$`, `$2b$`, atau `$2y$`).
- PHP native (`password_verify` dan `password_hash`) **100% kompatibel** dengan hash bcrypt `$2a$` dan `$2b$` dari PostgreSQL GoTrue.
- Jika hash password diekspor via Service Role atau database dump, hash tersebut langsung disalin ke kolom `profiles.password_hash` tanpa re-hashing.
- Jika diekspor via REST API publik (Anon key yang memproteksi tabel `auth.users`), akun profil tetap dimigrasikan dengan hash sementara yang aman dan status aktif.

---

## 3. Matriks Pemetaan Kolom (11 Entitas)

### 1. `users` & `profiles`
| Supabase Source (`auth.users` / `public.profiles`) | Target MySQL (`profiles`) | Tipe Data Target | Catatan Transformasi |
|---|---|---|---|
| `profiles.id` / `auth.users.id` | `id` | `VARCHAR(36)` | PK UUID langsung |
| `profiles.role` | `role` | `ENUM('admin','teacher','student')` | Default 'student' jika kosong |
| `profiles.full_name` / `user_metadata.full_name` | `full_name` | `VARCHAR(255)` | Fallback ke bagian depan email jika null |
| `auth.users.email` / `user_metadata.email` | `email` | `VARCHAR(255)` | Disanitasi huruf kecil (lowercase) |
| `auth.users.encrypted_password` | `password_hash` | `VARCHAR(255)` | Langsung disalin jika ada, atau fallback hash bcrypt aman |
| `user_metadata.username` | `username` | `VARCHAR(100)` | Nullable, fallback dari awalan email jika null |
| `profiles.avatar_url` | `avatar_url` | `VARCHAR(500)` | Nullable |
| - | `status` | `ENUM('active','inactive')` | Default 'active' |
| `profiles.created_at` | `created_at` | `DATETIME` | Format Y-m-d H:i:s |
| `auth.users.updated_at` | `updated_at` | `DATETIME` | Format Y-m-d H:i:s |

---

### 2. `quizzes`
| Supabase Source (`public.quizzes`) | Target MySQL (`quizzes`) | Tipe Data Target | Catatan Transformasi |
|---|---|---|---|
| `id` | `id` | `VARCHAR(36)` | PK UUID |
| `teacher_id` | `teacher_id` | `VARCHAR(36)` | FK ke `profiles.id` |
| `title` | `title` | `VARCHAR(255)` | - |
| `description` | `description` | `TEXT` | Nullable |
| `opening_text` | `opening_text` | `TEXT` | Default NULL |
| `closing_text` | `closing_text` | `TEXT` | Default NULL |
| `pin_code` | `pin_code` | `VARCHAR(10)` | UNIQUE PIN |
| `duration_per_question` | `duration_per_question` | `INT` | Default 30 detik |
| `random_questions` | `random_questions` | `TINYINT(1)` | Boolean casting (0/1) |
| `random_options` | `random_options` | `TINYINT(1)` | Boolean casting (0/1) |
| `thumbnail_url` | `thumbnail_url` | `VARCHAR(500)` | Nullable |
| `quiz_mode` | `quiz_mode` | `ENUM('serius','santai')` | Default 'serius' |
| `lives_count` | `lives_count` | `INT` | Default 3 |
| `show_final_result` | `show_final_result` | `TINYINT(1)` | Default 1 |
| `show_leaderboard` | `show_leaderboard` | `TINYINT(1)` | Default 1 |
| `show_correct_answer` | `show_correct_answer` | `TINYINT(1)` | Default 1 |
| `show_answer_review` | `show_answer_review` | `TINYINT(1)` | Default 1 |
| `show_question_result` | `show_question_result` | `TINYINT(1)` | Default 1 |
| `show_explanation` | `show_explanation` | `TINYINT(1)` | Default 1 |
| `show_score_per_question` | `show_score_per_question` | `TINYINT(1)` | Default 1 |
| `show_question_statistics` | `show_question_statistics` | `TINYINT(1)` | Default 1 |
| `anti_cheat_enabled` | `anti_cheat_enabled` | `TINYINT(1)` | Default 0 |
| `fullscreen_required` | `fullscreen_required` | `TINYINT(1)` | Default 0 |
| `auto_submit_on_violation` | `auto_submit_on_violation` | `INT` | Default 3 |
| `status` | `status` | `ENUM('active','inactive')` | Default 'active' |
| `created_at` | `created_at` | `DATETIME` | Format Y-m-d H:i:s |
| `updated_at` | `updated_at` | `DATETIME` | Format Y-m-d H:i:s |

---

### 3. `questions`
| Supabase Source (`public.questions`) | Target MySQL (`questions`) | Tipe Data Target | Catatan Transformasi |
|---|---|---|---|
| `id` | `id` | `VARCHAR(36)` | PK UUID |
| `quiz_id` | `quiz_id` | `VARCHAR(36)` | FK ke `quizzes.id` |
| `question_text` | `question_text` | `TEXT` | Teks butir soal |
| `question_type` | `question_type` | `ENUM(...)` | Default 'multiple_choice' |
| `media_type` | `media_type` | `ENUM(...)` | 'text','image','audio','video','latex' |
| `media_url` | `media_url` | `VARCHAR(500)` | Nullable |
| `points` | `points` | `INT` | Default 100 poin |
| `order_index` | `order_index` | `INT` | Urutan soal |
| `explanation` | `explanation` | `TEXT` | Pembahasan/penjelasan soal (Nullable) |
| `created_at` | `created_at` | `DATETIME` | Format Y-m-d H:i:s |

---

### 4. `options`
| Supabase Source (`public.options`) | Target MySQL (`options`) | Tipe Data Target | Catatan Transformasi |
|---|---|---|---|
| `id` | `id` | `VARCHAR(36)` | PK UUID |
| `question_id` | `question_id` | `VARCHAR(36)` | FK ke `questions.id` |
| `option_text` | `option_text` | `TEXT` | Teks opsi jawaban |
| `is_correct` | `is_correct` | `TINYINT(1)` | Boolean casting (0/1) |
| `match_text` | `match_text` | `TEXT` | Pasangan soal menjodohkan (Nullable) |
| `created_at` | `created_at` | `DATETIME` | Format Y-m-d H:i:s |

---

### 5. `quiz_sessions` (sessions)
| Supabase Source (`public.quiz_sessions`) | Target MySQL (`quiz_sessions`) | Tipe Data Target | Catatan Transformasi |
|---|---|---|---|
| `id` | `id` | `VARCHAR(36)` | PK UUID |
| `quiz_id` | `quiz_id` | `VARCHAR(36)` | FK ke `quizzes.id` |
| `host_id` | `host_id` | `VARCHAR(36)` | FK ke `profiles.id` |
| `status` | `status` | `ENUM('lobby','active','completed')` | Status sesi |
| `current_stage` | `current_stage` | `ENUM(...)` | 'waiting','countdown','question', dsb |
| `current_question_index` | `current_question_index` | `INT` | Index soal aktif (default -1) |
| `question_started_at` | `question_started_at` | `DATETIME(3)` | Waktu mulai soal |
| `question_expires_at` | `question_expires_at` | `DATETIME(3)` | Waktu batas soal |
| `quiz_mode` | `quiz_mode` | `ENUM('serius','santai')` | Diambil dari kuis atau default 'serius' |
| `lives_count` | `lives_count` | `INT` | Default 3 |
| `anti_cheat_enabled` | `anti_cheat_enabled` | `TINYINT(1)` | Default 0 |
| `fullscreen_required` | `fullscreen_required` | `TINYINT(1)` | Default 0 |
| `auto_submit_on_violation`| `auto_submit_on_violation`| `INT` | Default 3 |
| `created_at` | `created_at` | `DATETIME` | Format Y-m-d H:i:s |
| `completed_at` | `completed_at` | `DATETIME` | Nullable |

---

### 6. `participants`
| Supabase Source (`public.participants`) | Target MySQL (`participants`) | Tipe Data Target | Catatan Transformasi |
|---|---|---|---|
| `id` | `id` | `VARCHAR(36)` | PK UUID |
| `session_id` | `session_id` | `VARCHAR(36)` | FK ke `quiz_sessions.id` |
| `student_id` | `student_id` | `VARCHAR(36)` | FK ke `profiles.id` (Nullable) |
| `display_name` | `display_name` | `VARCHAR(100)` | Nama tampilan peserta |
| `score` | `score` | `INT` | Skor total akumulasi server |
| `lives` | `lives` | `INT` | Default 3 sisa nyawa |
| `skipped_questions` | `skipped_questions` | `JSON` | Array JSON soal terlewati |
| `question_status` | `question_status` | `JSON` | Object JSON status soal |
| `current_progress` | `current_progress` | `INT` | Default 0 |
| `violation_count` | `violation_count` | `INT` | Default 0 |
| `is_completed` | `is_completed` | `TINYINT(1)` | Boolean casting |
| `joined_at` | `joined_at` | `DATETIME` | Format Y-m-d H:i:s |

---

### 7. `answers`
| Supabase Source (`public.answers`) | Target MySQL (`answers`) | Tipe Data Target | Catatan Transformasi |
|---|---|---|---|
| `id` | `id` | `VARCHAR(36)` | PK UUID |
| `participant_id` | `participant_id` | `VARCHAR(36)` | FK ke `participants.id` |
| `question_id` | `question_id` | `VARCHAR(36)` | FK ke `questions.id` |
| `selected_option_id` | `selected_option_id` | `VARCHAR(36)` | FK ke `options.id` (Nullable) |
| `selected_option_ids` | `selected_option_ids` | `JSON` | Nullable |
| `matching_answers` | `matching_answers` | `JSON` | Nullable |
| `is_correct` | `is_correct` | `TINYINT(1)` | Boolean casting |
| `response_time_ms` | `response_time_ms` | `INT` | Durasi respons (milidetik) |
| `score_awarded` | `score_awarded` | `INT` | Poin didapat dari server |
| `answered_at` | `answered_at` | `DATETIME` | Format Y-m-d H:i:s |

---

### 8. `settings` (`system_settings`)
| Supabase Source (`public.system_settings`) | Target MySQL (`settings`) | Tipe Data Target | Catatan Transformasi |
|---|---|---|---|
| `key` | `key` | `VARCHAR(100)` | PK Kunci konfigurasi |
| `value` | `value` | `TEXT` | Nilai konfigurasi |
| `updated_at` | `updated_at` | `DATETIME` | Format Y-m-d H:i:s |

---

### 9. `activity_logs`
| Supabase Source (`public.activity_logs`) | Target MySQL (`activity_logs`) | Tipe Data Target | Catatan Transformasi |
|---|---|---|---|
| `id` | `id` | `VARCHAR(36)` | PK UUID |
| `user_id` | `user_id` | `VARCHAR(36)` | FK ke `profiles.id` (Nullable) |
| `action` | `action` | `VARCHAR(100)` | Kode aksi audit |
| `details` | `details` | `TEXT` | Keterangan rincian log |
| `created_at` | `created_at` | `DATETIME` | Format Y-m-d H:i:s |

---

### 10. `media_files` (Media Metadata)
| Supabase Source (`storage.objects` / metadata) | Target MySQL (`media_files`) | Tipe Data Target | Catatan Transformasi |
|---|---|---|---|
| `id` | `id` | `VARCHAR(36)` | PK UUID |
| `owner` | `user_id` | `VARCHAR(36)` | FK ke `profiles.id` |
| `name` | `original_name` | `VARCHAR(255)` | Nama berkas asli |
| `name` | `stored_name` | `VARCHAR(255)` | Nama simpan unik di server |
| `bucket_id` + path | `file_path` | `VARCHAR(500)` | Path penyimpanan lokal |
| `metadata.mimetype` | `file_type` | `ENUM('image','audio','document')` | Ditentukan dari mime type |
| `metadata.mimetype` | `mime_type` | `VARCHAR(100)` | Mime type lengkap |
| `metadata.size` | `file_size` | `BIGINT` | Ukuran berkas (bytes) |
| `created_at` | `created_at` | `DATETIME` | Format Y-m-d H:i:s |
