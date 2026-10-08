SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';
SET NAMES utf8mb4;

-- MySQL dump 10.13  Distrib 8.0.30, for Win64 (x86_64)
--
-- Host: localhost    Database: sinesa_db
-- ------------------------------------------------------
-- Server version	8.0.30

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `activity_logs`
--

DROP TABLE IF EXISTS `activity_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_logs` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `details` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_activity_logs_user_id` (`user_id`),
  KEY `idx_activity_logs_created_at` (`created_at` DESC),
  CONSTRAINT `fk_activity_logs_user` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `activity_logs`
--

LOCK TABLES `activity_logs` WRITE;
/*!40000 ALTER TABLE `activity_logs` DISABLE KEYS */;
INSERT INTO `activity_logs` VALUES ('0517dfd0-2bc8-43b5-8eec-553855445574','11111111-1111-1111-1111-111111111111','EDIT_USER','Mengedit akun pengguna: User Temp Regression (95888e9c-f811-4042-8307-a5d09134515f)','2026-10-08 10:27:57'),('063aba04-2c9a-42dd-a076-28c990bba3b9','11111111-1111-1111-1111-111111111111','DELETE_USER','Menghapus akun pengguna: User Temp Regression Updated (e5b0aed4-37dc-4915-bd3c-e039aea7f4d7) - Peran: student','2026-10-08 10:24:31'),('06f1cb5f-2ca1-45cf-b34a-143dd4ba80b5','11111111-1111-1111-1111-111111111111','LOGIN','Masuk ke sistem','2026-10-08 09:48:30'),('0a7491d0-25aa-42e8-9d21-cdf96abc4850','11111111-1111-1111-1111-111111111111','LOGIN','Masuk ke sistem','2026-10-08 13:16:46'),('0f2a7f36-ce1b-4c0d-9d03-2c69d9ff5cc3','00000000-0000-0000-0000-000000000001','DELETE_USER','Menghapus akun pengguna: Guru Penjaskes Senior (b8bc02de-404c-49b6-8916-7bcab47bcab9) - Peran: teacher','2026-10-07 12:45:42'),('153d0362-d97b-4fd6-877f-27fee2f25bc3','22222222-2222-2222-2222-222222222222','LOGIN','Masuk ke sistem','2026-10-08 10:50:07'),('1623d4b9-91a7-4ccb-af1f-08ee1ada9b7b','00000000-0000-0000-0000-000000000001','EDIT_USER','Mengedit akun pengguna: Guru Penjaskes Senior (1d52f6ab-751e-4de5-b898-c0b96a9b10d4)','2026-10-07 12:13:25'),('1f12c795-78ad-4f07-a570-6c007a2b2d16','22222222-2222-2222-2222-222222222222','LOGIN','Masuk ke sistem','2026-10-08 10:27:57'),('262f11cb-1c6c-4426-81ac-5c2b00c4dac2','22222222-2222-2222-2222-222222222222','LOGIN','Masuk ke sistem','2026-10-08 09:48:30'),('27425f99-dbc5-4d86-9d5f-548e4e130875','22222222-2222-2222-2222-222222222222','LOGIN','Masuk ke sistem','2026-10-08 10:24:31'),('28dbb38b-03f2-4d09-9b98-1fa5080c3e42','11111111-1111-1111-1111-111111111111','EDIT_USER','Mengedit akun pengguna: User Temp Regression (a85e2f28-dff6-4836-a85f-235ab3939631)','2026-10-08 10:50:07'),('2bff4fe5-a9e8-4e07-8409-86aa576be105','11111111-1111-1111-1111-111111111111','LOGIN','Masuk ke sistem','2026-10-08 10:50:07'),('2dc994eb-324f-46e7-abba-a2f0bc9698ee','11111111-1111-1111-1111-111111111111','LOGIN','Masuk ke sistem','2026-10-08 10:39:47'),('2ecdc3a5-1378-4d2f-8ef6-08b683f2b00f','11111111-1111-1111-1111-111111111111','CREATE_USER','Menambahkan pengguna baru: User Temp Regression (student) - temp_crud_1791430076@sinesa.com','2026-10-08 10:27:56'),('2ede93f9-19d9-4b47-96d5-65863ebfd3b3','00000000-0000-0000-0000-000000000001','EDIT_USER','Mengedit akun pengguna: Guru Penjaskes Baru (63fc72f5-06a2-487b-ba3b-718be5fc6a21)','2026-10-07 13:35:34'),('36fc72ad-b11c-451d-ac01-daa6277c0dcb','11111111-1111-1111-1111-111111111111','DELETE_USER','Menghapus akun pengguna: User Temp Regression Updated (95888e9c-f811-4042-8307-a5d09134515f) - Peran: student','2026-10-08 10:27:57'),('3742518e-4843-434a-adf1-457a0dd2b4d9','22222222-2222-2222-2222-222222222222','UPDATE_QUIZ','Memperbarui kuis: Kuis Evaluasi Tematik Kelas 5 - Edisi Revisi (0b3bb901-c18e-495f-85c8-0dcaaf6f737d)','2026-10-08 09:53:39'),('381aca51-b35a-4175-bb35-6e84109ad511','22222222-2222-2222-2222-222222222222','CREATE_QUIZ','Membuat kuis: Kuis Evaluasi Tematik Kelas 5 (0b3bb901-c18e-495f-85c8-0dcaaf6f737d)','2026-10-08 09:53:39'),('38fe620e-d89a-4794-ac34-0dde96a16802','11111111-1111-1111-1111-111111111111','DELETE_USER','Menghapus akun pengguna: User Temp Regression Updated (bae6e781-62ca-4a70-8fed-e67e2dd10cd1) - Peran: student','2026-10-08 10:38:10'),('397ec47a-3c80-42a3-af7c-bd8f5aba109f','00000000-0000-0000-0000-000000000001','SAVE_SETTINGS','Menyimpan konfigurasi pengaturan sekolah & sistem global','2026-10-07 12:11:57'),('3a3cd26d-f625-4fa0-b5f2-34432c979e64','11111111-1111-1111-1111-111111111111','DELETE_USER','Menghapus akun pengguna: User Temp Regression Updated (9cf43749-e04e-43e7-ae58-db134409a6fe) - Peran: student','2026-10-08 09:53:39'),('3a451b96-2438-4a68-bfce-a30a18105426','11111111-1111-1111-1111-111111111111','CREATE_USER','Menambahkan pengguna baru: User Temp Regression (student) - temp_crud_1791429870@sinesa.com','2026-10-08 10:24:31'),('3c494f5f-3cd4-4369-a7aa-e60fe6a467e8','11111111-1111-1111-1111-111111111111','CREATE_USER','Menambahkan pengguna baru: User Temp Regression (student) - temp_crud_1791430690@sinesa.com','2026-10-08 10:38:10'),('407636ca-febf-417a-9b4c-9d2fa1dacc9d','11111111-1111-1111-1111-111111111111','LOGIN','Masuk ke sistem','2026-10-08 10:00:34'),('4094648c-f2c0-4b5d-b042-68e42bf78d84','00000000-0000-0000-0000-000000000001','CREATE_USER','Menambahkan pengguna baru: Guru Penjaskes Baru (teacher) - penjaskes_1791349952@sinesa.com','2026-10-07 12:12:33'),('45bdb82e-917d-43fd-bc85-ae6b52d8d9c3','11111111-1111-1111-1111-111111111111','CREATE_USER','Menambahkan pengguna baru: User Temp Regression (student) - temp_crud_1791431407@sinesa.com','2026-10-08 10:50:07'),('48fda7b5-335d-4d1b-85ea-ac3ad6d49eec','22222222-2222-2222-2222-222222222222','LOGIN','Masuk ke sistem','2026-10-08 10:41:45'),('4aa66090-a5b0-4c39-ad4b-6c2b69bd3125','11111111-1111-1111-1111-111111111111','CREATE_USER','Menambahkan pengguna baru: User Temp Regression (student) - temp_crud_1791427815@sinesa.com','2026-10-08 09:50:15'),('4aa8b925-c799-4f35-923a-14e8f68658cc','33333333-3333-3333-3333-333333333333','LOGIN','Masuk ke sistem','2026-10-08 10:38:10'),('4ba55114-9dee-452b-ad1b-c50cc24f72f5','00000000-0000-0000-0000-000000000001','CREATE_USER','Menambahkan pengguna baru: Guru Penjaskes Baru (teacher) - penjaskes_1791350003@sinesa.com','2026-10-07 12:13:24'),('4da2893d-604f-4b38-9348-1d8063e59c92','00000000-0000-0000-0000-000000000001','SAVE_SETTINGS','Menyimpan konfigurasi pengaturan sekolah & sistem global','2026-10-07 13:35:36'),('4e6a4845-4a79-4014-a44e-70f0ab5b0b28','11111111-1111-1111-1111-111111111111','LOGIN','Masuk ke sistem','2026-10-08 09:50:15'),('4f978829-1f83-47fe-aae8-083c4f227b65','33333333-3333-3333-3333-333333333333','LOGIN','Masuk ke sistem','2026-10-08 09:50:16'),('5167beda-6218-42c0-a538-54c80dd3514e','00000000-0000-0000-0000-000000000001','EDIT_USER','Mengedit akun pengguna: Guru Penjaskes Baru (b8bc02de-404c-49b6-8916-7bcab47bcab9)','2026-10-07 12:45:41'),('5505bfd8-d1e4-4430-9146-00022f3e5ae7','11111111-1111-1111-1111-111111111111','SAVE_SETTINGS','Menyimpan konfigurasi pengaturan sekolah & sistem global','2026-10-08 10:38:10'),('5d4f0a87-6848-4fd1-9c39-2888795f0744','11111111-1111-1111-1111-111111111111','EDIT_USER','Mengedit akun pengguna: User Temp Regression (a4ca19f1-d76a-4319-98e9-54e4ca6723b3)','2026-10-08 13:16:46'),('67e0aec2-473e-4f20-882f-ced3688880a0','22222222-2222-2222-2222-222222222222','UPDATE_QUIZ','Memperbarui kuis: Kuis Evaluasi Tematik Kelas 5 - Edisi Revisi (f82ee308-48b0-453f-a389-427dff7285b2)','2026-10-08 10:38:10'),('69340725-32e3-4a2a-93a1-a7878cb4de5a','11111111-1111-1111-1111-111111111111','EDIT_USER','Mengedit akun pengguna: User Temp Regression (d1db8b86-8f1d-400c-bf30-02e5cc5a142a)','2026-10-08 10:00:34'),('6be603eb-c07f-456c-b479-b35d5ff21758','11111111-1111-1111-1111-111111111111','CREATE_USER','Menambahkan pengguna baru: User Temp Regression (student) - temp_crud_1791440206@sinesa.com','2026-10-08 13:16:46'),('6df208a4-ba3c-4588-b5af-5724710cf745','00000000-0000-0000-0000-000000000001','EDIT_USER','Mengedit akun pengguna: Guru Penjaskes Baru (9917342c-499f-4f70-b211-dd2b9f4eccae)','2026-10-07 12:11:56'),('6f120d53-587f-442e-af47-69ff2494f0bf','00000000-0000-0000-0000-000000000001','EDIT_USER','Mengedit akun pengguna: Guru Penjaskes Senior (ec983e2f-60dc-4c26-b604-7cf5b749b829)','2026-10-07 12:12:34'),('74e651d3-b5f9-41c2-b26e-105a631edfae','11111111-1111-1111-1111-111111111111','SAVE_SETTINGS','Menyimpan konfigurasi pengaturan sekolah & sistem global','2026-10-08 13:16:47'),('7836cdcf-7887-4044-90ac-b7a96de85ce0','22222222-2222-2222-2222-222222222222','CREATE_QUIZ','Membuat kuis: Kuis Evaluasi Tematik Kelas 5 (e6c15d75-fce8-40f1-bb56-3fe6e8b232d6)','2026-10-08 10:50:07'),('7a4b85c5-a845-46fe-8a6e-270a09d73c0c','11111111-1111-1111-1111-111111111111','SAVE_SETTINGS','Menyimpan konfigurasi pengaturan sekolah & sistem global','2026-10-08 10:50:07'),('7c01299c-5788-4bc3-95fd-b15fb404bcb3','00000000-0000-0000-0000-000000000001','EDIT_USER','Mengedit akun pengguna: Guru Penjaskes Senior (b8bc02de-404c-49b6-8916-7bcab47bcab9)','2026-10-07 12:45:41'),('7e5a7514-5bbc-440e-a872-bedf8ac322b9','22222222-2222-2222-2222-222222222222','LOGIN','Masuk ke sistem','2026-10-08 10:00:34'),('7f37968b-8f37-47de-b4f1-1762a5cd234e','11111111-1111-1111-1111-111111111111','SAVE_SETTINGS','Menyimpan konfigurasi pengaturan sekolah & sistem global','2026-10-08 10:27:57'),('824d2c7a-e435-4801-9947-c5744a0c88e8','11111111-1111-1111-1111-111111111111','CREATE_USER','Menambahkan pengguna baru: User Temp Regression (student) - temp_crud_1791428434@sinesa.com','2026-10-08 10:00:34'),('827bd49e-f5d8-424b-99f8-81777105fe17','00000000-0000-0000-0000-000000000001','SAVE_SETTINGS','Menyimpan konfigurasi pengaturan sekolah & sistem global','2026-10-07 12:12:35'),('833408f2-410b-4871-ba8a-129084e457f0','11111111-1111-1111-1111-111111111111','DELETE_USER','Menghapus akun pengguna: User Temp Regression Updated (a85e2f28-dff6-4836-a85f-235ab3939631) - Peran: student','2026-10-08 10:50:07'),('83a80a42-3538-4b7b-92ee-c23d8c6c6be7','00000000-0000-0000-0000-000000000001','EDIT_USER','Mengedit akun pengguna: Guru Penjaskes Baru (ec983e2f-60dc-4c26-b604-7cf5b749b829)','2026-10-07 12:12:33'),('85cb0737-872e-455f-ab9f-ca7849a67316','00000000-0000-0000-0000-000000000001','SAVE_SETTINGS','Menyimpan konfigurasi pengaturan sekolah & sistem global','2026-10-07 12:13:26'),('86fdec28-e945-4ddc-9ce2-db2eb6057d05','11111111-1111-1111-1111-111111111111','LOGIN','Masuk ke sistem','2026-10-08 10:27:56'),('89a9f2b3-7a37-48b0-8928-4a8bf8434b68','22222222-2222-2222-2222-222222222222','CREATE_QUIZ','Membuat kuis: Kuis Evaluasi Tematik Kelas 5 (fd0544a5-a59f-4c2f-ab1a-f269d5c4091d)','2026-10-08 10:24:31'),('8c51667b-b1b8-4a3a-a115-2927e0a58ccd','22222222-2222-2222-2222-222222222222','UPDATE_QUIZ','Memperbarui kuis: Kuis Evaluasi Tematik Kelas 5 - Edisi Revisi (fd0544a5-a59f-4c2f-ab1a-f269d5c4091d)','2026-10-08 10:24:31'),('8c8738ab-995f-4f54-bb5c-f3a879234dfa','33333333-3333-3333-3333-333333333333','LOGIN','Masuk ke sistem','2026-10-08 13:16:47'),('8cbe1927-0601-4826-b5dc-4b0583692e9b','33333333-3333-3333-3333-333333333333','LOGIN','Masuk ke sistem','2026-10-08 09:48:31'),('938dd438-2f9e-403d-b227-cb910218bc39','22222222-2222-2222-2222-222222222222','CREATE_QUIZ','Membuat kuis: Kuis Evaluasi Tematik Kelas 5 (35a5fdf4-05ff-4b34-8f83-4ecf6a719ffb)','2026-10-08 10:00:34'),('94dfb7e4-d4b5-4cf8-b65a-843c497e975b','22222222-2222-2222-2222-222222222222','LOGIN','Masuk ke sistem','2026-10-08 13:16:47'),('96b5afbc-9d6b-457b-917c-680367b4c54d','00000000-0000-0000-0000-000000000001','DELETE_USER','Menghapus akun pengguna: Guru Penjaskes Senior (9917342c-499f-4f70-b211-dd2b9f4eccae) - Peran: teacher','2026-10-07 12:11:56'),('97d92bf7-30b8-4fa9-8ee9-3793a181d306','22222222-2222-2222-2222-222222222222','LOGIN','Masuk ke sistem','2026-10-08 10:38:10'),('9ba238c4-7f66-4e6f-b612-d46585645403','00000000-0000-0000-0000-000000000001','DELETE_USER','Menghapus akun pengguna: Guru Penjaskes Senior (1d52f6ab-751e-4de5-b898-c0b96a9b10d4) - Peran: teacher','2026-10-07 12:13:25'),('9ffe610b-af76-49d8-9833-42589ecd3b61','11111111-1111-1111-1111-111111111111','SAVE_SETTINGS','Menyimpan konfigurasi pengaturan sekolah & sistem global','2026-10-08 09:50:15'),('a3bb128a-e257-467d-8eed-d408f31517c7','11111111-1111-1111-1111-111111111111','EDIT_USER','Mengedit akun pengguna: User Temp Regression (e5b0aed4-37dc-4915-bd3c-e039aea7f4d7)','2026-10-08 10:24:31'),('a7085d5e-cea0-4b6d-8b3c-01659baa73a9','22222222-2222-2222-2222-222222222222','UPDATE_QUIZ','Memperbarui kuis: Kuis Evaluasi Tematik Kelas 5 - Edisi Revisi (e6c15d75-fce8-40f1-bb56-3fe6e8b232d6)','2026-10-08 10:50:07'),('a8facd8f-fe91-49b0-9938-29bb2049cd68','22222222-2222-2222-2222-222222222222','UPDATE_QUIZ','Memperbarui kuis: Kuis Evaluasi Tematik Kelas 5 - Edisi Revisi (6bb7eccd-7146-4f55-852a-b544705f4d20)','2026-10-08 10:27:57'),('a912aa4f-d403-497f-9c60-fd1f148cb21f','11111111-1111-1111-1111-111111111111','EDIT_USER','Mengedit akun pengguna: User Temp Regression (bae6e781-62ca-4a70-8fed-e67e2dd10cd1)','2026-10-08 10:38:10'),('a95f43c3-0a72-494c-ac5c-603671d40365','11111111-1111-1111-1111-111111111111','LOGIN','Masuk ke sistem','2026-10-08 10:38:09'),('aa3cce40-54df-49f1-b19a-98091894871b','11111111-1111-1111-1111-111111111111','CREATE_USER','Menambahkan pengguna baru: User Temp Regression (student) - temp_crud_1791428019@sinesa.com','2026-10-08 09:53:39'),('ab74bf5e-2a85-408f-b49c-cf91a38b130f','22222222-2222-2222-2222-222222222222','UPDATE_QUIZ','Memperbarui kuis: Kuis Evaluasi Tematik Kelas 5 - Edisi Revisi (35a5fdf4-05ff-4b34-8f83-4ecf6a719ffb)','2026-10-08 10:00:34'),('b0a82ab2-3ef6-4d24-8cad-5704eccd0181','11111111-1111-1111-1111-111111111111','LOGIN','Masuk ke sistem','2026-10-08 09:53:38'),('b1366401-37d3-43f0-b240-7965216e829f','11111111-1111-1111-1111-111111111111','EDIT_USER','Mengedit akun pengguna: User Temp Regression (9cf43749-e04e-43e7-ae58-db134409a6fe)','2026-10-08 09:53:39'),('b78df1d2-1a4f-4785-a051-c959c504f54a','11111111-1111-1111-1111-111111111111','DELETE_USER','Menghapus akun pengguna: User Temp Regression Updated (a4ca19f1-d76a-4319-98e9-54e4ca6723b3) - Peran: student','2026-10-08 13:16:46'),('b8ce7544-57d4-4faf-8a7e-81b20def8e1a','22222222-2222-2222-2222-222222222222','LOGIN','Masuk ke sistem','2026-10-08 09:50:16'),('bc659926-cc21-4f50-812e-78d6062dd5b0','00000000-0000-0000-0000-000000000001','EDIT_USER','Mengedit akun pengguna: Guru Penjaskes Baru (1d52f6ab-751e-4de5-b898-c0b96a9b10d4)','2026-10-07 12:13:24'),('c4b6f7be-b0f2-496f-aecb-e8c425bf8918','00000000-0000-0000-0000-000000000001','SAVE_SETTINGS','Menyimpan konfigurasi pengaturan sekolah & sistem global','2026-10-07 12:45:43'),('c651a191-c1eb-4dfc-8f91-1e08b69caea6','11111111-1111-1111-1111-111111111111','LOGIN','Masuk ke sistem','2026-10-08 10:24:30'),('c9af48ba-9093-4ff9-a9ae-224116c37fe3','33333333-3333-3333-3333-333333333333','LOGIN','Masuk ke sistem','2026-10-08 10:27:57'),('c9f6c317-3f3a-497f-90f4-8a778712b0bc','22222222-2222-2222-2222-222222222222','CREATE_QUIZ','Membuat kuis: Kuis Evaluasi Tematik Kelas 5 (6bb7eccd-7146-4f55-852a-b544705f4d20)','2026-10-08 10:27:57'),('cd25d714-f75a-4b05-9138-58bb680bdd19','22222222-2222-2222-2222-222222222222','UPDATE_QUIZ','Memperbarui kuis: Kuis Evaluasi Tematik Kelas 5 - Edisi Revisi (3f3eeb8b-15a0-47c8-9d32-8a5a008508a4)','2026-10-08 13:16:47'),('d6dd6ac7-3393-47ec-bb93-ce2a615b088e','11111111-1111-1111-1111-111111111111','DELETE_USER','Menghapus akun pengguna: User Temp Regression Updated (d1db8b86-8f1d-400c-bf30-02e5cc5a142a) - Peran: student','2026-10-08 10:00:34'),('d767d7ba-aba2-46fe-ae67-3adcb2b28f9a','00000000-0000-0000-0000-000000000001','CREATE_USER','Menambahkan pengguna baru: Guru Penjaskes Baru (teacher) - penjaskes_1791351940@sinesa.com','2026-10-07 12:45:41'),('d76f9600-75e8-4987-9ad4-7e55c9aa739c','11111111-1111-1111-1111-111111111111','SAVE_SETTINGS','Menyimpan konfigurasi pengaturan sekolah & sistem global','2026-10-08 09:53:39'),('dc70d6c0-e155-480a-a257-fcfa44568b05','11111111-1111-1111-1111-111111111111','SAVE_SETTINGS','Menyimpan konfigurasi pengaturan sekolah & sistem global','2026-10-08 10:00:34'),('df65d6ab-20a4-4382-9343-e7db98603a50','00000000-0000-0000-0000-000000000001','CREATE_USER','Menambahkan pengguna baru: Guru Penjaskes Baru (teacher) - penjaskes_1791354933@sinesa.com','2026-10-07 13:35:34'),('dff3c26f-f421-44f0-8978-77adb9763fee','00000000-0000-0000-0000-000000000001','EDIT_USER','Mengedit akun pengguna: Guru Penjaskes Senior (9917342c-499f-4f70-b211-dd2b9f4eccae)','2026-10-07 12:11:56'),('e44ebca8-6171-4949-8116-ad64df909a32','00000000-0000-0000-0000-000000000001','EDIT_USER','Mengedit akun pengguna: Guru Penjaskes Senior (63fc72f5-06a2-487b-ba3b-718be5fc6a21)','2026-10-07 13:35:35'),('e4cc1cca-1fc2-4d75-bed4-8be15e190ab6','33333333-3333-3333-3333-333333333333','LOGIN','Masuk ke sistem','2026-10-08 10:24:31'),('e669f83c-dc53-429f-be1f-c71a9b90b532','33333333-3333-3333-3333-333333333333','LOGIN','Masuk ke sistem','2026-10-08 09:53:39'),('e6c47668-077c-48d0-afcc-89812623bff1','11111111-1111-1111-1111-111111111111','SAVE_SETTINGS','Menyimpan konfigurasi pengaturan sekolah & sistem global','2026-10-08 10:24:31'),('e90b8853-4eea-4894-a5fe-d6b811191055','00000000-0000-0000-0000-000000000001','CREATE_USER','Menambahkan pengguna baru: Guru Penjaskes Baru (teacher) - penjaskes_1791349915@sinesa.com','2026-10-07 12:11:55'),('eb872925-b8b4-475c-82cf-1f9585820162','22222222-2222-2222-2222-222222222222','CREATE_QUIZ','Membuat kuis: Kuis Evaluasi Tematik Kelas 5 (3f3eeb8b-15a0-47c8-9d32-8a5a008508a4)','2026-10-08 13:16:47'),('ecdb144c-3267-4e7d-8efd-dd2b5c484f3c','33333333-3333-3333-3333-333333333333','LOGIN','Masuk ke sistem','2026-10-08 10:00:34'),('ed4394f7-2c28-47df-912a-8402cf8d8e5c','33333333-3333-3333-3333-333333333333','LOGIN','Masuk ke sistem','2026-10-08 10:50:07'),('efad3fb9-4112-46f1-9c39-fd17d4caee05','22222222-2222-2222-2222-222222222222','LOGIN','Masuk ke sistem','2026-10-08 09:53:39'),('f2b50c97-6080-4ff0-9a50-025125e9a155','22222222-2222-2222-2222-222222222222','CREATE_QUIZ','Membuat kuis: Kuis Evaluasi Tematik Kelas 5 (f82ee308-48b0-453f-a389-427dff7285b2)','2026-10-08 10:38:10'),('f48c512f-7009-4445-9f83-3fd90b9fdcff','00000000-0000-0000-0000-000000000001','DELETE_USER','Menghapus akun pengguna: Guru Penjaskes Senior (ec983e2f-60dc-4c26-b604-7cf5b749b829) - Peran: teacher','2026-10-07 12:12:34'),('fff849df-240d-41f3-a48d-58432811506b','00000000-0000-0000-0000-000000000001','DELETE_USER','Menghapus akun pengguna: Guru Penjaskes Senior (63fc72f5-06a2-487b-ba3b-718be5fc6a21) - Peran: teacher','2026-10-07 13:35:35');
/*!40000 ALTER TABLE `activity_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `answers`
--

