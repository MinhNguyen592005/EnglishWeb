"""Import exactly 10 existing course questions per level into the placement bank.
No questions are generated. The selection is spread over the existing modules.
Never overwrite a migration that has already been applied.
"""
import importlib.util
import json
import argparse
import sys
from pathlib import Path

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('study_content', Path(__file__).with_name('build.py'))
course = importlib.util.module_from_spec(spec)
spec.loader.exec_module(course)
target = course.ROOT / 'source/server/src/main/resources/db/migration/V22__study_placement_questions.sql'


def generate():
    notes = course.lesson_content()
    statements = ['-- Fifty existing course questions, ten per level. No runtime question generation.']
    for level in course.course_outline():
        banks = [[q for lesson in module['lessons'] for q in notes[lesson['id']]['questions']] for module in level['modules']]
        selected = []
        index = 0
        while len(selected) < 10:
            for bank in banks:
                if index < len(bank) and len(selected) < 10:
                    selected.append(bank[index])
            index += 1
        assert len({q['id'] for q in selected}) == 10
        for q in selected:
            statements.append(course.insert('study_entry_questions', ['id','level_id','prompt','options_json','correct_option','source_question_id'],
                ['entry-'+q['id'],level['id'],q['prompt'],json.dumps(q['options'],ensure_ascii=False),q['correctOption'],q['id']],
                ['level_id','prompt','options_json','correct_option','source_question_id']))
    return '\n'.join(statements)+'\n'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    output = generate()
    if args.check:
        assert target.read_text(encoding='utf-8') == output
    else:
        with target.open('x', encoding='utf-8', newline='\n') as f:
            f.write(output)
    print('Valid placement bank: 50 existing questions, 10 per level.')
