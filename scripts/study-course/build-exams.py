"""Compile and validate the independent assessment bank; never overwrite an applied migration."""
import argparse
import importlib.util
import json
import random
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('study_content', Path(__file__).with_name('build.py'))
course = importlib.util.module_from_spec(spec)
spec.loader.exec_module(course)
target = course.ROOT / 'source/server/src/main/resources/db/migration/V29__independent_exams_and_ranked_pair_limits.sql'


def normalized(prompt):
    return re.sub(r'\s+', ' ', prompt.strip().casefold())


def bank():
    modules = {m['id']: m for level in course.course_outline() for m in level['modules']}
    practice = {normalized(q['prompt']) for note in course.lesson_content().values() for q in note['questions']}
    result, seen, module = {}, set(), None
    for line in (course.CONTENT / 'exams.txt').read_text(encoding='utf-8').splitlines():
        if not line.strip() or line.startswith('#'):
            continue
        if line.startswith('@'):
            module = line[1:]
            assert module in modules and module not in result, f'Unknown/repeated module: {module}'
            result[module] = []
            continue
        fields = [part.strip() for part in line.split('||')]
        assert module and len(fields) == 6 and all(fields), f'Malformed assessment row: {line}'
        contexts, correct, *rest = fields
        wrong, explanation = rest[:3], rest[3]
        assert len({correct, *wrong}) == 4, f'Duplicate options: {line}'
        prompts = contexts.split('~~')
        assert len(prompts) == 2
        for prompt in prompts:
            key = normalized(prompt)
            assert prompt.count('___') == 1 and key not in seen and key not in practice, f'Repeated/practice prompt: {prompt}'
            seen.add(key)
            question_id = f'exam-{module}-q{len(result[module])+1:02}'
            options = [correct, *wrong]
            random.Random(question_id).shuffle(options)
            result[module].append({'id': question_id, 'prompt': prompt, 'options': options,
                                   'correctOption': 'ABCD'[options.index(correct)], 'explanation': explanation})
    assert set(result) == set(modules) and all(len(rows) == 10 for rows in result.values())
    assert len(seen) == 280
    return result


def generate():
    questions = bank()
    sql = ['-- Independent original assessments. Existing attempts retain their snapshots.',
           'ALTER TABLE arena_rooms ADD COLUMN settled_at TIMESTAMP(6) NULL, ADD INDEX ix_ranked_pair_history (host_id,guest_id,is_matchmade,status,settled_at);',
           "UPDATE arena_rooms SET settled_at=coalesce(match_deadline_at,created_at) WHERE status='FINISHED';",
           '''CREATE TABLE study_exam_questions (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  module_id VARCHAR(30) NOT NULL,
  prompt TEXT NOT NULL,
  options_json JSON NOT NULL,
  correct_option CHAR(1) NOT NULL,
  explanation TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_exam_question_module FOREIGN KEY(module_id) REFERENCES study_modules(id),
  INDEX ix_exam_module (module_id,active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;''']
    columns = ['id', 'module_id', 'prompt', 'options_json', 'correct_option', 'explanation']
    for module, rows in questions.items():
        for q in rows:
            sql.append(course.insert('study_exam_questions', columns,
                                     [q['id'], module, q['prompt'], json.dumps(q['options'], ensure_ascii=False), q['correctOption'], q['explanation']], columns[1:]))
    # Placement no longer repeats lesson exercises; completed and in-progress snapshots stay intact.
    sql.append('DELETE FROM study_entry_questions;')
    for level in course.course_outline():
        groups = [questions[m['id']] for m in level['modules']]
        selected = [q for i in range(10) for group in groups for q in group[i:i+1]][:10]
        for q in selected:
            sql.append(course.insert('study_entry_questions', ['id', 'level_id', 'prompt', 'options_json', 'correct_option', 'source_question_id'],
                                     ['entry-'+q['id'], level['id'], q['prompt'], json.dumps(q['options'], ensure_ascii=False), q['correctOption'], q['id']],
                                     ['level_id', 'prompt', 'options_json', 'correct_option', 'source_question_id']))
    sql.append("UPDATE study_lessons SET content_json=json_set(content_json,'$.summary',replace(json_unquote(json_extract(content_json,'$.summary')),'nộp đủ câu sẽ hoàn thành bài.','cần đạt ít nhất 80% số câu để hoàn thành bài.'));")
    return '\n'.join(sql)+'\n'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    output = generate()
    if args.check:
        assert target.read_text(encoding='utf-8') == output
    else:
        with target.open('x', encoding='utf-8', newline='\n') as file:
            file.write(output)
    print('Valid independent bank: 280 questions, 10 per module; 50 placement questions; no overlap with lesson prompts.')