DROP TABLE IF EXISTS `answers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `answers` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `participant_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `question_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `selected_option_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `selected_option_ids` json DEFAULT NULL,
  `matching_answers` json DEFAULT NULL,
  `is_correct` tinyint(1) NOT NULL DEFAULT '0',
  `response_time_ms` int NOT NULL DEFAULT '0',
  `score_awarded` int NOT NULL DEFAULT '0',
  `answered_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_answers_participant_question` (`participant_id`,`question_id`),
  KEY `idx_answers_participant_id` (`participant_id`),
  KEY `idx_answers_question_id` (`question_id`),
  KEY `idx_answers_selected_option` (`selected_option_id`),
  CONSTRAINT `fk_answers_option` FOREIGN KEY (`selected_option_id`) REFERENCES `options` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_answers_participant` FOREIGN KEY (`participant_id`) REFERENCES `participants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_answers_question` FOREIGN KEY (`question_id`) REFERENCES `questions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `answers`
--

LOCK TABLES `answers` WRITE;
/*!40000 ALTER TABLE `answers` DISABLE KEYS */;
/*!40000 ALTER TABLE `answers` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 */ /*!50003 TRIGGER `trg_calculate_answer_score` BEFORE INSERT ON `answers` FOR EACH ROW BEGIN
    DECLARE v_is_correct TINYINT(1) DEFAULT 0;
    DECLARE v_points INT DEFAULT 0;

    
    IF NEW.selected_option_id IS NOT NULL THEN
        SELECT COALESCE(is_correct, 0) INTO v_is_correct
        FROM options
        WHERE id = NEW.selected_option_id
        LIMIT 1;

        SELECT COALESCE(points, 0) INTO v_points
        FROM questions
        WHERE id = NEW.question_id
        LIMIT 1;

        SET NEW.is_correct = v_is_correct;
        IF v_is_correct = 1 THEN
            SET NEW.score_awarded = v_points;
        ELSE
            SET NEW.score_awarded = 0;
        END IF;
    END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `media_files`
--

DROP TABLE IF EXISTS `media_files`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `media_files` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `stored_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_type` enum('image','audio','document') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `mime_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` bigint NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_media_stored_name` (`stored_name`),
  KEY `idx_media_files_user_id` (`user_id`),
  KEY `idx_media_files_file_type` (`file_type`),
  CONSTRAINT `fk_media_files_user` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `media_files`
--

LOCK TABLES `media_files` WRITE;
/*!40000 ALTER TABLE `media_files` DISABLE KEYS */;
INSERT INTO `media_files` VALUES ('035fd066-8a1e-420d-b655-cd285ca971fa','22222222-2222-2222-2222-222222222222','test_upload_sample.png','035fd066-8a1e-420d-b655-cd285ca971fa.png','/uploads/images/035fd066-8a1e-420d-b655-cd285ca971fa.png','image','image/png',70,'2026-10-08 10:50:07'),('1c3ea34e-a1a5-47bd-8ac3-926db5ab00b1','22222222-2222-2222-2222-222222222222','test_upload_sample.png','1c3ea34e-a1a5-47bd-8ac3-926db5ab00b1.png','/uploads/images/1c3ea34e-a1a5-47bd-8ac3-926db5ab00b1.png','image','image/png',70,'2026-10-08 09:53:39'),('4a5c5690-b800-4039-a75d-03105c10f510','22222222-2222-2222-2222-222222222222','test_upload_sample.png','4a5c5690-b800-4039-a75d-03105c10f510.png','/uploads/images/4a5c5690-b800-4039-a75d-03105c10f510.png','image','image/png',70,'2026-10-08 10:24:31'),('4c0a9083-c159-4634-87f4-609448ac12b6','22222222-2222-2222-2222-222222222222','test_upload_sample.png','4c0a9083-c159-4634-87f4-609448ac12b6.png','/uploads/images/4c0a9083-c159-4634-87f4-609448ac12b6.png','image','image/png',70,'2026-10-08 09:50:16'),('73f16117-c5f1-4ec3-8193-8192c2089375','22222222-2222-2222-2222-222222222222','test_upload_sample.png','73f16117-c5f1-4ec3-8193-8192c2089375.png','/uploads/images/73f16117-c5f1-4ec3-8193-8192c2089375.png','image','image/png',70,'2026-10-08 10:38:10'),('8e521136-975b-4ba6-9016-5567a7d84baf','22222222-2222-2222-2222-222222222222','test_upload_sample.png','8e521136-975b-4ba6-9016-5567a7d84baf.png','/uploads/images/8e521136-975b-4ba6-9016-5567a7d84baf.png','image','image/png',70,'2026-10-08 10:00:34'),('a67f3539-f36c-4c1b-9274-8f98de6328e6','22222222-2222-2222-2222-222222222222','test_upload_sample.png','a67f3539-f36c-4c1b-9274-8f98de6328e6.png','/uploads/images/a67f3539-f36c-4c1b-9274-8f98de6328e6.png','image','image/png',70,'2026-10-08 13:16:47'),('d0eb9200-91e7-4ba4-af9c-8b5e56ec1a6b','22222222-2222-2222-2222-222222222222','test_upload_sample.png','d0eb9200-91e7-4ba4-af9c-8b5e56ec1a6b.png','/uploads/images/d0eb9200-91e7-4ba4-af9c-8b5e56ec1a6b.png','image','image/png',70,'2026-10-08 10:27:57');
/*!40000 ALTER TABLE `media_files` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `options`
--

DROP TABLE IF EXISTS `options`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `options` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `question_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `option_text` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_correct` tinyint(1) NOT NULL DEFAULT '0',
  `match_text` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_options_question_id` (`question_id`),
  KEY `idx_options_correct` (`question_id`,`is_correct`),
  CONSTRAINT `fk_options_question` FOREIGN KEY (`question_id`) REFERENCES `questions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `options`
--

LOCK TABLES `options` WRITE;
/*!40000 ALTER TABLE `options` DISABLE KEYS */;
INSERT INTO `options` VALUES ('0e49cced-7f16-434b-8d05-a415ed7bf173','cfe89d83-600c-452f-bf2d-b2406af82d07','2',1,NULL,'2026-06-25 06:10:32'),('2af185f6-bae2-4ae0-a064-ea5377cd37f3','639a3739-9c21-41a1-b844-fd9c1f72e8d7','0',0,NULL,'2026-07-14 15:10:00'),('353b88c9-192b-43d8-ab1c-d9362b6fa349','88ebb3ca-10e9-4d4a-b49d-2c48d0058c82','4',1,NULL,'2026-07-14 04:39:03'),('382ed87c-03fe-444c-ae31-9e5dc36bab7f','7fc1bd45-4b03-4d35-a1eb-0941b4ff4522','2',0,NULL,'2026-07-14 06:08:48'),('3af6161e-ac86-4415-b735-de8421e8a9f5','7acfb52d-5895-4219-858a-740d95b5edf7','3',0,NULL,'2026-07-13 07:48:02'),('3bac9235-a9c0-484b-b4c9-b1b989d5631a','4a6eb137-e036-4067-b28c-3f0cfd53273a','3',0,NULL,'2026-07-14 04:39:03'),('758194be-1614-4d91-813a-612907f56480','cfe89d83-600c-452f-bf2d-b2406af82d07','3',0,NULL,'2026-06-25 06:10:32'),('804ae236-0eef-47eb-9ed7-2b8cbcd485ea','ba3485c5-f2c1-4968-a9a5-5b14cf218a47','2',1,NULL,'2026-05-24 03:43:42'),('8ff11856-a784-4f61-8bc4-18d079e5b664','6837093f-abe3-46b1-9fc4-a1be7cf31e2b','3',0,NULL,'2026-07-14 06:08:48'),('9784117d-b370-4ff8-8c2f-55383edd996e','d94464b2-4abc-4354-9b10-ff3380eb85b7','1',0,NULL,'2026-07-14 15:10:01'),('99f37522-63ef-4bc1-9003-3ee526bc84f3','7acfb52d-5895-4219-858a-740d95b5edf7','2',1,NULL,'2026-07-13 07:48:02'),('9d4bda62-be74-4c23-8e58-de1ff2a3659b','639a3739-9c21-41a1-b844-fd9c1f72e8d7','0',1,NULL,'2026-07-14 15:10:00'),('b07727e7-9d1a-4ef1-8847-1738ae4d7f76','88ebb3ca-10e9-4d4a-b49d-2c48d0058c82','5',0,NULL,'2026-07-14 04:39:03'),('b55a15db-c69c-4d8f-9002-b85c18e4c73b','6837093f-abe3-46b1-9fc4-a1be7cf31e2b','2',1,NULL,'2026-07-14 06:08:48'),('c6422a01-b923-4cf7-873a-82986e77c78a','9ea59381-77c2-4d7d-b18b-840216edbc16','2',1,NULL,'2026-07-13 07:41:58'),('c6458a16-5589-48bd-9a00-47d93d4e17f7','d94464b2-4abc-4354-9b10-ff3380eb85b7','2',1,NULL,'2026-07-14 15:10:01'),('c7c0b2fb-bf5e-4abe-8c73-5273b99f111a','7fc1bd45-4b03-4d35-a1eb-0941b4ff4522','2',1,NULL,'2026-07-14 06:08:48'),('c89128ab-3ca5-4832-82e2-5e9ce6e3198c','4a6eb137-e036-4067-b28c-3f0cfd53273a','2',1,NULL,'2026-07-14 04:39:03'),('c9e45f24-98a7-4891-951c-81068111d7ad','9ea59381-77c2-4d7d-b18b-840216edbc16','3',0,NULL,'2026-07-13 07:41:58'),('f1d1819e-e470-4fda-9660-b809bfe354db','7c51ddc0-1230-487c-a3e9-550945bd3c43','4',1,NULL,'2026-07-14 04:33:36'),('fe0cf633-0bb9-455f-98e3-5e55155443f9','7c51ddc0-1230-487c-a3e9-550945bd3c43','5',0,NULL,'2026-07-14 04:33:36');
/*!40000 ALTER TABLE `options` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `participants`
--

DROP TABLE IF EXISTS `participants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `participants` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `session_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `student_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `display_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `score` int NOT NULL DEFAULT '0',
  `lives` int NOT NULL DEFAULT '3',
  `skipped_questions` json DEFAULT NULL,
  `question_status` json DEFAULT NULL,
  `current_progress` int NOT NULL DEFAULT '0',
  `violation_count` int NOT NULL DEFAULT '0',
  `is_completed` tinyint(1) NOT NULL DEFAULT '0',
  `joined_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_participants_session_display` (`session_id`,`display_name`),
  KEY `idx_participants_session_id` (`session_id`),
  KEY `idx_participants_student_id` (`student_id`),
  KEY `idx_participants_leaderboard` (`session_id`,`score` DESC),
  CONSTRAINT `fk_participants_session` FOREIGN KEY (`session_id`) REFERENCES `quiz_sessions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_participants_student` FOREIGN KEY (`student_id`) REFERENCES `profiles` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `participants`
--

LOCK TABLES `participants` WRITE;
/*!40000 ALTER TABLE `participants` DISABLE KEYS */;
INSERT INTO `participants` VALUES ('00000000-0000-4000-8000-361438623273','f538c163-736c-4bcf-87fe-43f15a8b65e9',NULL,'TestAnonStudent',0,3,'[]','[]',1,0,0,'2026-06-29 02:40:38'),('1368289c-bb70-417b-bf78-0af6ec588134','25e15a48-84fa-4261-89ac-7c8e6c7943ed','65ab83a4-be85-4565-b518-0fb783337215','budi',0,3,'[]','[]',0,0,0,'2026-07-14 06:57:06'),('2d1fc7c2-8b60-4444-9cda-f074c13be6dc','0bb54e2f-94ee-4279-8f19-b08cdb6ab82e','378c481f-76bf-4e9d-adbb-a6f7e2cc5952','Yudi Santosa',0,3,'[]','[]',0,0,0,'2026-07-14 06:09:20'),('30ace098-d0c9-41a3-949b-3ca0dc1d3a06','f538c163-736c-4bcf-87fe-43f15a8b65e9','65ab83a4-be85-4565-b518-0fb783337215','budi',0,3,'[]','[]',0,0,0,'2026-05-24 03:48:01'),('479b20a6-49be-4a34-b84a-10d8422f196f','a04c177a-f178-438e-a168-9e4b27ae703a','4b7cd3e0-bf17-4655-8bcb-ec4117f7bd19','Murid Debug',0,3,'[]','[]',0,0,0,'2026-07-14 04:45:26'),('4f5f86bc-9efa-406d-b87c-c0585dade376','d2571289-337f-4e84-9230-a7df4364bb3e','65ab83a4-be85-4565-b518-0fb783337215','budi',200,3,'[]','{\"68035d69-f404-4bc3-8a01-8859531b2c3c\": \"answered\", \"75517dcf-3626-4d83-97ee-7f0bcd292bd9\": \"answered\"}',0,0,0,'2026-07-14 14:54:03'),('6c9c97e7-7415-4db9-b3f6-78fe1cc62c67','f538c163-736c-4bcf-87fe-43f15a8b65e9',NULL,'Test Realtime 8038',0,3,'[]','[]',0,0,0,'2026-07-07 13:19:34'),('766e12c8-a957-4921-a374-7f92c8325370','2c7418b6-985f-465c-8bb9-e0d17022a7c1','65ab83a4-be85-4565-b518-0fb783337215','budibudi',100,3,'[]','{\"68035d69-f404-4bc3-8a01-8859531b2c3c\": \"answered\", \"75517dcf-3626-4d83-97ee-7f0bcd292bd9\": \"answered\"}',0,0,0,'2026-07-14 13:54:11'),('7a86f8e3-f0f3-4281-89ed-a15b6e089b3c','72b5862f-3e4a-433b-ac07-54e46673f209','65ab83a4-be85-4565-b518-0fb783337215','budi',100,3,'[]','{\"68035d69-f404-4bc3-8a01-8859531b2c3c\": \"answered\", \"75517dcf-3626-4d83-97ee-7f0bcd292bd9\": \"answered\"}',0,0,0,'2026-07-14 15:03:07'),('898c5039-0b4c-4b28-a003-7960501fe4d9','7ab75f2b-7f9c-4252-9bde-c5660feb2c22','65ab83a4-be85-4565-b518-0fb783337215','budi',0,3,'[]','[]',0,0,0,'2026-07-14 14:15:21'),('a4211f60-2e77-4149-8798-21cfba08114f','67093669-e39a-4814-b415-dcf4841aba44','4b7cd3e0-bf17-4655-8bcb-ec4117f7bd19','Murid DebugMurid Debug',0,3,'[]','[]',0,0,0,'2026-07-14 04:35:19'),('a83467f4-a846-442f-9422-f1a42d68bbc6','25e15a48-84fa-4261-89ac-7c8e6c7943ed','378c481f-76bf-4e9d-adbb-a6f7e2cc5952','Yudi Santosa',100,3,'[]','{\"68035d69-f404-4bc3-8a01-8859531b2c3c\": \"answered\", \"75517dcf-3626-4d83-97ee-7f0bcd292bd9\": \"answered\"}',0,0,0,'2026-07-14 06:59:27'),('af4e91e3-b0a2-4fed-a3f8-9a0b3def7a89','7ab75f2b-7f9c-4252-9bde-c5660feb2c22','378c481f-76bf-4e9d-adbb-a6f7e2cc5952','Yudi Santosa',200,3,'[]','{\"68035d69-f404-4bc3-8a01-8859531b2c3c\": \"answered\", \"75517dcf-3626-4d83-97ee-7f0bcd292bd9\": \"answered\"}',0,0,0,'2026-07-14 14:18:20'),('bb864144-6156-47c4-9b19-955992a4395e','81706b91-b6d7-4166-9fa6-4e347e24c46f','65ab83a4-be85-4565-b518-0fb783337215','budi',100,3,'[]','{\"177b1dc4-1465-4a61-8cfa-482166c35954\": \"answered\"}',0,1,0,'2026-07-14 15:05:33'),('cab09b67-03e1-41d6-ba0d-de81bd2f12a5','ff5cb14a-a814-4efb-b987-164e2200315a','65ab83a4-be85-4565-b518-0fb783337215','budi',200,3,'[]','{\"639a3739-9c21-41a1-b844-fd9c1f72e8d7\": \"answered\", \"d94464b2-4abc-4354-9b10-ff3380eb85b7\": \"answered\"}',0,1,0,'2026-07-14 15:10:28'),('e9a19185-0579-4c73-bb04-9f469d6bdb09','a04c177a-f178-438e-a168-9e4b27ae703a','4b7cd3e0-bf17-4655-8bcb-ec4117f7bd19','Murid DebugMurid Debug',100,3,'[]','{\"4a6eb137-e036-4067-b28c-3f0cfd53273a\": \"answered\", \"88ebb3ca-10e9-4d4a-b49d-2c48d0058c82\": \"answered\"}',0,0,0,'2026-07-14 04:41:04'),('f7950d8f-a476-411f-992d-6002dc0208fa','876a201b-f7b3-46a6-bd1a-6d411bc9a0bc','4b7cd3e0-bf17-4655-8bcb-ec4117f7bd19','Murid DebugMurid Debug',0,3,'[]','{\"7acfb52d-5895-4219-858a-740d95b5edf7\": \"answered\"}',0,0,0,'2026-07-13 07:59:37');
/*!40000 ALTER TABLE `participants` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `profiles`
--

DROP TABLE IF EXISTS `profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `profiles` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('admin','teacher','student') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'student',
  `full_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `username` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `avatar_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_profiles_email` (`email`),
  UNIQUE KEY `uq_profiles_username` (`username`),
  KEY `idx_profiles_role` (`role`),
  KEY `idx_profiles_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `profiles`
--

LOCK TABLES `profiles` WRITE;
/*!40000 ALTER TABLE `profiles` DISABLE KEYS */;
INSERT INTO `profiles` VALUES ('00000000-0000-0000-0000-000000000001','admin','Administrator SINESA','admin@sinesa.com','$2y$10$dtqhuVmniybTLq4AfkRKAe4V7nybmL7krtIKYht5ZVjo.gi1ow01G','admin',NULL,'active','2026-10-07 10:54:38','2026-10-08 14:29:52'),('00000000-0000-0000-0000-000000000002','teacher','Guru Pertiwi Tester','pertiwi_test@sinesa.com','$2y$10','pertiwitest',NULL,'active','2026-10-07 12:41:11','2026-10-07 12:41:11'),('00000000-0000-0000-0000-000000000003','student','Budi Santoso Terupdate','budi_test@sinesa.com','$2y$10','budi_updated_1791355562',NULL,'active','2026-10-07 12:41:11','2026-10-07 13:46:02'),('11111111-1111-1111-1111-111111111111','admin','Administrator Regression','regression_admin@sinesa.com','$2y$10$PJ2DBsaKzIauJRtfj4mir.D8m33MnHsTeyDngv8.FEhSDbOfOLIG6','reg_admin',NULL,'active','2026-10-08 09:48:30','2026-10-08 13:16:46'),('1ca6afb4-a4eb-4903-976b-5fe0b38bef4e','teacher','Guru Pengajar','teacher_1ca6afb4@sinesa.local','$2y$10$w8w2h02aM7gU1Y3v6x.C/euP0kI3Q4xPjJqB5R5g1d9u6K8p2z4O6',NULL,NULL,'active','2026-10-07 13:25:31','2026-10-07 13:25:31'),('2164db44-350e-4b9b-93c7-69b09b8dbb6b','teacher','Guru Pengajar','teacher_2164db44@sinesa.local','$2y$10$w8w2h02aM7gU1Y3v6x.C/euP0kI3Q4xPjJqB5R5g1d9u6K8p2z4O6',NULL,NULL,'active','2026-10-07 13:25:31','2026-10-07 13:25:31'),('22222222-2222-2222-2222-222222222222','teacher','Ibu Guru Pertiwi M.Pd','regression_teacher@sinesa.com','$2y$10$PJ2DBsaKzIauJRtfj4mir.D8m33MnHsTeyDngv8.FEhSDbOfOLIG6','reg_teacher',NULL,'active','2026-10-08 09:48:30','2026-10-08 13:16:47'),('26f39082-3108-41fd-8867-6e516af0e80a','teacher','Guru Pengajar','teacher_26f39082@sinesa.local','$2y$10$w8w2h02aM7gU1Y3v6x.C/euP0kI3Q4xPjJqB5R5g1d9u6K8p2z4O6',NULL,NULL,'active','2026-10-07 13:25:31','2026-10-07 13:25:31'),('29109c56-da85-4bf4-becb-a707f4e3a20b','teacher','Guru Pengajar','teacher_29109c56@sinesa.local','$2y$10$w8w2h02aM7gU1Y3v6x.C/euP0kI3Q4xPjJqB5R5g1d9u6K8p2z4O6',NULL,NULL,'active','2026-10-07 13:25:31','2026-10-07 13:25:31'),('33333333-3333-3333-3333-333333333333','student','Siswa Budi Santoso','regression_student@sinesa.com','$2y$10$PJ2DBsaKzIauJRtfj4mir.D8m33MnHsTeyDngv8.FEhSDbOfOLIG6','reg_student',NULL,'active','2026-10-08 09:48:30','2026-10-08 13:16:46'),('378c481f-76bf-4e9d-adbb-a6f7e2cc5952','student','Yudi Santosa','student_378c481f@sinesa.local','$2y$10$w8w2h02aM7gU1Y3v6x.C/euP0kI3Q4xPjJqB5R5g1d9u6K8p2z4O6',NULL,NULL,'active','2026-10-07 13:25:31','2026-10-07 13:25:31'),('4b7cd3e0-bf17-4655-8bcb-ec4117f7bd19','student','Murid DebugMurid Debug','student_4b7cd3e0@sinesa.local','$2y$10$w8w2h02aM7gU1Y3v6x.C/euP0kI3Q4xPjJqB5R5g1d9u6K8p2z4O6',NULL,NULL,'active','2026-10-07 13:25:31','2026-10-07 13:25:31'),('65ab83a4-be85-4565-b518-0fb783337215','student','budi','student_65ab83a4@sinesa.local','$2y$10$w8w2h02aM7gU1Y3v6x.C/euP0kI3Q4xPjJqB5R5g1d9u6K8p2z4O6',NULL,NULL,'active','2026-10-07 13:25:31','2026-10-07 13:25:31'),('da544f24-1b45-40b8-88dc-1a418ed6ae2d','teacher','Guru Pengajar','teacher_da544f24@sinesa.local','$2y$10$w8w2h02aM7gU1Y3v6x.C/euP0kI3Q4xPjJqB5R5g1d9u6K8p2z4O6',NULL,NULL,'active','2026-10-07 13:25:31','2026-10-07 13:25:31'),('e763f0fa-588e-4720-a940-91904a0048b7','teacher','Guru Pengajar','teacher_e763f0fa@sinesa.local','$2y$10$w8w2h02aM7gU1Y3v6x.C/euP0kI3Q4xPjJqB5R5g1d9u6K8p2z4O6',NULL,NULL,'active','2026-10-07 13:25:31','2026-10-07 13:25:31'),('fd86258e-bad0-4fe0-b73f-72387bf185fc','student','User Temp Regression','temp_crud_1791427815@sinesa.com','$2y$10$gzmJGR0hT5iDoyaFEdlDMuUWgcW8.2UiZittOA8Npss8rCLpO35lq','temp_1791427815','https://api.dicebear.com/7.x/adventurer/svg?seed=User+Temp+Regression','active','2026-10-08 09:50:15','2026-10-08 09:50:15'),('http-tchr-0153bcf9','teacher','Guru HTTP Test','http_http-tchr-0153bcf9@test.id','hash','uname_http-tchr-0153bcf9',NULL,'active','2026-10-07 10:57:05','2026-10-07 10:57:05'),('http-tchr-1739425f','teacher','Guru HTTP Test','http_http-tchr-1739425f@test.id','hash','uname_http-tchr-1739425f',NULL,'active','2026-10-07 10:59:08','2026-10-07 10:59:08'),('http-tchr-87cd7789','teacher','Guru HTTP Test','http_http-tchr-87cd7789@test.id','hash','uname_http-tchr-87cd7789',NULL,'active','2026-10-07 10:57:24','2026-10-07 10:57:24'),('http-tchr-8d029204','teacher','Guru HTTP Test','http_http-tchr-8d029204@test.id','hash','uname_http-tchr-8d029204',NULL,'active','2026-10-07 10:58:04','2026-10-07 10:58:04'),('http-tchr-9eca934a','teacher','Guru HTTP Test','http_http-tchr-9eca934a@test.id','hash','uname_http-tchr-9eca934a',NULL,'active','2026-10-07 10:58:39','2026-10-07 10:58:39'),('http-tchr-a21192bc','teacher','Guru HTTP Test','http_http-tchr-a21192bc@test.id','hash','uname_http-tchr-a21192bc',NULL,'active','2026-10-07 10:57:42','2026-10-07 10:57:42'),('http-tchr-c2dc8d1e','teacher','Guru HTTP Test','http_http-tchr-c2dc8d1e@test.id','hash','uname_http-tchr-c2dc8d1e',NULL,'active','2026-10-07 10:56:37','2026-10-07 10:56:37'),('tchr-sse-54e216b2','teacher','Guru SSE','tchr_tchr-sse-54e216b2@test.id','hash',NULL,NULL,'active','2026-10-07 11:24:26','2026-10-07 11:24:26'),('tchr-sse-c9d445e2','teacher','Guru SSE','tchr_tchr-sse-c9d445e2@test.id','hash',NULL,NULL,'active','2026-10-07 11:25:43','2026-10-07 11:25:43'),('test-teacher-46497b6e','teacher','Guru Penguji','teacher_test-teacher-46497b6e@test.id','hash','teacher_test-teacher-46497b6e',NULL,'active','2026-10-07 10:55:05','2026-10-07 10:55:05'),('test-teacher-9289c803','teacher','Guru Test','guru_1791348434@test.com','hash','guru_1791348434',NULL,'active','2026-10-07 11:47:14','2026-10-07 11:47:14'),('test-teacher-ba286121','teacher','Guru Test','guru_1791348394@test.com','hash','guru_1791348394',NULL,'active','2026-10-07 11:46:34','2026-10-07 11:46:34');
/*!40000 ALTER TABLE `profiles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `questions`
--

DROP TABLE IF EXISTS `questions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `questions` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `quiz_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `question_text` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `question_type` enum('multiple_choice','true_false','multiple_answer','matching') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'multiple_choice',
  `media_type` enum('text','image','audio','video','latex') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'text',
  `media_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `points` int NOT NULL DEFAULT '100',
  `order_index` int NOT NULL DEFAULT '0',
  `explanation` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_questions_quiz_id` (`quiz_id`),
  KEY `idx_questions_order` (`quiz_id`,`order_index`),
  CONSTRAINT `fk_questions_quiz` FOREIGN KEY (`quiz_id`) REFERENCES `quizzes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `questions`
--

LOCK TABLES `questions` WRITE;
/*!40000 ALTER TABLE `questions` DISABLE KEYS */;
INSERT INTO `questions` VALUES ('4a6eb137-e036-4067-b28c-3f0cfd53273a','1c2e9ad0-6169-4830-b455-a9ade695ff20','Berapa 1 + 1?','multiple_choice','text',NULL,100,0,NULL,'2026-07-14 04:39:03'),('639a3739-9c21-41a1-b844-fd9c1f72e8d7','e7e9d2cb-895a-46ad-b9c4-7ac2f99cd594','1-1','multiple_choice','image','https://sinesa-sdn012bakcip.com/uploads/quiz-images/caf59551-9cfe-4144-b3ca-32bbfa180275.webp',100,0,NULL,'2026-07-14 15:10:00'),('6837093f-abe3-46b1-9fc4-a1be7cf31e2b','de32d800-aee2-4156-a200-499274df7dc1','1-0','multiple_choice','text',NULL,100,0,NULL,'2026-07-14 06:08:48'),('7acfb52d-5895-4219-858a-740d95b5edf7','038b14c7-ffff-4380-9acb-e3c4dc3f2485','Berapa 1 + 1?','multiple_choice','text',NULL,100,0,NULL,'2026-07-13 07:48:02'),('7c51ddc0-1230-487c-a3e9-550945bd3c43','0f7084fd-e8d6-4469-ae4b-d2f747578fbb','Berapa 2 + 2?','multiple_choice','text',NULL,100,0,NULL,'2026-07-14 04:33:36'),('7fc1bd45-4b03-4d35-a1eb-0941b4ff4522','de32d800-aee2-4156-a200-499274df7dc1','2=2','multiple_choice','text',NULL,100,1,NULL,'2026-07-14 06:08:48'),('88ebb3ca-10e9-4d4a-b49d-2c48d0058c82','1c2e9ad0-6169-4830-b455-a9ade695ff20','Berapa 2 + 2?','multiple_choice','text',NULL,100,1,NULL,'2026-07-14 04:39:03'),('9ea59381-77c2-4d7d-b18b-840216edbc16','c9f71fba-ce29-4663-8874-e8897d328497','Berapa 1 + 1?','multiple_choice','text',NULL,100,0,NULL,'2026-07-13 07:41:58'),('ba3485c5-f2c1-4968-a9a5-5b14cf218a47','ee0283bc-6aad-432e-960e-b793e251694a','What is 1 + 1?','multiple_choice','text',NULL,100,0,NULL,'2026-05-24 03:43:41'),('cfe89d83-600c-452f-bf2d-b2406af82d07','1aba1e3b-0158-44c8-9677-c8e985ad19e8','1 + 1 = ?','multiple_choice','text',NULL,100,0,NULL,'2026-06-25 06:10:31'),('d94464b2-4abc-4354-9b10-ff3380eb85b7','e7e9d2cb-895a-46ad-b9c4-7ac2f99cd594','2-2','multiple_choice','video','https://sinesa-sdn012bakcip.com/uploads/quiz-videos/17e069e3-06f6-4874-94ba-302c540d811c.mp4',100,1,NULL,'2026-07-14 15:10:00'),('q1-970c068d','test-quiz-9a0548a4','Berapa 10 + 10?','multiple_choice','text',NULL,100,0,NULL,'2026-10-07 11:47:14');
/*!40000 ALTER TABLE `questions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `quiz_sessions`
--

DROP TABLE IF EXISTS `quiz_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quiz_sessions` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `quiz_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `host_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('lobby','active','completed') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'lobby',
  `current_stage` enum('waiting','countdown','question','question_result','leaderboard','finished') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'waiting',
  `current_question_index` int NOT NULL DEFAULT '-1',
  `question_started_at` datetime(3) DEFAULT NULL,
  `question_expires_at` datetime(3) DEFAULT NULL,
  `quiz_mode` enum('serius','santai') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'serius',
  `lives_count` int NOT NULL DEFAULT '3',
  `show_final_result` tinyint(1) NOT NULL DEFAULT '1',
  `show_leaderboard` tinyint(1) NOT NULL DEFAULT '1',
  `show_correct_answer` tinyint(1) NOT NULL DEFAULT '1',
  `show_answer_review` tinyint(1) NOT NULL DEFAULT '1',
  `show_question_result` tinyint(1) NOT NULL DEFAULT '1',
  `show_explanation` tinyint(1) NOT NULL DEFAULT '1',
  `show_score_per_question` tinyint(1) NOT NULL DEFAULT '1',
  `show_question_statistics` tinyint(1) NOT NULL DEFAULT '1',
  `anti_cheat_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `fullscreen_required` tinyint(1) NOT NULL DEFAULT '0',
  `auto_submit_on_violation` int NOT NULL DEFAULT '3',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sessions_quiz_id` (`quiz_id`),
  KEY `idx_sessions_host_id` (`host_id`),
  KEY `idx_sessions_status` (`status`),
  KEY `idx_sessions_active_lookup` (`quiz_id`,`status`),
  CONSTRAINT `fk_sessions_host` FOREIGN KEY (`host_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_sessions_quiz` FOREIGN KEY (`quiz_id`) REFERENCES `quizzes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `quiz_sessions`
--

LOCK TABLES `quiz_sessions` WRITE;
/*!40000 ALTER TABLE `quiz_sessions` DISABLE KEYS */;
INSERT INTO `quiz_sessions` VALUES ('09aa5ca8-625e-4b7e-855c-71a0b3db7a1b','1aba1e3b-0158-44c8-9677-c8e985ad19e8','e763f0fa-588e-4720-a940-91904a0048b7','lobby','waiting',-1,NULL,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'2026-06-25 06:11:15',NULL),('0bb54e2f-94ee-4279-8f19-b08cdb6ab82e','de32d800-aee2-4156-a200-499274df7dc1','da544f24-1b45-40b8-88dc-1a418ed6ae2d','active','countdown',0,NULL,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'2026-07-14 06:08:54',NULL),('1ba442f1-aff9-434e-b113-36823e8da32b','bff45f6c-7d71-4c27-b883-68656d374eb7','26f39082-3108-41fd-8867-6e516af0e80a','active','waiting',-1,NULL,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'2026-05-24 03:43:28',NULL),('2224beba-c448-44e0-b420-4b08135ca9d2','quiz-sse-81a36cd5','tchr-sse-54e216b2','lobby','waiting',-1,NULL,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'2026-10-07 11:24:26',NULL),('25e15a48-84fa-4261-89ac-7c8e6c7943ed','e7e9d2cb-895a-46ad-b9c4-7ac2f99cd594','da544f24-1b45-40b8-88dc-1a418ed6ae2d','completed','finished',1,'2026-07-14 06:59:54.000','2026-07-14 07:00:28.000','serius',3,1,1,1,1,1,1,1,1,0,0,3,'2026-07-14 06:51:16','2026-07-14 07:00:32'),('2c7418b6-985f-465c-8bb9-e0d17022a7c1','e7e9d2cb-895a-46ad-b9c4-7ac2f99cd594','da544f24-1b45-40b8-88dc-1a418ed6ae2d','completed','finished',1,'2026-07-14 13:55:21.000','2026-07-14 13:55:48.000','serius',3,1,1,1,1,1,1,1,1,0,0,3,'2026-07-14 07:00:52','2026-07-14 13:56:14'),('66ea76a9-552d-4332-acdc-8f960ead45af','test-quiz-c55d0a74','test-teacher-46497b6e','lobby','waiting',-1,NULL,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'2026-10-07 10:55:05',NULL),('67093669-e39a-4814-b415-dcf4841aba44','0f7084fd-e8d6-4469-ae4b-d2f747578fbb','2164db44-350e-4b9b-93c7-69b09b8dbb6b','active','question_result',0,'2026-07-14 04:35:34.000','2026-07-14 04:36:03.000','serius',3,1,1,1,1,1,1,1,1,0,0,3,'2026-07-14 04:33:45',NULL),('72b5862f-3e4a-433b-ac07-54e46673f209','e7e9d2cb-895a-46ad-b9c4-7ac2f99cd594','da544f24-1b45-40b8-88dc-1a418ed6ae2d','completed','finished',1,'2026-07-14 15:03:34.000','2026-07-14 15:04:05.000','serius',3,1,1,1,1,1,1,1,1,0,0,3,'2026-07-14 15:02:57','2026-07-14 15:04:14'),('7aaafb31-ace2-4e3c-a51c-333405443835','c9f71fba-ce29-4663-8874-e8897d328497','1ca6afb4-a4eb-4903-976b-5fe0b38bef4e','lobby','waiting',-1,NULL,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'2026-07-13 07:42:14',NULL),('7ab75f2b-7f9c-4252-9bde-c5660feb2c22','e7e9d2cb-895a-46ad-b9c4-7ac2f99cd594','da544f24-1b45-40b8-88dc-1a418ed6ae2d','completed','finished',1,'2026-07-14 14:18:55.000','2026-07-14 14:19:19.000','serius',3,1,1,1,1,1,1,1,1,0,0,3,'2026-07-14 14:14:59','2026-07-14 14:19:25'),('81706b91-b6d7-4166-9fa6-4e347e24c46f','e7e9d2cb-895a-46ad-b9c4-7ac2f99cd594','da544f24-1b45-40b8-88dc-1a418ed6ae2d','completed','finished',1,'2026-07-14 15:06:47.000','2026-07-14 15:06:58.000','serius',3,1,1,1,1,1,1,1,1,1,0,3,'2026-07-14 15:04:52','2026-07-14 15:07:23'),('876a201b-f7b3-46a6-bd1a-6d411bc9a0bc','038b14c7-ffff-4380-9acb-e3c4dc3f2485','2164db44-350e-4b9b-93c7-69b09b8dbb6b','active','question_result',0,'2026-07-13 08:17:19.000','2026-07-13 08:17:49.000','serius',3,1,1,1,1,1,1,1,1,0,0,3,'2026-07-13 07:48:14',NULL),('9767e4cd-a071-41fb-9a62-78fa3e863b8d','http-quiz-135cbc37','http-tchr-1739425f','lobby','waiting',-1,NULL,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'2026-10-07 10:59:09',NULL),('99edbb90-21a0-414d-ba03-d0af9f7de27b','ee0283bc-6aad-432e-960e-b793e251694a','29109c56-da85-4bf4-becb-a707f4e3a20b','active','waiting',0,'2026-05-24 03:43:40.000','2026-05-24 03:44:10.000','serius',3,1,1,1,1,1,1,1,1,0,0,3,'2026-05-24 03:43:42',NULL),('a04c177a-f178-438e-a168-9e4b27ae703a','1c2e9ad0-6169-4830-b455-a9ade695ff20','2164db44-350e-4b9b-93c7-69b09b8dbb6b','active','leaderboard',1,'2026-07-14 04:41:51.000','2026-07-14 04:42:01.000','serius',3,1,1,1,1,1,1,1,1,0,0,3,'2026-07-14 04:39:20',NULL),('d2571289-337f-4e84-9230-a7df4364bb3e','e7e9d2cb-895a-46ad-b9c4-7ac2f99cd594','da544f24-1b45-40b8-88dc-1a418ed6ae2d','completed','finished',1,'2026-07-14 14:54:34.000','2026-07-14 14:54:49.000','serius',3,1,1,1,1,1,1,1,1,0,0,3,'2026-07-14 14:52:55','2026-07-14 14:55:01'),('ea49ee4f-ff50-4404-836c-3e59ea7000f5','quiz-sse-e0cdc6f8','tchr-sse-c9d445e2','lobby','waiting',-1,NULL,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'2026-10-07 11:25:43',NULL),('f538c163-736c-4bcf-87fe-43f15a8b65e9','ee0283bc-6aad-432e-960e-b793e251694a','da544f24-1b45-40b8-88dc-1a418ed6ae2d','lobby','waiting',-1,NULL,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'2026-05-24 03:47:50',NULL),('ff5cb14a-a814-4efb-b987-164e2200315a','e7e9d2cb-895a-46ad-b9c4-7ac2f99cd594','da544f24-1b45-40b8-88dc-1a418ed6ae2d','completed','finished',1,'2026-07-14 15:11:08.000','2026-07-14 15:11:28.000','serius',3,1,1,1,1,1,1,1,1,1,1,3,'2026-07-14 15:10:05','2026-07-14 15:11:35'),('test-session-1791351768','test-quiz-1791351768','00000000-0000-0000-0000-000000000002','active','question',-1,NULL,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'2026-10-07 12:42:48',NULL);
/*!40000 ALTER TABLE `quiz_sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `quizzes`
--

DROP TABLE IF EXISTS `quizzes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quizzes` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `teacher_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `opening_text` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `closing_text` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `pin_code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `duration_per_question` int NOT NULL DEFAULT '30',
  `random_questions` tinyint(1) NOT NULL DEFAULT '0',
  `random_options` tinyint(1) NOT NULL DEFAULT '0',
  `thumbnail_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quiz_mode` enum('serius','santai') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'serius',
  `lives_count` int NOT NULL DEFAULT '3',
  `show_final_result` tinyint(1) NOT NULL DEFAULT '1',
  `show_leaderboard` tinyint(1) NOT NULL DEFAULT '1',
  `show_correct_answer` tinyint(1) NOT NULL DEFAULT '1',
  `show_answer_review` tinyint(1) NOT NULL DEFAULT '1',
  `show_question_result` tinyint(1) NOT NULL DEFAULT '1',
  `show_explanation` tinyint(1) NOT NULL DEFAULT '1',
  `show_score_per_question` tinyint(1) NOT NULL DEFAULT '1',
  `show_question_statistics` tinyint(1) NOT NULL DEFAULT '1',
  `anti_cheat_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `fullscreen_required` tinyint(1) NOT NULL DEFAULT '0',
  `auto_submit_on_violation` int NOT NULL DEFAULT '3',
  `status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_quizzes_pin_code` (`pin_code`),
  KEY `idx_quizzes_teacher_id` (`teacher_id`),
  KEY `idx_quizzes_status` (`status`),
  KEY `idx_quizzes_created_at` (`created_at` DESC),
  CONSTRAINT `fk_quizzes_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `quizzes`
--

LOCK TABLES `quizzes` WRITE;
/*!40000 ALTER TABLE `quizzes` DISABLE KEYS */;
INSERT INTO `quizzes` VALUES ('038b14c7-ffff-4380-9acb-e3c4dc3f2485','2164db44-350e-4b9b-93c7-69b09b8dbb6b','Kuis Debug 2','Deskripsi Kuis Debug 2',NULL,NULL,'288754',30,0,0,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'active','2026-07-13 07:48:01','2026-07-13 07:48:01'),('0f7084fd-e8d6-4469-ae4b-d2f747578fbb','2164db44-350e-4b9b-93c7-69b09b8dbb6b','Kuis Debug Realtime','Kuis untuk debug realtime',NULL,NULL,'766158',30,0,0,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'active','2026-07-14 04:33:36','2026-07-14 04:33:36'),('1aba1e3b-0158-44c8-9677-c8e985ad19e8','e763f0fa-588e-4720-a940-91904a0048b7','Kuis Matematika Pertamaku','Kuis matematika dasar untuk uji coba',NULL,NULL,'825854',30,0,0,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'active','2026-06-25 06:10:31','2026-06-25 06:10:31'),('1c2e9ad0-6169-4830-b455-a9ade695ff20','2164db44-350e-4b9b-93c7-69b09b8dbb6b','Kuis Multi Soal','Kuis untuk testing realtime.',NULL,NULL,'485426',10,0,0,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'active','2026-07-14 04:39:03','2026-07-14 04:39:03'),('bff45f6c-7d71-4c27-b883-68656d374eb7','26f39082-3108-41fd-8867-6e516af0e80a','Test Quiz RLS',NULL,NULL,NULL,'132059',30,0,0,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'active','2026-05-24 03:43:28','2026-05-24 03:43:28'),('c9f71fba-ce29-4663-8874-e8897d328497','1ca6afb4-a4eb-4903-976b-5fe0b38bef4e','Kuis Debug','Deskripsi Kuis Debug',NULL,NULL,'856901',30,0,0,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'active','2026-07-13 07:41:57','2026-07-13 07:41:57'),('de32d800-aee2-4156-a200-499274df7dc1','da544f24-1b45-40b8-88dc-1a418ed6ae2d','MTK 1','MTK 1',NULL,NULL,'369603',30,0,0,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'active','2026-07-14 06:08:48','2026-07-14 06:08:48'),('e7e9d2cb-895a-46ad-b9c4-7ac2f99cd594','da544f24-1b45-40b8-88dc-1a418ed6ae2d','IPA 1','IPA 1','bismillah','alhamdulillah','416714',30,0,0,'https://sinesa-sdn012bakcip.com/uploads/thumbnails/f52e7501-4abb-48cf-a80b-4debf2400f21.webp','serius',3,1,1,1,1,1,1,1,1,1,1,3,'active','2026-07-14 06:50:35','2026-07-14 06:50:35'),('ee0283bc-6aad-432e-960e-b793e251694a','29109c56-da85-4bf4-becb-a707f4e3a20b','Test Quiz RLS Flow',NULL,NULL,NULL,'805849',30,0,0,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'active','2026-05-24 03:43:41','2026-05-24 03:43:41'),('http-quiz-135cbc37','http-tchr-1739425f','Kuis HTTP Integrasi',NULL,NULL,NULL,'778791',30,0,0,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'active','2026-10-07 10:59:08','2026-10-07 10:59:08'),('http-quiz-2d813e01','http-tchr-87cd7789','Kuis HTTP Integrasi',NULL,NULL,NULL,'876324',30,0,0,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'active','2026-10-07 10:57:24','2026-10-07 10:57:24'),('http-quiz-88efa4ab','http-tchr-c2dc8d1e','Kuis HTTP Integrasi',NULL,NULL,NULL,'665419',30,0,0,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'active','2026-10-07 10:56:37','2026-10-07 10:56:37'),('http-quiz-b5e1948d','http-tchr-a21192bc','Kuis HTTP Integrasi',NULL,NULL,NULL,'495721',30,0,0,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'active','2026-10-07 10:57:42','2026-10-07 10:57:42'),('http-quiz-d42ca031','http-tchr-8d029204','Kuis HTTP Integrasi',NULL,NULL,NULL,'739622',30,0,0,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'active','2026-10-07 10:58:04','2026-10-07 10:58:04'),('http-quiz-da60ed91','http-tchr-9eca934a','Kuis HTTP Integrasi',NULL,NULL,NULL,'744963',30,0,0,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'active','2026-10-07 10:58:39','2026-10-07 10:58:39'),('http-quiz-e52d5f4d','http-tchr-0153bcf9','Kuis HTTP Integrasi',NULL,NULL,NULL,'585859',30,0,0,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'active','2026-10-07 10:57:05','2026-10-07 10:57:05'),('quiz-sse-81a36cd5','tchr-sse-54e216b2','Kuis Realtime SSE',NULL,NULL,NULL,'954201',30,0,0,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'active','2026-10-07 11:24:26','2026-10-07 11:24:26'),('quiz-sse-e0cdc6f8','tchr-sse-c9d445e2','Kuis Realtime SSE',NULL,NULL,NULL,'831943',30,0,0,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'active','2026-10-07 11:25:43','2026-10-07 11:25:43'),('test-quiz-1791351673','00000000-0000-0000-0000-000000000002','Kuis Leaderboard Test',NULL,NULL,NULL,'998877',30,0,0,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'active','2026-10-07 12:41:13','2026-10-07 12:41:13'),('test-quiz-1791351768','00000000-0000-0000-0000-000000000002','Kuis Leaderboard Test',NULL,NULL,NULL,'840551',30,0,0,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'active','2026-10-07 12:42:48','2026-10-07 12:42:48'),('test-quiz-9a0548a4','test-teacher-9289c803','Kuis Realtime SSE Test',NULL,NULL,NULL,'933233',30,0,0,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'active','2026-10-07 11:47:14','2026-10-07 11:47:14'),('test-quiz-c55d0a74','test-teacher-46497b6e','Kuis Evaluasi Matematika',NULL,NULL,NULL,'478000',30,0,0,NULL,'serius',3,1,1,1,1,1,1,1,1,0,0,3,'active','2026-10-07 10:55:05','2026-10-07 10:55:05');
/*!40000 ALTER TABLE `quizzes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `settings`
--

DROP TABLE IF EXISTS `settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `settings` (
  `key` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `settings`
--

LOCK TABLES `settings` WRITE;
/*!40000 ALTER TABLE `settings` DISABLE KEYS */;
INSERT INTO `settings` VALUES ('allow_guest_participants','true','2026-10-08 13:16:47'),('allow_student_registration','true','2026-10-08 13:16:47'),('app_logo','https://api.dicebear.com/7.x/shapes/svg?seed=sinesa','2026-07-14 08:20:04'),('app_name','SINESA','2026-07-14 08:20:04'),('app_title','SINESA - Sistem Nilai Dan Evaluasi Siswa Aktif','2026-10-07 10:54:38'),('default_anti_cheat_enabled','false','2026-07-14 08:20:04'),('default_leaderboard_enabled','true','2026-07-14 08:20:04'),('default_question_duration','30','2026-10-07 10:54:38'),('default_show_final_result','true','2026-07-14 08:20:04'),('registration_enabled','true','2026-10-07 13:35:36'),('school_address','Jl. Babakan Ciparay No. 12, Bandung','2026-10-07 13:35:36'),('school_name','SDN 012 Babakan Ciparay Bandung','2026-10-08 13:16:47'),('school_npsn','20219584','2026-10-07 13:35:36'),('theme_color','blue','2026-07-14 08:20:04');
/*!40000 ALTER TABLE `settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Temporary view structure for view `system_settings`
--

DROP TABLE IF EXISTS `system_settings`;
/*!50001 DROP VIEW IF EXISTS `system_settings`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `system_settings` AS SELECT 
 1 AS `key`,
 1 AS `value`,
 1 AS `updated_at`*/;
SET character_set_client = @saved_cs_client;

--
-- Final view structure for view `system_settings`
--

/*!50001 DROP VIEW IF EXISTS `system_settings`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_general_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */

/*!50001 VIEW `system_settings` AS select `settings`.`key` AS `key`,`settings`.`value` AS `value`,`settings`.`updated_at` AS `updated_at` from `settings` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-08 14:30:07


SET FOREIGN_KEY_CHECKS = 1;
