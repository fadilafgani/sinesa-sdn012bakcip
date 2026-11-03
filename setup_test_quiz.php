<?php
require_once __DIR__ . '/public/api/config/database.php';

$pdo = get_db();
$teacherId = '22222222-2222-2222-2222-222222222222'; // regression_teacher
$quizId = 'quiz-uat-timeout-5q';

// Insert or replace quiz
$pdo->prepare("DELETE FROM options WHERE question_id IN (SELECT id FROM questions WHERE quiz_id = :qid)")->execute([':qid' => $quizId]);
$pdo->prepare("DELETE FROM questions WHERE quiz_id = :qid")->execute([':qid' => $quizId]);
$pdo->prepare("DELETE FROM quiz_sessions WHERE quiz_id = :qid")->execute([':qid' => $quizId]);
$pdo->prepare("DELETE FROM quizzes WHERE id = :qid")->execute([':qid' => $quizId]);

$insQz = $pdo->prepare("
    INSERT INTO quizzes (id, teacher_id, title, description, pin_code, duration_per_question, created_at)
    VALUES (:id, :tid, 'Kuis UAT Timeout 5 Soal', 'Kuis khusus untuk pengujian UAT timeout dan completion status', '998877', 30, NOW())
");
$insQz->execute([':id' => $quizId, ':tid' => $teacherId]);

for ($i = 1; $i <= 5; $i++) {
    $qid = "q-uat-timeout-{$i}";
    $pdo->prepare("
        INSERT INTO questions (id, quiz_id, question_text, question_type, points, duration, order_index)
        VALUES (:id, :qid, :txt, 'multiple_choice', 100, 30, :idx)
    ")->execute([
        ':id'  => $qid,
        ':qid' => $quizId,
        ':txt' => "Pertanyaan Soal {$i} UAT Timeout",
        ':idx' => $i
    ]);

    for ($o = 1; $o <= 4; $o++) {
        $optId = "opt-uat-timeout-{$i}-{$o}";
        $isCorr = ($o === 1) ? 1 : 0;
        $pdo->prepare("
            INSERT INTO options (id, question_id, option_text, is_correct)
            VALUES (:id, :qid, :txt, :corr)
        ")->execute([
            ':id'   => $optId,
            ':qid'  => $qid,
            ':txt'  => "Pilihan {$o} Soal {$i}" . ($isCorr ? " (Benar)" : " (Salah)"),
            ':corr' => $isCorr
        ]);
    }
}

echo "SUCCESS: Created quiz {$quizId} with 5 questions and 20 options.\n";

