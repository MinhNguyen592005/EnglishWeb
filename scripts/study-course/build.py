"""Compile original course content into a NEW Flyway data migration.

Use --check to verify the committed migration. New content releases must use a new
migration version; this command refuses to overwrite an existing migration.
"""
import argparse
import json
import random
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = Path(__file__).resolve().parent / 'content'
DEFAULT_MIGRATION = ROOT / 'source/server/src/main/resources/db/migration/V20__study_course_content.sql'


def course_outline():
    # STUDY.md is the agreed curriculum; preserve its 120 original topic codes.
    lines = (ROOT / 'STUDY.md').read_text(encoding='utf-8-sig').splitlines()
    levels, level, module = [], None, None
    for i, line in enumerate(lines):
        match = re.match(r'^LEVEL ([1-5]) [—–-] (.+)$', line)
        if match:
            level = {'id': int(match[1]), 'title': match[2].capitalize(), 'outcome': lines[i+1].removeprefix('Mục tiêu: ').strip(), 'modules': []}
            levels.append(level)
        elif level and (match := re.match(r'^Module (\d+) [—–-] (.+)$', line)):
            module = {'id': f'l{level["id"]}-m{match[1]}', 'title': match[2], 'position': int(match[1]), 'lessons': []}
            level['modules'].append(module)
        elif level and module and re.fullmatch(r'\d+\.\d+', line):
            module['lessons'].append({'id': line, 'title': lines[i+1], 'scope': lines[i+2]})
    assert [len(l['modules']) for l in levels] == [4, 7, 6, 5, 6]
    assert [sum(len(m['lessons']) for m in l['modules']) for l in levels] == [18, 34, 31, 26, 11]
    return levels


def lesson_content():
    result = {}
    for path in sorted(CONTENT.glob('level*.txt')):
        for block in path.read_text(encoding='utf-8').split('@')[1:]:
            lines = [s.strip() for s in block.strip().splitlines() if s.strip()]
            code, rule, structure, *exercise_lines = lines
            assert code not in result, f'Duplicate topic: {code}'
            assert len(exercise_lines) == 3, f'{code}: exactly three fixed questions required'
            questions, examples, mistakes = [], [], []
            for i, exercise in enumerate(exercise_lines):
                fields = [s.strip() for s in exercise.split('||')]
                assert len(fields) == 6, f'{code}: malformed exercise {i+1}'
                prompt, answer, *rest = fields
                distractors, translation = rest[:3], rest[3]
                assert '___' in prompt and all(fields) and len(set([answer, *distractors])) == 4, f'{code}: invalid choices'
                sentence = prompt.split(': ', 1)[-1].replace('___', answer)
                if sentence.strip() == answer and prompt.startswith('Chọn'):
                    sentence = answer
                if prompt.startswith('Chọn') and ': ' not in prompt:
                    sentence = answer
                examples.append({'english': sentence, 'vietnamese': translation})
                options = [answer, *distractors]
                random.Random(f'{code}:{i}').shuffle(options)
                questions.append({'id': f'{code}-q{i+1}', 'prompt': prompt, 'options': options, 'correctOption': 'ABCD'[options.index(answer)], 'explanation': f'Đáp án: {answer}. {rule} Mẫu cần nhớ: {structure}'})
                if i == 0:
                    wrong = prompt.split(': ', 1)[-1].replace('___', distractors[0])
                    if prompt.startswith('Chọn'):
                        wrong = distractors[0]
                    mistakes.append({'wrong': wrong, 'right': sentence, 'explanation': rule})
            result[code] = {'rule': rule, 'structure': structure, 'examples': examples, 'mistakes': mistakes, 'questions': questions}
    assert len(result) == 120, f'Expected 120 topics, got {len(result)}'
    return result


def sql_string(value):
    # Hex literals are independent of MySQL SQL mode (quotes and backslashes).
    return "CONVERT(X'" + str(value).encode('utf-8').hex() + "' USING utf8mb4)"


def insert(table, columns, values, updates):
    encoded = ','.join(str(v) if isinstance(v, int) else sql_string(v) for v in values)
    return f'INSERT INTO {table} ({",".join(columns)}) VALUES ({encoded}) ON DUPLICATE KEY UPDATE ' + ','.join(f'{c}=VALUES({c})' for c in updates) + ';'


def generate():
    outline, notes = course_outline(), lesson_content()
    ids = {lesson['id'] for level in outline for module in level['modules'] for lesson in module['lessons']}
    assert ids == set(notes), f'Content/outline mismatch: {ids ^ set(notes)}'
    statements = ['-- Generated from STUDY.md and scripts/study-course/content. Original Vietnamese explanations and exercises.', '-- Updates course content only. Existing attempts keep their original question snapshots.']
    styles = ['aqua', 'violet', 'coral', 'gold', 'mint']
    for level in outline:
        statements.append(insert('study_levels', ['id','title','outcome','planet_style'], [level['id'],level['title'],level['outcome'],styles[level['id']-1]], ['title','outcome','planet_style']))
        for module in level['modules']:
            statements.append(insert('study_modules', ['id','level_id','ordinal_no','title'], [module['id'],level['id'],module['position'],module['title']], ['level_id','ordinal_no','title']))
            for position, lesson in enumerate(module['lessons'], 1):
                note = notes[lesson['id']]
                previous = module['lessons'][position-2] if position > 1 else None
                content = {'objective': f'Hiểu và vận dụng {lesson["title"].lower()} trong câu và ngữ cảnh quen thuộc.',
                    'prerequisites': [{'id': previous['id'], 'title': previous['title']}] if previous else [],
                    'sections': [{'title': 'Kiến thức và cách dùng', 'body': note['rule']}, {'title': 'Cấu trúc và quy tắc', 'body': note['structure']}, {'title': 'Các nội dung trong chủ điểm', 'body': lesson['scope']}],
                    'examples': note['examples'], 'mistakes': note['mistakes'],
                    'application': f'Viết 3 câu hoặc một hội thoại ngắn về bản thân, sử dụng kiến thức bài “{lesson["title"]}”. Gạch chân cấu trúc được dùng và tự giải thích vì sao phù hợp. Đối chiếu với ví dụ và lỗi thường gặp bên trên.',
                    'summary': f'{note["structure"]} Khi chọn cấu trúc, kiểm tra ý nghĩa, chủ ngữ và mốc thời gian. Điểm luyện tập giúp bạn ôn lại; nộp đủ câu sẽ hoàn thành bài.'}
                statements.append(insert('study_lessons', ['id','module_id','ordinal_no','title','content_json','questions_json'], [lesson['id'],module['id'],position,lesson['title'],json.dumps(content, ensure_ascii=False),json.dumps(note['questions'], ensure_ascii=False)], ['module_id','ordinal_no','title','content_json','questions_json']))
    return '\n'.join(statements) + '\n'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--migration', type=Path, default=DEFAULT_MIGRATION)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    target = args.migration.resolve()
    expected_parent = DEFAULT_MIGRATION.parent.resolve()
    if target.parent != expected_parent or not re.fullmatch(r'V\d+__study_[a-z_]+\.sql', target.name):
        parser.error('Migration must be a V<number>__study_<name>.sql inside the server migration directory')
    output = generate()
    if args.check:
        assert target.read_text(encoding='utf-8') == output, 'Migration is out of sync with course content'
        print('Valid: 5 levels, 28 modules, 120 lessons, 360 fixed questions; migration matches content.')
    else:
        with target.open('x', encoding='utf-8', newline='\n') as handle:
            handle.write(output)
        print(f'Created {target.name}: 5 levels, 28 modules, 120 lessons, 360 fixed questions.')
